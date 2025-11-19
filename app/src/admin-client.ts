import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import type { Anyswap } from "../../target/types/anyswap";
import * as token from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  Connection,
  Signer,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getPoolAuthority,
  getPoolMint,
  getVault,
  getPoolSpace,
} from "./utils";
import { CreatePoolResult } from "./types";

export interface AdminClientInterface {
  createPool: (poolId: BN, feeNumerator: BN, feeDenominator: BN, 
    admin?: PublicKey, poolKeypair?: Keypair) => Promise<CreatePoolResult>;
  addTokenToPool: (pool: PublicKey, mint: PublicKey, weight: BN, existingVaults?: PublicKey[], admin?: PublicKey) => Promise<string>;
  removeTokenFromPool: (pool: PublicKey, mint: PublicKey, admin?: PublicKey) => Promise<string>;
  modifyTokenWeight: (pool: PublicKey, mint: PublicKey, newWeight: BN, admin?: PublicKey) => Promise<string>;
  modifyFee: (pool: PublicKey, feeNumerator: BN, feeDenominator: BN, admin?: PublicKey) => Promise<string>;
}

/**
 * AnySwap 管理员客户端类
 * 提供管理员权限的操作：创建池、修改费率、修改权重、添加/移除 token
 */
export class AdminClient implements AdminClientInterface {
  public program: Program<Anyswap>;
  public connection: Connection;
  public provider: anchor.AnchorProvider;

  constructor(provider: anchor.AnchorProvider, program: Program<Anyswap>) {
    this.provider = provider;
    this.program = program;
    this.connection = provider.connection;
  }

