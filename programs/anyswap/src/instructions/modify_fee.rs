use anchor_lang::prelude::*;
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// 修改 pool 的费率
#[derive(Accounts)]
pub struct ModifyFee<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// Pool 管理员 - 必须签名费率修改操作
    /// CHECK: 验证是否为 pool 的管理员
    pub admin: Signer<'info>,
}

/// 修改 pool 的费率
/// fee_numerator: 新的手续费分子
/// fee_denominator: 新的手续费分母
/// 注意：修改费率会影响所有后续交易的手续费
pub fn modify_fee(
    ctx: Context<ModifyFee>,
    fee_numerator: u64,
    fee_denominator: u64,
) -> Result<()> {
    require!(fee_denominator > 0, ErrorCode::MathOverflow);
    require!(fee_numerator <= fee_denominator, ErrorCode::MathOverflow);
    
    let pool = &mut ctx.accounts.pool.load_mut()?;
    
    // 验证管理员权限
    pool.verify_admin(&ctx.accounts.admin.key())?;
    
    // 检查费率是否合理
    require!(fee_denominator > 0, ErrorCode::MathOverflow);
    require!(fee_numerator > 0, ErrorCode::MathOverflow);
    require!(fee_numerator <= fee_denominator, ErrorCode::MathOverflow);
    // 修改费率
    pool.fee_numerator = fee_numerator;
    pool.fee_denominator = fee_denominator;
    
    msg!("Pool fee updated to {}/{}", fee_numerator, fee_denominator);
    Ok(())
}

