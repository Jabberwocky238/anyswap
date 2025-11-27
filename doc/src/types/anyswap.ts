import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// Pool Token 信息
export interface PoolTokenInfo {
  mintAccount: PublicKey;
  vaultAccount: PublicKey;
  weight: BN;
  balance?: BN;
}

// Pool 信息（从链上获取）
export interface ChainPoolInfo {
  admin: PublicKey;
  feeNumerator: BN;
  feeDenominator: BN;
  tokenCount: number;
  tokens: PoolTokenInfo[];
  lpMint: PublicKey;
  lpSupply: PublicKey;
}

// 用户 Token 账户信息
export interface UserTokenAccount {
  mint: string;
  balance: string;
  decimals: number;
}

// Pool 中的 Token（用于 UI 显示）
export interface PoolToken {
  mint: string;
  weight: string;
  balance: string;
}

// 创建的 Token 信息
export interface CreatedTokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
}

// Pool 创建结果
export interface CreatePoolResult {
  pool: PublicKey;
  poolKeypair: any; // Keypair
  poolAuthority: PublicKey;
  poolMint: PublicKey;
  signature: string;
}

// Pool 信息（用于 UI 显示）
export interface PoolInfoData {
  address: string;
  admin: string;
  feeNumerator: string;
  feeDenominator: string;
  lpMint: string;
  lpSupply: string;
  tokenCount: number;
  tokens: {
    index: number;
    mint: string;
    vault: string;
    weight: string;
  }[];
}

