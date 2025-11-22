import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Anyswap } from "../target/types/anyswap";
import * as anchor from "@coral-xyz/anchor";
import * as token from "@solana/spl-token";

/**
   * 在客户端创建 Pool 的辅助函数
   * 因为 pool 账户太大（73KB），超过 CPI 的 10KB 限制，所以必须在客户端预先创建账户
   * 
   * @param program - Anchor 程序实例
   * @param connection - Solana 连接
   * @param payer - 支付账户
   * @param poolCreator - Pool 创建者（可以是任何账户）
   * @param poolId - Pool 的唯一标识符（u64）
   * @param feeNumerator - 手续费分子
   * @param feeDenominator - 手续费分母
   * @returns 返回创建的 pool 相关信息
   */
export async function createPoolOnClient(
    provider: anchor.AnchorProvider,
    program: Program<Anyswap>,
    connection: anchor.web3.Connection,
    payer: anchor.Wallet,
    poolCreator: anchor.web3.Keypair,
    feeNumerator: anchor.BN,
    feeDenominator: anchor.BN
): Promise<{
    pool: PublicKey;
    poolAuthorityPda: PublicKey;
    poolAuthorityBump: number;
    poolMint: PublicKey;
    signature: string;
}> {
    // 创建 pool 账户（普通账户，不是 PDA，类似 Openbook 的 bids/asks）
    // 使用 Keypair.generate() 创建，这样可以在客户端签名
    const poolKeypair = anchor.web3.Keypair.generate();
    const pool = poolKeypair.publicKey;

    // 计算 pool authority PDA（基于 pool 地址）
    const [poolAuthorityPda, poolAuthorityBump] =
        anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("anyswap_authority"), pool.toBuffer()],
            program.programId
        );

    // 计算 pool mint PDA（基于 pool 地址）
    const [poolMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool_mint"), pool.toBuffer()],
        program.programId
    );

    console.log("Pool:", pool.toString());
    console.log("Pool Authority PDA:", poolAuthorityPda.toString());
    console.log("Pool Mint:", poolMint.toString());

    // 计算账户大小：8 (discriminator) + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024) = 73792 bytes
    const poolSpace = 8 + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024); // 73792 bytes
    const lamports = await connection.getMinimumBalanceForRentExemption(poolSpace);

    // 在客户端预先创建 pool 账户（类似 Openbook 的 bids/asks）
    // 使用 createProgramAccountIx 创建账户指令
    const createAccountIx = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: pool,
        space: poolSpace,
        lamports,
        programId: program.programId,
    });

    // 创建 createPool 指令
    // admin 使用 poolCreator 作为管理员
    const createPoolIx = await program.methods
        .createPool(feeNumerator, feeDenominator)
        .accountsPartial({
            poolCreator: poolCreator.publicKey,
            pool: pool,
            poolAuthority: poolAuthorityPda,
            poolMint: poolMint,
            admin: poolCreator.publicKey, // 使用 poolCreator 作为 admin
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: token.TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

    // 构建交易，包含创建账户和初始化 pool 两个指令
    const tx = new anchor.web3.Transaction().add(
        createAccountIx,
        createPoolIx
    );

    // 发送交易，poolKeypair 和 poolCreator 作为签名者
    // poolKeypair 用于创建账户，poolCreator 用于 admin 签名
    const signature = await provider.sendAndConfirm(tx, [payer.payer, poolKeypair, poolCreator], {
        skipPreflight: false,
    });

    console.log("创建 Pool 交易签名:", signature);

    return {
        pool,
        poolAuthorityPda,
        poolAuthorityBump,
        poolMint,
        signature,
    };
}