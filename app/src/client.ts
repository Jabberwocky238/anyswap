import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../../target/types/anyswap";
import * as token from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getPoolAuthority,
  getPoolMint,
  getVault,
} from "./utils";
import {
  AddLiquidityParams,
  AnySwapPool,
  RemoveLiquidityParams,
  SwapParams,
} from "./types";

interface ClientInterface { 
  swap: (pool: PublicKey, params: SwapParams, owner?: PublicKey, signers?: Keypair[]) => Promise<string>;
  addLiquidity: (pool: PublicKey, params: AddLiquidityParams, owner?: PublicKey, signers?: Keypair[]) => Promise<string>;
  removeLiquidity: (pool: PublicKey, params: RemoveLiquidityParams, owner?: PublicKey, signers?: Keypair[]) => Promise<string>;
  getPool: (pool: PublicKey) => Promise<AnySwapPool>;
  calculateRequiredWSOLLiquidity: (pool: PublicKey, weight: BN) => Promise<BN>;
}


const EMPTY_MINT = new PublicKey("1".repeat(32));

/**
 * AnySwap 客户端类
 * 提供普通用户的操作：交换代币、添加/移除流动性
 */
export class Client implements ClientInterface {
  public program: Program<Anyswap>;
  public connection: Connection;
  public provider: anchor.AnchorProvider;

  constructor(provider: anchor.AnchorProvider, program: Program<Anyswap>) {
    this.provider = provider;
    this.program = program;
    this.connection = provider.connection;
  }

