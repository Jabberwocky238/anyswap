import * as anchor from "@coral-xyz/anchor";
import * as token from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  Connection,
} from "@solana/web3.js";

/**
 * Token 信息
 */
export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
}

/**
 * 创建 Token 的结果
 */
export interface CreateTokenResult {
  mint: PublicKey;
  signature: string;
  tokenInfo: TokenInfo;
}

/**
 * Mint Token 的结果
 */
export interface MintTokenResult {
  signature: string;
  userTokenAccount: PublicKey;
  amount: string;
}

/**
 * 创建新的 Token
 * @param connection - Solana 连接
 * @param payer - 支付账户的公钥
 * @param name - Token 名称
 * @param symbol - Token 符号
 * @param decimals - 小数位数 (0-9)
 * @param signTransaction - 签名交易函数
 * @returns 创建的 Token 信息
 */
export async function createToken(
  connection: Connection,
  payer: PublicKey,
  name: string,
  symbol: string,
  decimals: number,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<CreateTokenResult> {
  // 创建 Mint 账户
  const mintKeypair = Keypair.generate();
  const lamports = await token.getMinimumBalanceForRentExemptMint(connection);

  // 创建 mint 账户的指令
  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mintKeypair.publicKey,
    space: token.MINT_SIZE,
    lamports,
    programId: token.TOKEN_PROGRAM_ID,
  });

  // 初始化 mint 的指令
  const initMintIx = token.createInitializeMintInstruction(
    mintKeypair.publicKey,
    decimals,
    payer, // mint authority
    payer  // freeze authority
  );

  // 创建交易
  const transaction = new Transaction().add(
    createMintAccountIx,
    initMintIx
  );

  // 设置交易的 recentBlockhash 和 feePayer
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer;

  // 签名并发送交易
  const signedTransaction = await signTransaction(transaction);
  signedTransaction.partialSign(mintKeypair);

  const signature = await connection.sendRawTransaction(
    signedTransaction.serialize()
  );
  await connection.confirmTransaction(signature, "confirmed");

  const mintAddress = mintKeypair.publicKey;
  const tokenInfo: TokenInfo = {
    name,
    symbol,
    decimals,
    mint: mintAddress.toString(),
  };

  return {
    mint: mintAddress,
    signature,
    tokenInfo,
  };
}

/**
 * Mint Token 到指定账户
 * @param connection - Solana 连接
 * @param mint - Token mint 地址
 * @param to - 接收账户的公钥
 * @param amount - 数量（不考虑小数位数的用户输入数量）
 * @param decimals - Token 小数位数
 * @param mintAuthority - Mint authority 的公钥
 * @param signTransaction - 签名交易函数
 * @returns Mint 结果
 */
export async function mintTokenToAccount(
  connection: Connection,
  mint: PublicKey,
  to: PublicKey,
  amount: number,
  decimals: number,
  mintAuthority: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<MintTokenResult> {
  // 计算实际数量（考虑小数位数）
  const amountBN = new anchor.BN(amount * Math.pow(10, decimals));

  // 获取或创建用户的关联 token 账户
  const userTokenAccount = await token.getAssociatedTokenAddress(mint, to);

  // 检查账户是否存在，如果不存在则创建
  try {
    await token.getAccount(connection, userTokenAccount);
  } catch {
    // 账户不存在，需要创建
    const createIx = token.createAssociatedTokenAccountInstruction(
      to,
      userTokenAccount,
      to,
      mint
    );
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(createIx);
    tx.recentBlockhash = blockhash;
    tx.feePayer = to;
    const signedTx = await signTransaction(tx);
    const signature = await connection.sendRawTransaction(
      signedTx.serialize()
    );
    await connection.confirmTransaction(signature, "confirmed");
  }

  // Mint token 到用户的账户
  const mintIx = token.createMintToInstruction(
    mint,
    userTokenAccount,
    mintAuthority,
    amountBN.toNumber()
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction().add(mintIx);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = to;

  const signedTransaction = await signTransaction(transaction);
  const signature = await connection.sendRawTransaction(
    signedTransaction.serialize()
  );
  await connection.confirmTransaction(signature, "confirmed");

  return {
    signature,
    userTokenAccount,
    amount: amount.toString(),
  };
}

