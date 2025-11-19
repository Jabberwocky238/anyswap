use anchor_lang::prelude::*;
use static_assertions::const_assert_eq;
use std::mem::size_of;

/// Token 配置项
/// 每个 item 记录一个 token 的 vault、mint 和 weight，用于多 token 互相转换
/// 遵循恒定乘积和公式：Σ(vault * weight) = constant
#[zero_copy]
#[repr(C)]
#[derive(Debug)]
pub struct AnySwapItem {
    /// Vault account 地址 - 存储该 token 的账户 (32 bytes)
    pub vault_account: Pubkey,
    /// Mint account 地址 - 该 token 的 mint 地址 (32 bytes)
    pub mint_account: Pubkey,
    /// 权重 (weight) - 不变量，用于恒定乘积和公式计算 (8 bytes)
    /// weight 在添加 token 时设置，之后保持不变
    pub weight: u64,
}

// 验证结构体大小和对齐（Solana 要求 8 字节对齐）
const_assert_eq!(size_of::<AnySwapItem>(), 32 + 32 + 8); // 72 bytes
const_assert_eq!(size_of::<AnySwapItem>(), 72);
const_assert_eq!(size_of::<AnySwapItem>() % 8, 0); // 必须是 8 的倍数

impl AnySwapItem {
    /// 检查 item 是否为空（未使用）
    pub fn is_empty(&self) -> bool {
        self.mint_account == Pubkey::default()
    }

    /// 获取 vault account 的 Pubkey
    pub fn vault_pubkey(&self) -> &Pubkey {
        &self.vault_account
    }

    /// 获取 mint account 的 Pubkey
    pub fn mint_pubkey(&self) -> &Pubkey {
        &self.mint_account
    }

    /// 获取 weight 值
    pub fn get_weight(&self) -> u64 {
        self.weight
    }

    /// 设置 weight 值（仅在添加 token 时调用）
    pub fn set_weight(&mut self, weight: u64) {
        self.weight = weight;
    }

    /// 设置 vault account
    pub fn set_vault_account(&mut self, pubkey: &Pubkey) {
        self.vault_account = *pubkey;
    }

    /// 设置 mint account
    pub fn set_mint_account(&mut self, pubkey: &Pubkey) {
        self.mint_account = *pubkey;
    }

    /// 计算单个 item 所需的空间大小
    pub fn space() -> usize {
        32 + // vault_account (Pubkey)
        32 + // mint_account (Pubkey)
        8 // weight
    }
}