  /**
   * 交换代币
   * @param pool - Pool 地址
   * @param params - Swap 参数
   * @param owner - 用户地址（可选，默认使用 provider.wallet.publicKey）
   * @param signers - 额外的签名者（可选，用于需要额外签名的情况）
   */
  async swap(
    pool: PublicKey,
    params: SwapParams,
    owner?: PublicKey,
    signers?: Keypair[]
  ): Promise<string> {
    const [poolAuthority] = getPoolAuthority(this.program, pool);
    const ownerPubkey = owner || this.provider.wallet.publicKey;

    const methodBuilder = this.program.methods
      .swapAnyswap(params.amountIn, params.minAmountOut)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthority,
        vaultIn: params.vaultIn,
        vaultOut: params.vaultOut,
        userIn: params.userIn,
        userOut: params.userOut,
        owner: ownerPubkey,
      });

    // 如果有额外的签名者，添加它们
    if (signers && signers.length > 0) {
      methodBuilder.signers(signers);
    }

    const signature = await methodBuilder.rpc();
    return signature;
  }

  /**
   * 添加流动性
   * @param pool - Pool 地址
   * @param params - 添加流动性参数
   * @param owner - 用户地址（可选，默认使用 provider.wallet.publicKey）
   * @param signers - 额外的签名者（可选，用于需要额外签名的情况）
   */
  async addLiquidity(
    pool: PublicKey,
    params: AddLiquidityParams,
    owner?: PublicKey,
    signers?: Keypair[]
  ): Promise<string> {
    const [poolAuthority] = getPoolAuthority(this.program, pool);
    const poolMint = getPoolMint(this.program, pool);
    const ownerPubkey = owner || this.provider.wallet.publicKey;

    // 获取或创建用户的 LP token 账户
    // 注意：这里需要使用 payer 来支付创建账户的费用
    const payer = (this.provider.wallet as any).payer || this.provider.wallet;
    const userPoolAta = await token.getOrCreateAssociatedTokenAccount(
      this.connection,
      payer as any,
      poolMint,
      ownerPubkey
    );

    // 构建 remaining accounts：每两个账户为一对 (user_token_account, vault_account)
    const remainingAccounts = [];
    for (let i = 0; i < params.userTokenAccounts.length; i++) {
      remainingAccounts.push({
        pubkey: params.userTokenAccounts[i],
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: params.vaultAccounts[i],
        isSigner: false,
        isWritable: true,
      });
    }

    const methodBuilder = this.program.methods
      .addLiquidity(params.amounts)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthority,
        poolMint: poolMint,
        userPoolAta: userPoolAta.address,
        owner: ownerPubkey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts);

    // 如果有额外的签名者，添加它们
    if (signers && signers.length > 0) {
      methodBuilder.signers(signers);
    }

    const signature = await methodBuilder.rpc();
    return signature;
  }

  /**
   * 移除流动性
   * @param pool - Pool 地址
   * @param params - 移除流动性参数
   * @param owner - 用户地址（可选，默认使用 provider.wallet.publicKey）
   * @param signers - 额外的签名者（可选，用于需要额外签名的情况）
   */
  async removeLiquidity(
    pool: PublicKey,
    params: RemoveLiquidityParams,
    owner?: PublicKey,
    signers?: Keypair[]
  ): Promise<string> {
    const [poolAuthority] = getPoolAuthority(this.program, pool);
    const poolMint = getPoolMint(this.program, pool);
    const ownerPubkey = owner || this.provider.wallet.publicKey;

    // 获取用户的 LP token 账户
    const userPoolAta = await token.getAssociatedTokenAddress(
      poolMint,
      ownerPubkey
    );

    // 构建 remaining accounts：每两个账户为一对 (user_token_account, vault_account)
    const remainingAccounts = [];
    for (let i = 0; i < params.userTokenAccounts.length; i++) {
      remainingAccounts.push({
        pubkey: params.userTokenAccounts[i],
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: params.vaultAccounts[i],
        isSigner: false,
        isWritable: true,
      });
    }

    const methodBuilder = this.program.methods
      .removeLiquidity(params.burnAmount)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthority,
        poolMint: poolMint,
        userPoolAta: userPoolAta,
        owner: ownerPubkey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts);

    // 如果有额外的签名者，添加它们
    if (signers && signers.length > 0) {
      methodBuilder.signers(signers);
    }

    const signature = await methodBuilder.rpc();
    return signature;
  }

  /**
   * 获取 Pool 账户信息
   */
  async getPool(pool: PublicKey): Promise<AnySwapPool> {
    const poolAccount = await this.program.account.anySwapPool.fetch(pool);
    const tokens = poolAccount.tokens.slice(0, poolAccount.tokenCount);
    return {
      address: pool,
      admin: poolAccount.admin,
      feeNumerator: poolAccount.feeNumerator,
      feeDenominator: poolAccount.feeDenominator,
      lpMint: getPoolMint(this.program, pool),
      lpSupply: poolAccount.totalAmountMinted,
      tokens: tokens,
      tokenCount: poolAccount.tokenCount,
    }
  }

  /**
   * 计算需要提供的 WSOL 流动性（当添加 WSOL token 到已有流动性的 pool 时）
   */
  async calculateRequiredWSOLLiquidity(
    pool: PublicKey,
    weight: BN
  ): Promise<BN> {
    const poolAccount = await this.getPool(pool);
    const tokens = poolAccount.tokens;

    // 计算 base = sum(vault_i * weight_i)
    let base = new BN(0);
    for (const tokenInfo of tokens) {
      const vaultBalance = await token.getAccount(
        this.connection,
        tokenInfo.vaultAccount
      );
      const vaultAmount = new BN(vaultBalance.amount.toString());
      base = base.add(vaultAmount.mul(tokenInfo.weight));
    }

    // 计算需要的 WSOL 流动性：vault_new * weight_new = base
    // vault_new = base / weight_new
    const requiredLiquidity = base.div(weight);

    return requiredLiquidity;
  }

  /**
   * 包装 SOL 为 WSOL（用于添加 WSOL 流动性）
   * @param amount - 要包装的 SOL 数量（lamports）
   * @param owner - 用户地址（可选，默认使用 provider.wallet.publicKey）
   * @param signers - 额外的签名者（可选，当 owner 不是 provider.wallet 时需要）
   */
  async wrapSOL(
    amount: number,
    owner?: PublicKey,
    signers?: Keypair[]
  ): Promise<{ wsolAccount: PublicKey; signature: string }> {
    const WSOL_MINT = new PublicKey(
      "So11111111111111111111111111111111111111112"
    );
    const ownerPubkey = owner || this.provider.wallet.publicKey;

    // 获取或创建 WSOL token 账户
    const payer = (this.provider.wallet as any).payer || this.provider.wallet;
    const wsolAccount = await token.getOrCreateAssociatedTokenAccount(
      this.connection,
      payer as any,
      WSOL_MINT,
      ownerPubkey
    );

    // 转账 SOL 到 WSOL 账户
    const transferSolIx = SystemProgram.transfer({
      fromPubkey: ownerPubkey,
      toPubkey: wsolAccount.address,
      lamports: amount,
    });

    // 同步原生余额（将 SOL 转换为 WSOL）
    const syncNativeIx = token.createSyncNativeInstruction(
      wsolAccount.address,
      token.TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(transferSolIx, syncNativeIx);
    
    // 如果有额外的签名者，添加它们
    const finalSigners = signers || [];
    const signature = await this.provider.sendAndConfirm(tx, finalSigners, {
      skipPreflight: false,
    });

    return { wsolAccount: wsolAccount.address, signature };
  }
}
