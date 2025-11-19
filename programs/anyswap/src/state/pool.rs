use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use super::item::AnySwapItem;
use static_assertions::const_assert_eq;
use std::mem::size_of;

/// 池中最多支持的 token 数量（用于多 token 互相转换）
pub const MAX_TOKENS: usize = 1024;

/// AnySwap 池结构
/// 
/// 用于存储 token 列表（items 是内部数据，不是程序地址）
/// 使用 zero_copy 以避免栈溢出（大数组需要）
#[account(zero_copy)]
#[repr(C)]
#[derive(Debug)]
pub struct AnySwapPool {
    /// 实际使用的 token 数量（账户长度）
    pub token_count: u16,
    /// 填充字节（确保 admin 8 字节对齐）
    pub padding: [u8; 6],
    /// Pool 管理员 - 用于所有操作的权限控制
    pub admin: Pubkey,
    /// LP token 总发行量（用于跟踪流动性提供者的份额）
    pub total_amount_minted: u64,
    /// 手续费分子
    pub fee_numerator: u64,
    /// 手续费分母
    pub fee_denominator: u64,
    /// Token 配置数组，最多支持 1024 个 token（固定大小）
    /// 每个 item 是内部数据，不是程序地址
    pub tokens: [AnySwapItem; MAX_TOKENS],
}

// 验证结构体大小和对齐（Solana 要求 8 字节对齐）
// 计算：2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024) = 73792 bytes
const_assert_eq!(
    size_of::<AnySwapPool>(),
    2 + 6 + 32 + 8 + 8 + 8 + (size_of::<AnySwapItem>() * MAX_TOKENS)
);
const_assert_eq!(size_of::<AnySwapPool>(), 73792);
const_assert_eq!(size_of::<AnySwapPool>() % 8, 0); // 必须是 8 的倍数

impl AnySwapPool {
    /// 验证管理员权限
    pub fn verify_admin(&self, admin: &Pubkey) -> Result<()> {
        require!(
            *admin == self.admin,
            crate::error::ErrorCode::InvalidAdmin
        );
        Ok(())
    }

    /// 获取实际使用的 token 数量
    pub fn get_token_count(&self) -> usize {
        self.token_count as usize
    }

    /// 根据 mint 地址查找 token 索引
    pub fn find_token_index(&self, mint: &Pubkey) -> Option<usize> {
        for i in 0..self.get_token_count() {
            if self.tokens[i].mint_account == *mint {
                return Some(i);
            }
        }
        None
    }

    /// 根据索引获取 token item（可变引用）
    pub fn get_token_mut(&mut self, index: usize) -> Option<&mut AnySwapItem> {
        if index < self.get_token_count() {
            Some(&mut self.tokens[index])
        } else {
            None
        }
    }

    /// 根据索引获取 token item（不可变引用）
    pub fn get_token(&self, index: usize) -> Option<&AnySwapItem> {
        if index < self.get_token_count() {
            Some(&self.tokens[index])
        } else {
            None
        }
    }

    /// 添加新的 token（返回索引）
    /// weight: 该 token 的权重，作为不变量保持不变
    pub fn add_token(&mut self, mint: &Pubkey, vault: &Pubkey, weight: u64) -> Result<usize> {
        require!(
            self.get_token_count() < MAX_TOKENS,
            ErrorCode::MaxTokensReached
        );
        require!(weight > 0, ErrorCode::InvalidTokenCount);

        let index = self.get_token_count();
        let token = &mut self.tokens[index];
        token.set_mint_account(mint);
        token.set_vault_account(vault);
        token.set_weight(weight);

        self.token_count += 1;
        Ok(index)
    }

    /// 获取 LP token 总发行量
    pub fn get_total_amount_minted(&self) -> u64 {
        self.total_amount_minted
    }

    /// 设置 LP token 总发行量
    pub fn set_total_amount_minted(&mut self, amount: u64) {
        self.total_amount_minted = amount;
    }

