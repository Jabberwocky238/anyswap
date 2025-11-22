use crate::error::ErrorCode;
use crate::state::{AnySwapPool, SwapProtocol};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

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

    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// AnySwap 交换代币
/// 使用加权恒定乘积公式：sum(weight_i * ln(vault_i)) = constant
///
/// RemainingAccounts 结构：
/// - 每两个账户为一对：(user_token_account, vault_account)
/// - 必须按照 pool 中 token 的顺序传入
/// - 例如：pool 有 [A, B, C]，则传入 [user_A, vault_A, user_B, vault_B, user_C, vault_C]
///
/// amounts_tolerance: 每个 token 的容差（输入为上限，输出为下限）
/// is_in_token: 标记每个 token 是输入还是输出
pub fn swap_anyswap<'remaining: 'info, 'info>(
    ctx: Context<'_, '_, 'remaining, 'info, Swap<'info>>,
    amounts_tolerance: Vec<u64>,
    is_in_token: Vec<bool>,
) -> Result<()> {
    let pool = ctx.accounts.pool.load()?;
    let token_count = amounts_tolerance.len();

    require!(token_count > 0, ErrorCode::InvalidTokenCount);
    require!(
        is_in_token.len() == token_count,
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

    // 收集所有数据
    let mut user_vaults_amount: Vec<u64> = Vec::with_capacity(token_count);
    let mut token_vaults_amount: Vec<u64> = Vec::with_capacity(token_count);
    let mut weights: Vec<u64> = Vec::with_capacity(token_count);

    for i in 0..token_count {
        let user_token_info = &remaining_accounts[i * 2];
        let vault_info = &remaining_accounts[i * 2 + 1];

        // 读取vault账户，获取其mint地址
        let vault_account = Account::<TokenAccount>::try_from(vault_info)?;
        require!(
            vault_account.owner == pool_authority_key,
            ErrorCode::InvalidTokenMint
        );
        
        // 通过mint地址在pool中查找对应的token
        let mint_key = vault_account.mint;
        let token_item = pool.get_token_by_mint(&mint_key)
            .ok_or(ErrorCode::InvalidTokenMint)?;
        
        // 验证 vault 地址是否匹配
        require!(
            vault_info.key() == *token_item.vault_pubkey(),
            ErrorCode::InvalidTokenMint
        );

        // 读取用户token账户
        let user_account = Account::<TokenAccount>::try_from(user_token_info)?;
        require!(user_account.owner == owner_key, ErrorCode::InvalidTokenMint);
        require!(user_account.mint == mint_key, ErrorCode::InvalidTokenMint);
        user_vaults_amount.push(user_account.amount);

        // 收集vault余额和权重
        token_vaults_amount.push(vault_account.amount);
        weights.push(token_item.get_weight());
    }

    // 调用 swap_inner
    let swap_result = pool.swap(
        &is_in_token,
        &amounts_tolerance,
        &user_vaults_amount,
        &token_vaults_amount,
        &weights,
        pool.get_fee_numerator(),
        pool.get_fee_denominator(),
    )?;

    drop(pool);

    // 准备 seeds 用于签名
    let pool_key = ctx.accounts.pool.key();
    let bump = ctx.bumps.pool_authority;
    let seeds = &[b"anyswap_authority", pool_key.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    // 执行转账
    for i in 0..token_count {
        let user_token_info = &remaining_accounts[i * 2];
        let vault_info = &remaining_accounts[i * 2 + 1];
        let amount = swap_result.amounts[i];

        msg!("Token {}: amount={}, is_in={}", i, amount, is_in_token[i]);

        if amount == 0 {
            msg!("Token {} amount is 0, skipping", i);
            continue;
        }

        if is_in_token[i] {
            msg!("Transferring {} from user to vault (input)", amount);
            // 输入token：从用户转到vault
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: user_token_info.clone(),
                        to: vault_info.clone(),
                        authority: ctx.accounts.owner.to_account_info(),
                    },
                ),
                amount,
            )?;
        } else {
            msg!("Transferring {} from vault to user (output)", amount);
            // 输出token：从vault转到用户
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: vault_info.clone(),
                        to: user_token_info.clone(),
                        authority: ctx.accounts.pool_authority.to_account_info(),
                    },
                    signer,
                ),
                amount,
            )?;
        }
    }

    // 计算输入和输出总量用于日志
    let total_in: u64 = is_in_token
        .iter()
        .enumerate()
        .filter(|(_, &is_in)| is_in)
        .map(|(i, _)| swap_result.amounts[i])
        .sum();
    let total_out: u64 = is_in_token
        .iter()
        .enumerate()
        .filter(|(_, &is_in)| !is_in)
        .map(|(i, _)| swap_result.amounts[i])
        .sum();
    let total_fees: u64 = swap_result.burn_fees.iter().sum();

    msg!(
        "AnySwap: {} tokens swapped, {} in -> {} out (total fees: {})",
        token_count,
        total_in,
        total_out,
        total_fees
    );

    Ok(())
}
