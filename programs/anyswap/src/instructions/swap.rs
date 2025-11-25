use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// AnySwap 交换账户结构
#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,
    
    /// Pool authority PDA - 用于管理所有 vault
    /// CHECK: PDA derived from pool key, used as token account owner
    #[account(
        seeds = [b"anyswap_authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,
    
    /// 输入 token 的 vault 账户
    #[account(
        mut,
        constraint = vault_in.owner == pool_authority.key(),
        constraint = vault_in.mint == user_in.mint,
    )]
    pub vault_in: Box<Account<'info, TokenAccount>>,
    
    /// 输出 token 的 vault 账户
    #[account(
        mut,
        constraint = vault_out.owner == pool_authority.key(),
    )]
    pub vault_out: Box<Account<'info, TokenAccount>>,
    
    /// 用户的输入代币账户（转出代币）
    #[account(mut, has_one = owner)]
    pub user_in: Box<Account<'info, TokenAccount>>,
    
    /// 用户的输出代币账户（接收代币）
    #[account(mut, has_one = owner)]
    pub user_out: Box<Account<'info, TokenAccount>>,
    
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

/// AnySwap 交换代币
/// 使用恒定乘积和公式：Σ(vault * weight) = constant
/// 公式：amount_in * weight_in = amount_out * weight_out
pub fn swap_anyswap(
    ctx: Context<Swap>,
    amount_in: u64,
    min_amount_out: u64,
) -> Result<()> {
    // 检查用户余额
    require!(
        ctx.accounts.user_in.amount >= amount_in,
        ErrorCode::InsufficientTokenAmount
    );
    
    // 加载 pool
    let pool = ctx.accounts.pool.load()?;
    
    // 从 vault 账户获取 mint 地址
    let mint_in_key = ctx.accounts.vault_in.mint;
    let mint_out_key = ctx.accounts.vault_out.mint;
    
    // 查找 token 索引
    let token_in_index = pool.find_token_index(&mint_in_key)
        .ok_or(ErrorCode::InvalidTokenMint)?;
    let token_out_index = pool.find_token_index(&mint_out_key)
        .ok_or(ErrorCode::InvalidTokenMint)?;
    
    require!(token_in_index != token_out_index, ErrorCode::SameTokenSwap);
    
    // 验证 vault 账户
    let token_in = pool.get_token(token_in_index)
        .ok_or(ErrorCode::InvalidTokenIndex)?;
    let token_out = pool.get_token(token_out_index)
        .ok_or(ErrorCode::InvalidTokenIndex)?;
    
    require!(
        token_in.vault_pubkey().to_bytes() == ctx.accounts.vault_in.key().to_bytes(),
        ErrorCode::InvalidTokenMint
    );
    require!(
        token_out.vault_pubkey().to_bytes() == ctx.accounts.vault_out.key().to_bytes(),
        ErrorCode::InvalidTokenMint
    );
    
    // 获取当前储备量
    let reserve_in = ctx.accounts.vault_in.amount;
    let reserve_out = ctx.accounts.vault_out.amount;
    
    require!(
        reserve_in > 0 && reserve_out > 0,
        ErrorCode::InsufficientLiquidity
    );
    
    // 使用 pool 计算手续费
    let (_fee_amount, amount_in_minus_fees) = pool.calculate_fee(amount_in)?;
    
    // 使用 pool 计算交换输出（基于扣除手续费后的输入）
    // amount_out = (amount_in_minus_fees * weight_in) / weight_out
    let amount_out = pool.calculate_swap_output(
        token_in_index,
        token_out_index,
        amount_in_minus_fees,
    )?;
    
    // 检查输出数量是否足够
    require!(
        amount_out >= min_amount_out,
        ErrorCode::InsufficientOutputAmount
    );
    
    // 检查 vault 是否有足够的储备
    require!(
        amount_out <= reserve_out,
        ErrorCode::InsufficientLiquidity
    );
    
    // 验证恒定乘积和公式
    // 由于 weight 是不变量，我们只需要验证 amount_in_minus_fees * weight_in >= amount_out * weight_out
    // 注意：由于整数除法向下取整，delta_out 可能略小于 delta_in，这是允许的
    let weight_in = token_in.get_weight();
    let weight_out = token_out.get_weight();
    
    // 验证：amount_in_minus_fees * weight_in >= amount_out * weight_out
    // 由于 amount_out = (amount_in_minus_fees * weight_in) / weight_out（整数除法向下取整）
    // 所以 delta_out = amount_out * weight_out <= amount_in_minus_fees * weight_in = delta_in
    let delta_in = (amount_in_minus_fees as u128)
        .checked_mul(weight_in as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    let delta_out = (amount_out as u128)
        .checked_mul(weight_out as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // 验证：delta_out <= delta_in（允许整数除法的舍入误差）
    // 如果 delta_out > delta_in，说明计算有误
    require!(
        delta_out <= delta_in,
        ErrorCode::MathOverflow
    );
    
    // 准备 seeds 用于签名
    let pool_key = ctx.accounts.pool.key();
    let bump = ctx.bumps.pool_authority;
    let seeds = &[
        b"anyswap_authority",
        pool_key.as_ref(),
        &[bump],
    ];
    let signer = &[&seeds[..]];
    
    // 转出输出代币给用户
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_out.to_account_info(),
                to: ctx.accounts.user_out.to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
            },
            signer,
        ),
        amount_out,
    )?;
    
    // 接收用户的输入代币
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_in.to_account_info(),
                to: ctx.accounts.vault_in.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount_in,
    )?;
    
    msg!(
        "AnySwap: {} tokens swapped, {} in -> {} out (weight_in: {}, weight_out: {})",
        amount_in,
        mint_in_key,
        mint_out_key,
        weight_in,
        weight_out
    );
    
    Ok(())
}

