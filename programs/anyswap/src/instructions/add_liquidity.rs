use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use crate::state::AnySwapPool;
use crate::error::ErrorCode;

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
/// 按照 Balancer 的方式：按当前池的比例添加所有 token
/// 
/// RemainingAccounts 结构：
/// - 每两个账户为一对：(user_token_account, vault_account)
/// - 必须按照 pool 中 token 的顺序传入
/// - 例如：pool 有 [A, B, C]，则传入 [user_A, vault_A, user_B, vault_B, user_C, vault_C]
/// 
/// amounts: 每个 token 的添加数量（按 pool 中 token 的顺序）
pub fn add_liquidity<'remaining: 'info, 'info>(
    ctx: Context<'_, '_, 'remaining, 'info, AddLiquidity<'info>>,
    amounts: Vec<u64>,
) -> Result<()> {
    let pool = ctx.accounts.pool.load()?;
    let token_count = pool.get_token_count();
    
    require!(token_count > 0, ErrorCode::InvalidTokenCount);
    require!(
        amounts.len() == token_count,
        ErrorCode::InvalidTokenCount
    );

    // 验证 RemainingAccounts 数量：每个 token 需要 2 个账户（user_token, vault）
    let remaining_accounts = ctx.remaining_accounts;
    require!(
        remaining_accounts.len() == token_count * 2,
        ErrorCode::InvalidTokenCount
    );

    // 准备 seeds 用于签名
    let pool_key = ctx.accounts.pool.key();
    let pool_authority_key = ctx.accounts.pool_authority.key();
    let owner_key = ctx.accounts.owner.key();
    let bump = ctx.bumps.pool_authority;
    let seeds = &[
        b"anyswap_authority",
        pool_key.as_ref(),
        &[bump],
    ];
    let signer = &[&seeds[..]];

    // 检查是否所有 vault 都为空（初始添加）
    let mut all_vaults_empty = true;
    let mut vault_balances = Vec::new();
    
    // 先收集所有 vault 余额（避免生命周期问题）
    // 在循环中立即读取数据，不保留 Account 对象
    for i in 0..token_count {
        let vault_info = &remaining_accounts[i * 2 + 1];
        
        // 验证 vault mint 匹配 pool 中的 token
        let token_item = pool.get_token(i).ok_or(ErrorCode::InvalidTokenIndex)?;
        require!(
            vault_info.key == token_item.vault_pubkey(),
            ErrorCode::InvalidTokenMint
        );
        
        // 读取 vault 账户并验证 owner 是 pool_authority
        let vault_account = Account::<TokenAccount>::try_from_unchecked(vault_info)?;
        require!(
            vault_account.owner == pool_authority_key,
            ErrorCode::InvalidTokenMint
        );
        
        // 读取 vault 余额
        let balance = vault_account.amount;
        vault_balances.push(balance);
        if balance > 0 {
            all_vaults_empty = false;
        }
    }

    let mut deposits = Vec::new();
    let amount_to_mint;

    if all_vaults_empty {
        // 初始添加：使用所有 token 的总和作为 LP token 数量
        // 简化版本：使用所有 token 数量的平均值
        let total_amount: u128 = amounts.iter().map(|&a| a as u128).sum();
        amount_to_mint = (total_amount / token_count as u128) as u64;
        deposits = amounts;
    } else {
        // 后续添加：按当前池的比例
        // 计算每个 token 应该添加的数量（基于第一个非零的 token）
        // 找到第一个非零的 vault 作为基准
        let mut base_index = 0;
        for i in 0..token_count {
            if vault_balances[i] > 0 {
                base_index = i;
                break;
            }
        }

        let base_vault_balance = vault_balances[base_index] as u128;
        let base_amount = amounts[base_index] as u128;

        // 计算每个 token 应该添加的数量
        for i in 0..token_count {
            if vault_balances[i] == 0 {
                return Err(ErrorCode::InsufficientLiquidity.into());
            }

            let expected_deposit = (base_amount
                .checked_mul(vault_balances[i] as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(base_vault_balance)
                .ok_or(ErrorCode::MathOverflow)?) as u64;

            // 检查用户提供的数量是否足够
            require!(
                expected_deposit <= amounts[i],
                ErrorCode::InsufficientTokenAmount
            );

            deposits.push(expected_deposit);
        }

        // 计算 LP token 数量：基于基准 token
        // amount_to_mint = deposit_base * total_minted / vault_balance_base
        let total_minted = pool.get_total_amount_minted();
        amount_to_mint = (base_amount
            .checked_mul(total_minted as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(base_vault_balance)
            .ok_or(ErrorCode::MathOverflow)?) as u64;
    }

    require!(amount_to_mint > 0, ErrorCode::InsufficientTokenAmount);
    
    // drop
    drop(pool);

    // 更新 total_amount_minted
    let mut pool_mut = ctx.accounts.pool.load_mut()?;
    let current_total = pool_mut.get_total_amount_minted();
    pool_mut.set_total_amount_minted(
        current_total
            .checked_add(amount_to_mint)
            .ok_or(ErrorCode::MathOverflow)?
    );

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
        amount_to_mint,
    )?;

    // 转移所有 token 到对应的 vault
    for i in 0..token_count {
        let user_token_info = &remaining_accounts[i * 2];
        let vault_info = &remaining_accounts[i * 2 + 1];
        
        // 验证 user_token owner（从 TokenAccount 数据中读取）
        let user_token_account = Account::<TokenAccount>::try_from_unchecked(user_token_info)?;
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
            deposits[i],
        )?;
    }

    msg!(
        "Liquidity added: {} LP tokens minted for {} tokens",
        amount_to_mint,
        token_count
    );

    Ok(())
}