  /**
   * 在客户端创建 Pool
   * 因为 pool 账户太大（73KB），超过 CPI 的 10KB 限制，所以必须在客户端预先创建账户
   * @param poolId - Pool ID
   * @param feeNumerator - 手续费分子
   * @param feeDenominator - 手续费分母
   * @param admin - 管理员地址（可选，默认使用 provider.wallet.publicKey）
   * @param poolKeypair - Pool 账户的 Keypair（可选，如果不提供会自动生成）
   * @returns 返回创建的 pool 相关信息，包括 poolKeypair（需要保存用于后续操作）
   */
  async createPool(
    poolId: BN,
    feeNumerator: BN,
    feeDenominator: BN,
    admin?: PublicKey,
    poolKeypair?: Keypair
  ): Promise<CreatePoolResult> {
    const adminPubkey = admin || this.provider.wallet.publicKey;
    
    // 创建或使用提供的 pool 账户（普通账户，不是 PDA）
    const finalPoolKeypair = poolKeypair || Keypair.generate();
    const pool = finalPoolKeypair.publicKey;

    // 计算 pool authority PDA
    const [poolAuthority, poolAuthorityBump] = getPoolAuthority(
      this.program,
      pool
    );

    // 计算 pool mint PDA
    const poolMint = getPoolMint(this.program, pool);

    console.log("Pool:", pool.toString());
    console.log("Pool Authority PDA:", poolAuthority.toString());
    console.log("Pool Mint:", poolMint.toString());

    // 计算账户大小和所需 lamports
    const poolSpace = getPoolSpace();
    const lamports =
      await this.connection.getMinimumBalanceForRentExemption(poolSpace);

    // 在客户端预先创建 pool 账户
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: this.provider.wallet.publicKey,
      newAccountPubkey: pool,
      space: poolSpace,
      lamports,
      programId: this.program.programId,
    });

    // 创建 createPool 指令
    const createPoolIx = await this.program.methods
      .createPool(poolId, feeNumerator, feeDenominator)
      .accountsPartial({
        poolCreator: adminPubkey,
        pool: pool,
        poolAuthority: poolAuthority,
        poolMint: poolMint,
        admin: adminPubkey,
        payer: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    // 构建交易
    const tx = new Transaction().add(createAccountIx, createPoolIx);

    // 发送交易
    // poolKeypair 必须签名（因为它是新创建的账户）
    // admin 通过 provider.wallet 自动签名
    const signature = await this.provider.sendAndConfirm(
      tx,
      [finalPoolKeypair],
      {
        skipPreflight: false,
      }
    );

    console.log("创建 Pool 交易签名:", signature);

    return {
      pool,
      poolKeypair: finalPoolKeypair,
      poolAuthority,
      poolAuthorityBump,
      poolMint,
      signature,
    };
  }

  /**
   * 添加 token 到 Pool
   * @param pool - Pool 地址
   * @param mint - Token mint 地址
   * @param weight - Token 权重
   * @param existingVaults - 现有 vault 列表（可选）
   * @param admin - 管理员地址（可选，默认使用 provider.wallet.publicKey）
   */
  async addTokenToPool(
    pool: PublicKey,
    mint: PublicKey,
    weight: BN,
    existingVaults: PublicKey[] = [],
    admin?: PublicKey
  ): Promise<string> {
    const vault = getVault(this.program, pool, mint);
    const [poolAuthority] = getPoolAuthority(this.program, pool);
    const adminPubkey = admin || this.provider.wallet.publicKey;

    // 获取或创建 admin 的 token 账户（ATA）
    const adminTokenAccount = await token.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.provider.wallet as any,
      mint,
      adminPubkey
    );

    let vaultAccounts = existingVaults;

    if (!vaultAccounts || vaultAccounts.length === 0) {
      try {
        const poolAccount = await this.program.account.anySwapPool.fetch(pool);
        const tokenCount = Number(poolAccount.tokenCount ?? 0);
        vaultAccounts = poolAccount.tokens
          .slice(0, tokenCount)
          .map((tokenInfo: any) => new PublicKey(tokenInfo.vaultAccount));
      } catch (error) {
        console.warn("获取 pool vault 列表失败:", error);
        vaultAccounts = [];
      }
    }

    // 构建 remaining accounts（现有 vault 列表）
    const remainingAccounts = vaultAccounts.map((vault) => ({
      pubkey: vault,
      isSigner: false,
      isWritable: false,
    }));

    const signature = await this.program.methods
      .addTokenToPool(weight)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthority,
        mint: mint,
        vault: vault,
        adminToken: adminTokenAccount.address,
        admin: adminPubkey,
        payer: this.provider.wallet.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();

    return signature;
  }

  /**
   * 从 Pool 移除 token
   * @param pool - Pool 地址
   * @param mint - Token mint 地址
   * @param admin - 管理员地址（可选，默认使用 provider.wallet.publicKey）
   */
  async removeTokenFromPool(
    pool: PublicKey,
    mint: PublicKey,
    admin?: PublicKey
  ): Promise<string> {
    const adminPubkey = admin || this.provider.wallet.publicKey;
    
    const signature = await this.program.methods
      .removeTokenFromPool()
      .accounts({
        pool: pool,
        mint: mint,
        admin: adminPubkey,
      })
      .rpc();

    return signature;
  }

  /**
   * 修改 token 的权重
   * @param pool - Pool 地址
   * @param mint - Token mint 地址
   * @param newWeight - 新权重
   * @param admin - 管理员地址（可选，默认使用 provider.wallet.publicKey）
   */
  async modifyTokenWeight(
    pool: PublicKey,
    mint: PublicKey,
    newWeight: BN,
    admin?: PublicKey
  ): Promise<string> {
    const adminPubkey = admin || this.provider.wallet.publicKey;
    
    const signature = await this.program.methods
      .modifyTokenWeight(newWeight)
      .accounts({
        pool: pool,
        mint: mint,
        admin: adminPubkey,
      })
      .rpc();

    return signature;
  }

  /**
   * 修改 pool 的费率
   * @param pool - Pool 地址
   * @param feeNumerator - 新的手续费分子
   * @param feeDenominator - 新的手续费分母
   * @param admin - 管理员地址（可选，默认使用 provider.wallet.publicKey）
   */
  async modifyFee(
    pool: PublicKey,
    feeNumerator: BN,
    feeDenominator: BN,
    admin?: PublicKey
  ): Promise<string> {
    const adminPubkey = admin || this.provider.wallet.publicKey;
    
    const signature = await this.program.methods
      .modifyFee(feeNumerator, feeDenominator)
      .accounts({
        pool: pool,
        admin: adminPubkey,
      })
      .rpc();

    return signature;
  }
}

