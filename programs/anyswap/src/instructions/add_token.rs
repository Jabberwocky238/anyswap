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

    /// Admin 的 token 账户（提供流动性）
    /// 如果 pool 中已有流动性，必须提供新 token 的流动性
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
/// weight: 该 token 的权重，作为不变量保持不变
/// 
/// 如果 pool 中已有流动性，必须同时提供新 token 的流动性以保持池子平衡
/// 流动性数量根据恒定乘积和公式计算：vault_new * weight_new = vault_base * weight_base
/// 流动性会从 admin 的 ATA 账户自动扣除
pub fn add_token_to_pool<'remaining: 'info, 'info>(
    ctx: Context<'_, '_, 'remaining, 'info, AddTokenToPool<'info>>,
    weight: u64,
) -> Result<()> {
    // 先读取 pool 信息
    let token_count;
    let mint_key;
    {
        let pool = ctx.accounts.pool.load()?;
        token_count = pool.get_token_count();
        mint_key = ctx.accounts.mint.key();
        
        // 检查 token 是否已存在
        if let Some(_) = pool.find_token_index(&mint_key) {
            return Err(ErrorCode::InvalidTokenMint.into());
        }
    }
    
    let pool = &mut ctx.accounts.pool.load_mut()?;
    
    // 验证管理员权限
    pool.verify_admin(&ctx.accounts.admin.key())?;
    
    require!(weight > 0, ErrorCode::InvalidTokenCount);
    
    // 如果 pool 中已有 token，必须同时提供新 token 的流动性以保持池子平衡
    if token_count > 0 {
        // 验证 RemainingAccounts 数量：每个现有 token 需要一个 vault 账户
        let remaining_accounts = ctx.remaining_accounts;
        require!(
            remaining_accounts.len() == token_count,
            ErrorCode::InvalidTokenCount
        );
        
        // 读取现有 vault 的余额，累加作为基准（即使余额为0也可以）
        // base = sum(vault * weight)
        // 恒定乘积和公式：vault_new * weight_new = base
        let mut base: u128 = 0;
        
        for i in 0..token_count {
            let vault_info = &remaining_accounts[i];
            
            // 验证 vault 地址匹配 pool 中的 token
            let token_item = pool.get_token(i).ok_or(ErrorCode::InvalidTokenIndex)?;
            require!(
                *vault_info.key == *token_item.vault_pubkey(),
                ErrorCode::InvalidTokenMint
            );
            
            // 读取 vault 余额
            let vault_account = Account::<TokenAccount>::try_from_unchecked(vault_info)?;
            require!(
                vault_account.owner == ctx.accounts.pool_authority.key(),
                ErrorCode::InvalidTokenMint
            );
            
            // 使用 u128 避免溢出
            let product = (vault_account.amount as u128)
                .checked_mul(token_item.get_weight() as u128)
                .ok_or(ErrorCode::MathOverflow)?;
            base = base
                .checked_add(product)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        
        // 计算需要的流动性：vault_new * weight_new = base
        // vault_new = base / weight_new
        let required_liquidity = base
            .checked_div(weight as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        // 如果计算出的流动性大于0，检查 admin 的 token 账户是否有足够的余额
        if required_liquidity > 0 {
            require!(
                ctx.accounts.admin_token.amount >= required_liquidity,
                ErrorCode::InsufficientTokenAmount
            );
            
            // 转移 token 到 vault（使用计算出的数量）
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.admin_token.to_account_info(),
                        to: ctx.accounts.vault.to_account_info(),
                        authority: ctx.accounts.admin.to_account_info(),
                    },
                ),
                required_liquidity,
            )?;
            
            msg!("Liquidity provided for new token: {} tokens (required: {})", 
                 required_liquidity, required_liquidity);
        } else {
            msg!("No liquidity required (all vaults are empty)");
        }
    } else {
        // 如果 pool 为空，不需要提供流动性
        msg!("Pool is empty, no liquidity required");
    }
    
    // 添加 token（设置 weight）
    let index = pool.add_token(&mint_key, &ctx.accounts.vault.key(), weight)?;
    
    msg!("Token added to pool at index: {}, mint: {}, weight: {}, vault_balance: {}", 
         index, mint_key, weight, ctx.accounts.vault.amount);
    Ok(())
}

