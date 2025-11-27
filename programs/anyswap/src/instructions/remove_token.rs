use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, CloseAccount};
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// 从 pool 中移除 token
#[derive(Accounts)]
pub struct RemoveTokenFromPool<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// Pool authority PDA - 用于签名关闭 vault
    /// CHECK: PDA derived from pool key
    #[account(
        seeds = [b"anyswap_authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    /// 要移除的 token 的 mint 账户
    pub mint: Account<'info, Mint>,

    /// Token 的 vault 账户 - 需要关闭
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref(), mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Pool 管理员 - 必须签名所有操作
    /// CHECK: 验证是否为 pool 的管理员
    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// 从 pool 中移除 token
/// 注意：移除 token 前需要确保 vault 中没有余额
pub fn remove_token_from_pool(ctx: Context<RemoveTokenFromPool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool.load_mut()?;
    
    // 验证管理员权限
    pool.verify_admin(&ctx.accounts.admin.key())?;
    
    // 检查 vault 余额必须为 0
    require!(
        ctx.accounts.vault.amount == 0,
        ErrorCode::InsufficientTokenAmount
    );
    
    let mint_key = ctx.accounts.mint.key();
    let token_index = pool.find_token_index(&mint_key)
        .ok_or(ErrorCode::InvalidTokenMint)?;
    
    // 检查是否是最后一个 token
    let token_count = pool.get_token_count();
    require!(token_count > 0, ErrorCode::InvalidTokenCount);
    
    // 验证 vault 地址是否匹配
    let token_item = pool.get_token(token_index).ok_or(ErrorCode::InvalidTokenIndex)?;
    require!(
        ctx.accounts.vault.key() == *token_item.vault_pubkey(),
        ErrorCode::InvalidTokenMint
    );
    
    // 如果是最后一个 token，直接减少计数
    if token_index == token_count - 1 {
        pool.token_count -= 1;
    } else {
        // 如果不是最后一个，将最后一个 token 移动到当前位置
        let last_index = token_count - 1;
        
        // 先获取最后一个 token 的数据（通过索引访问，避免借用冲突）
        let last_token_data = pool.tokens[last_index];
        
        // 复制最后一个 token 到当前位置
        pool.tokens[token_index] = last_token_data;
        
        // 减少计数
        pool.token_count -= 1;
    }
    
    // 准备 seeds 用于签名
    let pool_key = ctx.accounts.pool.key();
    let bump = ctx.bumps.pool_authority;
    let seeds = &[
        b"anyswap_authority",
        pool_key.as_ref(),
        &[bump],
    ];
    let signer = &[&seeds[..]];
    
    // 关闭 vault 账户，将租金退还给 admin
    anchor_spl::token::close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.admin.to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
            },
            signer,
        ),
    )?;
    
    msg!("Token removed from pool and vault closed: mint: {}", mint_key);
    Ok(())
}