    /// 计算账户所需的空间大小
    pub fn space() -> usize {
        8 + // discriminator
        2 + // token_count
        6 + // padding
        32 + // admin (Pubkey)
        8 + // total_amount_minted
        8 + // fee_numerator
        8 + // fee_denominator
        (MAX_TOKENS * AnySwapItem::space()) // 固定大小数组
    }

    /// 获取手续费分子
    pub fn get_fee_numerator(&self) -> u64 {
        self.fee_numerator
    }

    /// 获取手续费分母
    pub fn get_fee_denominator(&self) -> u64 {
        self.fee_denominator
    }

    /// 设置费率
    pub fn set_fee(&mut self, fee_numerator: u64, fee_denominator: u64) {
        self.fee_numerator = fee_numerator;
        self.fee_denominator = fee_denominator;
    }

    /// 计算手续费
    /// amount: 输入金额
    /// 返回: (手续费金额, 扣除手续费后的金额)
    pub fn calculate_fee(&self, amount: u64) -> Result<(u64, u64)> {
        let amount_u128 = amount as u128;
        let fee_amount = amount_u128
            .checked_mul(self.fee_numerator as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.fee_denominator as u128)
            .ok_or(ErrorCode::MathOverflow)?;
        let amount_after_fee = amount_u128
            .checked_sub(fee_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        Ok((fee_amount as u64, amount_after_fee as u64))
    }

    /// 计算两个 token 之间的交换输出（使用恒定乘积和公式）
    /// 公式: Σ(vault_i * weight_i) = constant
    /// 在交换时，保持这个和不变
    /// 
    /// 对于两个 token 的交换：
    /// (vault_in + amount_in) * weight_in + (vault_out - amount_out) * weight_out = 
    /// vault_in * weight_in + vault_out * weight_out
    /// 
    /// 因此：amount_in * weight_in = amount_out * weight_out
    /// amount_out = (amount_in * weight_in) / weight_out
    pub fn calculate_swap_output(
        &self,
        token_in_index: usize,
        token_out_index: usize,
        amount_in: u64,
    ) -> Result<u64> {
        require!(
            token_in_index < self.get_token_count() && token_out_index < self.get_token_count(),
            ErrorCode::InvalidTokenIndex
        );
        require!(token_in_index != token_out_index, ErrorCode::SameTokenSwap);

        let token_in = self.get_token(token_in_index)
            .ok_or(ErrorCode::InvalidTokenIndex)?;
        let token_out = self.get_token(token_out_index)
            .ok_or(ErrorCode::InvalidTokenIndex)?;

        let weight_in = token_in.get_weight();
        let weight_out = token_out.get_weight();

        require!(weight_in > 0 && weight_out > 0, ErrorCode::InvalidTokenCount);

        // 使用恒定乘积和公式: amount_in * weight_in = amount_out * weight_out
        let amount_in_u128 = amount_in as u128;
        let weight_in_u128 = weight_in as u128;
        let weight_out_u128 = weight_out as u128;

        let numerator = amount_in_u128
            .checked_mul(weight_in_u128)
            .ok_or(ErrorCode::MathOverflow)?;
        let amount_out = numerator
            .checked_div(weight_out_u128)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(amount_out as u64)
    }

    /// 计算池的恒定乘积和（用于验证）
    /// 返回 Σ(vault_i * weight_i)
    pub fn calculate_invariant(&self, reserves: &[u64]) -> Result<u128> {
        require!(
            reserves.len() == self.get_token_count(),
            ErrorCode::InvalidTokenCount
        );

        let mut invariant = 0u128;
        for i in 0..self.get_token_count() {
            let token = self.get_token(i).ok_or(ErrorCode::InvalidTokenIndex)?;
            let weight = token.get_weight();
            let reserve = reserves[i] as u128;
            
            let product = reserve
                .checked_mul(weight as u128)
                .ok_or(ErrorCode::MathOverflow)?;
            invariant = invariant
                .checked_add(product)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        Ok(invariant)
    }
}
