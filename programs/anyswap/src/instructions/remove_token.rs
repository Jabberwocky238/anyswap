use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// 从 pool 中移除 token
#[derive(Accounts)]
pub struct RemoveTokenFromPool<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// 要移除的 token 的 mint 账户
    pub mint: Account<'info, Mint>,

    /// Pool 管理员 - 必须签名所有操作
    /// CHECK: 验证是否为 pool 的管理员
    pub admin: Signer<'info>,
}

/// 从 pool 中移除 token
/// 注意：移除 token 前需要确保 vault 中没有余额，或者由调用者处理余额
pub fn remove_token_from_pool(ctx: Context<RemoveTokenFromPool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool.load_mut()?;
    
    // 验证管理员权限
    pool.verify_admin(&ctx.accounts.admin.key())?;
    
    let mint_key = ctx.accounts.mint.key();
    let token_index = pool.find_token_index(&mint_key)
        .ok_or(ErrorCode::InvalidTokenMint)?;
    
    // 检查是否是最后一个 token
    let token_count = pool.get_token_count();
    require!(token_count > 0, ErrorCode::InvalidTokenCount);
    
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
    
    msg!("Token removed from pool: mint: {}", mint_key);
    Ok(())
}

