use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// 修改 token 的 weight
#[derive(Accounts)]
pub struct ModifyTokenWeight<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// 要修改的 token 的 mint 账户
    pub mint: Account<'info, Mint>,

    /// Pool 管理员 - 必须签名所有操作
    /// CHECK: 验证是否为 pool 的管理员
    pub admin: Signer<'info>,
}

/// 修改 token 的 weight
/// new_weight: 新的权重值
/// 注意：修改 weight 会影响池的恒定乘积和，需要谨慎操作
pub fn modify_token_weight(
    ctx: Context<ModifyTokenWeight>,
    new_weight: u64,
) -> Result<()> {
    require!(new_weight > 0, ErrorCode::InvalidTokenCount);
    
    let pool = &mut ctx.accounts.pool.load_mut()?;
    
    // 验证管理员权限
    pool.verify_admin(&ctx.accounts.admin.key())?;
    
    let mint_key = ctx.accounts.mint.key();
    let token_index = pool.find_token_index(&mint_key)
        .ok_or(ErrorCode::InvalidTokenMint)?;
    
    let token = pool.get_token_mut(token_index)
        .ok_or(ErrorCode::InvalidTokenIndex)?;
    
    let old_weight = token.get_weight();
    token.set_weight(new_weight);
    
    msg!("Token weight modified: mint: {}, old_weight: {}, new_weight: {}", 
         mint_key, old_weight, new_weight);
    Ok(())
}

