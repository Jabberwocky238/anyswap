import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createToken, mintTokenToAccount, type TokenInfo } from '@anyswap/client';

/**
 * 创建 Token 的封装函数（组件级别）
 */
export async function handleCreateToken(
  connection: Connection,
  publicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  tokenName: string,
  tokenSymbol: string,
  tokenDecimals: number
): Promise<{ tokenInfo: TokenInfo; signature: string }> {
  if (!tokenName || !tokenSymbol) {
    throw new Error('请填写完整的 Token 信息（名称、符号、小数位数）');
  }

  if (tokenDecimals < 0 || tokenDecimals > 9) {
    throw new Error('小数位数必须是 0-9 之间的数字');
  }

  const result = await createToken(
    connection,
    publicKey,
    tokenName,
    tokenSymbol,
    tokenDecimals,
    signTransaction
  );

  return {
    tokenInfo: result.tokenInfo,
    signature: result.signature,
  };
}

/**
 * Mint Token 给自己的封装函数（组件级别）
 */
export async function handleMintToken(
  connection: Connection,
  publicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  mintAddress: string,
  amount: number,
  decimals: number
): Promise<{ signature: string; userTokenAccount: string; amount: string }> {
  if (!mintAddress || !amount || amount <= 0) {
    throw new Error('请选择 Token 并输入有效的数量（大于 0）');
  }

  const mint = new PublicKey(mintAddress);
  const result = await mintTokenToAccount(
    connection,
    mint,
    publicKey,
    amount,
    decimals,
    publicKey, // mint authority 是用户自己
    signTransaction
  );

  return {
    signature: result.signature,
    userTokenAccount: result.userTokenAccount.toString(),
    amount: result.amount,
  };
}

