use crate::error::ErrorCode;
use crate::state::AnySwapPool;
use crate::state::liquidity::add_liquidity_inner;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

/// 添加流动性操作
/// 按照 Balancer 的方式：按当前池的比例添加所有 token
/// LP token 作用于整个 pool，而不是单个 token 对
#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub pool: AccountLoader<'info, AnySwapPool>,

    /// Pool authority PDA
    /// CHECK: PDA derived from pool key, used as token account owner
    #[account(
        seeds = [b"anyswap_authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    /// Pool mint - LP token
    #[account(
        mut,
        seeds = [b"pool_mint", pool.key().as_ref()],
        bump
    )]
    pub pool_mint: Box<Account<'info, Mint>>,

    /// 用户的 LP token 账户（接收 LP token）
    #[account(
        mut,
        constraint = user_pool_ata.mint == pool_mint.key(),
        constraint = user_pool_ata.owner == owner.key()
    )]
    pub user_pool_ata: Box<Account<'info, TokenAccount>>,

    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// 添加流动性（多 token 版本）
/// 按照 CPMM 模式：按当前池的比例添加所有 token
///
/// RemainingAccounts 结构：
/// - 每两个账户为一对：(user_token_account, vault_account)
/// - 必须按照 pool 中 token 的顺序传入
/// - 例如：pool 有 [A, B, C]，则传入 [user_A, vault_A, user_B, vault_B, user_C, vault_C]
///
/// amounts_in: 用户希望添加的每个 token 的数量（按 pool 中 token 的顺序）
pub fn add_liquidity<'remaining: 'info, 'info>(
    ctx: Context<'_, '_, 'remaining, 'info, AddLiquidity<'info>>,
    amounts_in: Vec<u64>,
) -> Result<()> {
    let pool = ctx.accounts.pool.load()?;
    let token_count = pool.get_token_count();

    require!(token_count > 0, ErrorCode::InvalidTokenCount);
    require!(
        amounts_in.len() == token_count,
        ErrorCode::InvalidTokenCount
    );

    // 验证 RemainingAccounts 数量：每个 token 需要 2 个账户（user_token, vault）
    let remaining_accounts = ctx.remaining_accounts;
    require!(
        remaining_accounts.len() == token_count * 2,
        ErrorCode::InvalidTokenCount
    );

    let pool_authority_key = ctx.accounts.pool_authority.key();
    let owner_key = ctx.accounts.owner.key();

    // 收集所有 vault 余额
    let mut token_vault_balances: Vec<u64> = Vec::with_capacity(token_count);

    for i in 0..token_count {
        let vault_info = &remaining_accounts[i * 2 + 1];

        // 验证 vault
        let token_item = pool.get_token(i).ok_or(ErrorCode::InvalidTokenIndex)?;
        require!(
            vault_info.key() == *token_item.vault_pubkey(),
            ErrorCode::InvalidTokenMint
        );

        // 读取 vault 账户并验证 owner 是 pool_authority
        let vault_account = Account::<TokenAccount>::try_from(vault_info)?;
        require!(
            vault_account.owner == pool_authority_key,
            ErrorCode::InvalidTokenMint
        );

        token_vault_balances.push(vault_account.amount);
    }

    // 调用 add_liquidity_inner
    let total_lp_supply = pool.get_total_amount_minted();
    let result = add_liquidity_inner(
        &token_vault_balances,
        &amounts_in,
        total_lp_supply,
        pool.get_fee_numerator(),
        pool.get_fee_denominator(),
    )?;

    drop(pool);

    // 更新 total_amount_minted
    let mut pool_mut = ctx.accounts.pool.load_mut()?;
    let current_total = pool_mut.get_total_amount_minted();
    pool_mut.set_total_amount_minted(
        current_total
            .checked_add(result.lp_minted)
            .ok_or(ErrorCode::MathOverflow)?,
    );
    drop(pool_mut);

    // 准备 seeds 用于签名
    let pool_key = ctx.accounts.pool.key();
    let bump = ctx.bumps.pool_authority;
    let seeds = &[b"anyswap_authority", pool_key.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    // 铸造 LP token 给用户
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                to: ctx.accounts.user_pool_ata.to_account_info(),
                mint: ctx.accounts.pool_mint.to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
            },
            signer,
        ),
        result.lp_minted,
    )?;

    // 转移所有 token 到对应的 vault
    for i in 0..token_count {
        let user_token_info = &remaining_accounts[i * 2];
        let vault_info = &remaining_accounts[i * 2 + 1];

        // 跳过不需要转移的token
        if result.amounts_used[i] == 0 {
            continue;
        }

        // 验证 user_token owner
        let user_token_account = Account::<TokenAccount>::try_from(user_token_info)?;
        require!(
            user_token_account.owner == owner_key,
            ErrorCode::InvalidTokenMint
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: user_token_info.clone(),
                    to: vault_info.clone(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            result.amounts_used[i],
        )?;
    }

    msg!(
        "Liquidity added: {} LP tokens minted for {} tokens",
        result.lp_minted,
        token_count
    );

    Ok(())
}
