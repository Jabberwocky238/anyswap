use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// 添加 token 到 pool
#[derive(Accounts)]
pub struct AddTokenToPool<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// Pool authority PDA - 用于管理所有 vault
    /// CHECK: PDA derived from pool key, used as token account owner
    #[account(
        seeds = [b"anyswap_authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    /// Token 的 mint 账户
    pub mint: Account<'info, Mint>,

    /// Token 的 vault 账户（存储该 token 的账户）
    /// 作为 PDA 由程序自动创建，owner 是 pool_authority
    /// 地址：seeds = [b"vault", pool.key(), mint.key()]
    #[account(
        init,
        payer = payer,
        seeds = [b"vault", pool.key().as_ref(), mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Admin 的 token 账户（可选提供初始流动性）
    /// 使用 AssociatedToken 自动验证是 admin 的 ATA
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = admin,
    )]
    pub admin_token: Box<Account<'info, TokenAccount>>,

    /// Pool 管理员 - 必须签名所有操作
    /// CHECK: 验证是否为 pool 的管理员
    pub admin: Signer<'info>,

    /// 支付创建 vault 账户的费用
    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// 添加 token 到 pool
/// weight: 该 token 的权重
/// liquidity: 初始流动性（可选，传0表示不提供）
/// 
/// 注意：添加新token会增加池子的总价值，不需要保持恒定乘积
/// Admin可以选择立即提供流动性，或稍后通过add_liquidity提供
pub fn add_token_to_pool(
    ctx: Context<AddTokenToPool>,
    weight: u64,
    liquidity: u64,
) -> Result<()> {
    // 读取 pool 信息
    let mint_key = ctx.accounts.mint.key();
    {
        let pool = ctx.accounts.pool.load()?;
        
        // 检查 token 是否已存在
        if let Some(_) = pool.find_token_index(&mint_key) {
            return Err(ErrorCode::InvalidTokenMint.into());
        }
    }
    
    let pool = &mut ctx.accounts.pool.load_mut()?;
    
    // 验证管理员权限
    pool.verify_admin(&ctx.accounts.admin.key())?;
    
    // 验证权重有效
    require!(weight > 0, ErrorCode::InvalidTokenCount);
    
    // 如果提供了初始流动性，从admin转移到vault
    if liquidity > 0 {
        require!(
            ctx.accounts.admin_token.amount >= liquidity,
            ErrorCode::InsufficientTokenAmount
        );
        
        // 转移流动性到vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            liquidity,
        )?;
        
        msg!("Initial liquidity provided: {} tokens", liquidity);
    } else {
        msg!("No initial liquidity provided");
    }
    
    // 添加 token（设置 weight）
    let index = pool.add_token(&mint_key, &ctx.accounts.vault.key(), weight)?;
    
    msg!("Token added to pool at index: {}, mint: {}, weight: {}, vault_balance: {}", 
         index, mint_key, weight, ctx.accounts.vault.amount);
    Ok(())
}

