import { Connection, PublicKey, Transaction, Keypair, SystemProgram } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';

/**
 * @description 创建 Token, 使用 SPL Token 标准库创建
 * 支持钱包适配器（使用 signTransaction）
 */
export async function handleCreateToken(
  connection: Connection,
  publicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  tokenName: string,
  tokenSymbol: string,
  tokenDecimals: number
): Promise<{ mint: PublicKey; signature: string; name: string; symbol: string; decimals: number }> {
  if (!tokenName || !tokenSymbol) {
    throw new Error('请填写完整的 Token 信息（名称、符号、小数位数）');
  }

  if (tokenDecimals < 0 || tokenDecimals > 9) {
    throw new Error('小数位数必须是 0-9 之间的数字');
  }

  // 创建 mint 账户的 keypair
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  // 获取创建 mint 账户所需的最小租金
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  // 构建交易
  const transaction = new Transaction();

  // 1. 创建 mint 账户
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  // 2. 初始化 mint
  transaction.add(
    createInitializeMintInstruction(
      mint,
      tokenDecimals,
      publicKey, // mint authority
      null // freeze authority (null = no freeze authority)
    )
  );

  // 获取最新的 blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = publicKey;

  // 签名交易（需要签名 mint keypair 和用户钱包）
  transaction.partialSign(mintKeypair);
  const signedTransaction = await signTransaction(transaction);

  // 发送并确认交易
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
  });

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');
  
  return {
    mint: mint,
    signature: signature,
    name: tokenName,
    symbol: tokenSymbol,
    decimals: tokenDecimals,
  };
}

/**
 * Mint Token 给自己的封装函数（组件级别）
 * 使用 SPL Token 标准库实现
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
  
  // 计算关联代币账户地址
  const userTokenAccount = await getAssociatedTokenAddress(
    mint,
    publicKey, // owner
    false, // allowOwnerOffCurve
    TOKEN_PROGRAM_ID
  );

  // 检查账户是否存在
  let accountExists = false;
  try {
    await getAccount(connection, userTokenAccount, 'confirmed', TOKEN_PROGRAM_ID);
    accountExists = true;
  } catch (error: any) {
    // 账户不存在，需要在交易中创建
    if (error.name === 'TokenAccountNotFoundError' || error.name === 'TokenInvalidAccountOwnerError') {
      accountExists = false;
    } else {
      throw error;
    }
  }

  // 计算要铸造的数量（考虑小数位）
  const amountInSmallestUnit = BigInt(Math.floor(amount * Math.pow(10, decimals)));

  // 构建交易
  const transaction = new Transaction();
  
  // 如果账户不存在，先创建关联代币账户
  if (!accountExists) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        publicKey, // payer
        userTokenAccount, // ata
        publicKey, // owner
        mint, // mint
        TOKEN_PROGRAM_ID
      )
    );
  }
  
  // 添加 mint 指令
  transaction.add(
    createMintToInstruction(
      mint,
      userTokenAccount,
      publicKey, // mint authority
      amountInSmallestUnit,
      [], // multiSigners
      TOKEN_PROGRAM_ID
    )
  );

  // 获取最新的 blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = publicKey;

  // 签名并发送交易
  const signedTransaction = await signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
  });

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');

  return {
    signature: signature,
    userTokenAccount: userTokenAccount.toString(),
    amount: amountInSmallestUnit.toString(),
  };
}

