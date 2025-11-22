use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod error;
pub mod math;

use instructions::*;
declare_id!("3GBxn5VSThpKNyUgaQ96xjSXD2zJ1164LzK28MXv4MDC");

#[program]
pub mod anyswap {
    use super::*;

    /// 创建 Pool（PDA）
    pub fn create_pool(
        ctx: Context<CreatePool>,
        fee_numerator: u64,
        fee_denominator: u64,
    ) -> Result<()> {
        instructions::create_pool(ctx, fee_numerator, fee_denominator)
    }

    /// 添加 token 到 AnySwap Pool
    /// RemainingAccounts: 如果 pool 中已有 token，需要传入现有 vault 的账户信息
    pub fn add_token_to_pool<'remaining: 'info, 'info>(
        ctx: Context<'_, '_, 'remaining, 'info, AddTokenToPool<'info>>,
        weight: u64,
    ) -> Result<()> {
        instructions::add_token_to_pool(ctx, weight)
    }

    /// 从 AnySwap Pool 移除 token
    pub fn remove_token_from_pool(
        ctx: Context<RemoveTokenFromPool>,
    ) -> Result<()> {
        instructions::remove_token_from_pool(ctx)
    }

    /// 修改 token 的 weight
    pub fn modify_token_weight(
        ctx: Context<ModifyTokenWeight>,
        new_weight: u64,
    ) -> Result<()> {
        instructions::modify_token_weight(ctx, new_weight)
    }

    /// 修改 pool 的费率
    pub fn modify_fee(
        ctx: Context<ModifyFee>,
        fee_numerator: u64,
        fee_denominator: u64,
    ) -> Result<()> {
        instructions::modify_fee(ctx, fee_numerator, fee_denominator)
    }

    /// AnySwap 交换代币
    /// amounts_tolerance: 每个 token 的容差（输入为上限，输出为下限）
    /// is_in_token: 标记每个 token 是输入还是输出
    pub fn swap_anyswap<'remaining: 'info, 'info>(
        ctx: Context<'_, '_, 'remaining, 'info, Swap<'info>>,
        amounts_tolerance: Vec<u64>,
        is_in_token: Vec<bool>,
    ) -> Result<()> {
        instructions::swap_anyswap(ctx, amounts_tolerance, is_in_token)
    }

    /// 添加流动性（多 token 版本，按 Balancer 方式）
    /// pivot_amount: 基准 token 的添加数量
    /// RemainingAccounts: 每两个账户为一对 (user_token_account, vault_account)
    pub fn add_liquidity<'remaining: 'info, 'info>(
        ctx: Context<'_, '_, 'remaining, 'info, AddLiquidity<'info>>,
        amounts_in: Vec<u64>,
    ) -> Result<()> {
        instructions::add_liquidity(ctx, amounts_in)
    }

    /// 移除流动性（多 token 版本，按 Balancer 方式）
    /// burn_amount: 要销毁的 LP token 数量
    /// RemainingAccounts: 每两个账户为一对 (user_token_account, vault_account)
    pub fn remove_liquidity<'remaining: 'info, 'info>(
        ctx: Context<'_, '_, 'remaining, 'info, RemoveLiquidity<'info>>,
        burn_amount: u64,
    ) -> Result<()> {
        instructions::remove_liquidity(ctx, burn_amount)
    }
}
