import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";


export interface AnySwapPoolToken {
  vaultAccount: PublicKey;
  mintAccount: PublicKey;
  weight: BN;
}

export interface AnySwapPool {
  address: PublicKey;
  admin: PublicKey;
  feeNumerator: BN;
  feeDenominator: BN;
  lpMint: PublicKey;
  lpSupply: BN;
  tokenCount: number;
  tokens: AnySwapPoolToken[];
}

/**
 * Pool 创建结果
 */
export interface CreatePoolResult {
  pool: PublicKey;
  poolKeypair: Keypair;
  poolAuthority: PublicKey;
  poolAuthorityBump: number;
  poolMint: PublicKey;
  signature: string;
}

/**
 * Token 信息
 */
export interface TokenInfo {
  mint: PublicKey;
  vault: PublicKey;
  weight: BN;
}

/**
 * 添加流动性参数
 */
export interface AddLiquidityParams {
  amounts: BN[];
  userTokenAccounts: PublicKey[];
  vaultAccounts: PublicKey[];
}

/**
 * 移除流动性参数
 */
export interface RemoveLiquidityParams {
  burnAmount: BN;
  userTokenAccounts: PublicKey[];
  vaultAccounts: PublicKey[];
}

/**
 * Swap 参数
 */
export interface SwapParams {
  amountIn: BN;
  minAmountOut: BN;
  vaultIn: PublicKey;
  vaultOut: PublicKey;
  userIn: PublicKey;
  userOut: PublicKey;
}

