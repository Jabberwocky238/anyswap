use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

/// 创建 Pool（PDA）
/// 每个 Pool 可以包含多个 token（最多 1024 个）
#[derive(Accounts)]
pub struct CreatePool<'info> {
    /// Pool creator - 用于区分不同的 pool
    /// 可以是任何账户，只要保证唯一性即可
    /// CHECK: 用于区分不同的 pool
    pub pool_creator: AccountInfo<'info>,

    #[account(zero)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// Pool authority PDA - 用于管理该 pool 的所有 vault
    /// CHECK: 用于管理该 pool 的所有 vault
    #[account(
        seeds = [b"anyswap_authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    /// Pool mint - LP token，用于跟踪流动性提供者的份额
    #[account(
        init,
        payer = payer,
        seeds = [b"pool_mint", pool.key().as_ref()],
        bump,
        mint::decimals = 9,
        mint::authority = pool_authority
    )]
    pub pool_mint: Box<Account<'info, Mint>>,

    /// Pool 管理员 - 用于所有操作的权限控制
    /// 必须签名所有操作（swap、add liquidity、remove liquidity、add token、remove token、modify weight等）
    pub admin: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

/// 创建 Pool
/// fee_numerator: 手续费分子
/// fee_denominator: 手续费分母
/// 例如：fee_numerator=3, fee_denominator=1000 表示 0.3% 手续费
pub fn create_pool(
    ctx: Context<CreatePool>,
    fee_numerator: u64,
    fee_denominator: u64,
) -> Result<()> {
    require!(fee_denominator > 0, ErrorCode::MathOverflow);
    require!(fee_numerator <= fee_denominator, ErrorCode::MathOverflow);
    
    let pool = &mut ctx.accounts.pool.load_init()?;
    pool.token_count = 0;
    pool.padding = [0u8; 6];
    pool.admin = ctx.accounts.admin.key();
    pool.total_amount_minted = 0;
    pool.fee_numerator = fee_numerator;
    pool.fee_denominator = fee_denominator;
    
    // 初始化所有 token items 为零值（zero_copy 会自动处理）
    // 不需要显式初始化，因为 zero_copy 会使用未初始化的内存
    
    msg!("AnySwap Pool created: pool_creator: {}, pool: {}, pool_mint: {}, admin: {}, fee: {}/{}", 
         ctx.accounts.pool_creator.key(),
         ctx.accounts.pool.key(),
         ctx.accounts.pool_mint.key(),
         ctx.accounts.admin.key(),
         fee_numerator,
         fee_denominator);
    Ok(())
}

