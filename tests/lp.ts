import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../target/types/anyswap";
import * as token from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("anyswap LP 测试", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anyswap as Program<Anyswap>;
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  // Pool 相关
  let pool: PublicKey;
  let poolAuthorityPda: PublicKey;
  let poolAuthorityBump: number;
  let poolMint: PublicKey;
  let admin: Keypair;
  const poolId = new anchor.BN(0);

  // 费率：5/1000 = 0.5%
  const fee_numerator = new anchor.BN(5);
  const fee_denominator = new anchor.BN(1000);

  // Token 相关
  let mint0: PublicKey;
  let mint1: PublicKey;
  let mint2: PublicKey;
  let vault0: PublicKey;
  let vault1: PublicKey;
  let vault2: PublicKey;

  // 用户相关
  let user1: Keypair;
  let user2: Keypair;

  // Admin 的 token 账户
  let adminToken0Account: PublicKey;
  let adminToken1Account: PublicKey;
  let adminToken2Account: PublicKey;
  let adminPoolAta: PublicKey;

  // User1 的 token 账户
  let user1Token0Account: PublicKey;
  let user1Token1Account: PublicKey;
  let user1Token2Account: PublicKey;
  let user1PoolAta: PublicKey;

  // User2 的 token 账户
  let user2Token0Account: PublicKey;
  let user2Token1Account: PublicKey;
  let user2Token2Account: PublicKey;
  let user2PoolAta: PublicKey;

  const n_decimals = 9;

  /**
   * 在客户端创建 Pool 的辅助函数
   */
  async function createPoolOnClient(
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
    const poolKeypair = anchor.web3.Keypair.generate();
    const pool = poolKeypair.publicKey;
    
    const [poolAuthorityPda, poolAuthorityBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anyswap_authority"), pool.toBuffer()],
        program.programId
      );

    const [poolMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_mint"), pool.toBuffer()],
      program.programId
    );

    const poolSpace = 8 + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024);
    const lamports = await connection.getMinimumBalanceForRentExemption(poolSpace);

    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: pool,
      space: poolSpace,
      lamports,
      programId: program.programId,
    });

    const createPoolIx = await program.methods
      .createPool(feeNumerator, feeDenominator)
      .accountsPartial({
        poolCreator: poolCreator.publicKey,
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(
      createAccountIx,
      createPoolIx
    );

    const signature = await provider.sendAndConfirm(tx, [payer.payer, poolKeypair, poolCreator], {
      skipPreflight: false,
    });

    return {
      pool,
      poolAuthorityPda,
      poolAuthorityBump,
      poolMint,
      signature,
    };
  }

  it("步骤 1: 初始化 - 创建 pool、mint 和用户", async () => {
    // 创建 admin
    admin = Keypair.generate();
    
    // 给 admin 空投 SOL
    const adminAirdrop = await connection.requestAirdrop(
      admin.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(adminAirdrop);

    // 创建 pool
    const poolResult = await createPoolOnClient(
      program,
      connection,
      payer,
      admin,
      fee_numerator,
      fee_denominator
    );

    pool = poolResult.pool;
    poolAuthorityPda = poolResult.poolAuthorityPda;
    poolAuthorityBump = poolResult.poolAuthorityBump;
    poolMint = poolResult.poolMint;

    // 验证 pool 创建成功
    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(0);
    expect(poolAccount.feeNumerator.toNumber()).to.equal(5);
    expect(poolAccount.feeDenominator.toNumber()).to.equal(1000);
    expect(poolAccount.admin.toString()).to.equal(admin.publicKey.toString());

    console.log("✓ Pool 创建成功");
    console.log("  - Pool:", pool.toString());
    console.log("  - Admin:", admin.publicKey.toString());
    console.log("  - Token Count:", poolAccount.tokenCount);

    // 创建三个 mint
    mint0 = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      n_decimals
    );

    mint1 = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      n_decimals
    );

    mint2 = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      n_decimals
    );

    // 计算 vault PDA 地址
    const [vault0Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer(), mint0.toBuffer()],
      program.programId
    );
    vault0 = vault0Pda;

    const [vault1Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer(), mint1.toBuffer()],
      program.programId
    );
    vault1 = vault1Pda;

    const [vault2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer(), mint2.toBuffer()],
      program.programId
    );
    vault2 = vault2Pda;

    console.log("✓ Mint 和 Vault 创建成功");
    console.log("  - Mint0:", mint0.toString());
    console.log("  - Mint1:", mint1.toString());
    console.log("  - Mint2:", mint2.toString());
    console.log("  - Vault0:", vault0.toString());
    console.log("  - Vault1:", vault1.toString());
    console.log("  - Vault2:", vault2.toString());

    // 创建 user1 和 user2
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    // 给 user1 和 user2 空投 SOL
    const user1Airdrop = await connection.requestAirdrop(
      user1.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(user1Airdrop);

    const user2Airdrop = await connection.requestAirdrop(
      user2.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(user2Airdrop);

    console.log("✓ 用户创建成功");
    console.log("  - User1:", user1.publicKey.toString());
    console.log("  - User2:", user2.publicKey.toString());
  });

  it("步骤 2: 初始化 token 到 pool（添加 token0, token1）", async () => {
    const weight0 = new anchor.BN(20);
    const weight1 = new anchor.BN(40);

    // 创建 admin 的 token 账户
    const adminToken0AccountInfo = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint0,
      admin.publicKey
    );
    adminToken0Account = adminToken0AccountInfo.address;

    const adminToken1AccountInfo = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint1,
      admin.publicKey
    );
    adminToken1Account = adminToken1AccountInfo.address;

    // 添加 token0（第一个 token，pool 为空，不需要流动性）
    await program.methods
      .addTokenToPool(weight0)
      .accountsPartial({
        pool: pool,
        mint: mint0,
        vault: vault0,
        adminToken: adminToken0Account,
        admin: admin.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    const poolAccountAfterToken0 = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountAfterToken0.tokenCount).to.equal(1);
    expect(poolAccountAfterToken0.tokens[0].mintAccount.toString()).to.equal(
      mint0.toString()
    );
    expect(poolAccountAfterToken0.tokens[0].weight.toNumber()).to.equal(20);

    // 添加 token1
    await program.methods
      .addTokenToPool(weight1)
      .accountsPartial({
        pool: pool,
        mint: mint1,
        vault: vault1,
        adminToken: adminToken1Account,
        admin: admin.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vault0, isSigner: false, isWritable: false },
      ])
      .signers([admin])
      .rpc();

    // 验证 pool 状态
    const poolAccountAfterToken1 = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountAfterToken1.tokenCount).to.equal(2);
    expect(poolAccountAfterToken1.tokens[0].weight.toNumber()).to.equal(20);
    expect(poolAccountAfterToken1.tokens[1].weight.toNumber()).to.equal(40);

    console.log("✓ Token0 和 Token1 添加到 pool 成功");
    console.log("  - Token Count:", poolAccountAfterToken1.tokenCount);
    console.log(
      "  - Token0 weight:",
      poolAccountAfterToken1.tokens[0].weight.toString()
    );
    console.log(
      "  - Token1 weight:",
      poolAccountAfterToken1.tokens[1].weight.toString()
    );
  });

  it("步骤 3: Admin 提供流动性", async () => {
    // 创建 admin 的 LP token 账户
    adminPoolAta = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      poolMint,
      admin.publicKey
    );

    // 按权重比例铸造代币：权重 20:40，所以数量比例也应该是 20:40
    const baseAmount = 10000 * 10 ** n_decimals;
    const amount0 = baseAmount; // 20 的比例
    const amount1 = baseAmount * 2; // 40 的比例

    // 铸造代币到 admin 的 token 账户
    await token.mintTo(
      connection,
      payer.payer,
      mint0,
      adminToken0Account,
      payer.publicKey,
      amount0
    );
    await token.mintTo(
      connection,
      payer.payer,
      mint1,
      adminToken1Account,
      payer.publicKey,
      amount1
    );

    // 记录添加前的 vault 余额（应该都是 0）
    const vault0BalanceBefore = (await token.getAccount(connection, vault0)).amount;
    const vault1BalanceBefore = (await token.getAccount(connection, vault1)).amount;
    expect(Number(vault0BalanceBefore)).to.equal(0);
    expect(Number(vault1BalanceBefore)).to.equal(0);

    // 记录添加前的 admin token 余额
    const adminToken0BalanceBefore = (await token.getAccount(connection, adminToken0Account)).amount;
    const adminToken1BalanceBefore = (await token.getAccount(connection, adminToken1Account)).amount;

    // 添加流动性
    const amounts = [
      new anchor.BN(amount0),
      new anchor.BN(amount1),
    ];

    console.log("Admin 添加流动性:");
    console.log("  - Token0:", amounts[0].toString());
    console.log("  - Token1:", amounts[1].toString());

    await program.methods
      .addLiquidity(amounts)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: adminPoolAta,
        owner: admin.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: adminToken0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: adminToken1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
      ])
      .signers([admin])
      .rpc();

    // 验证 vault 余额增加
    const vault0BalanceAfter = (await token.getAccount(connection, vault0)).amount;
    const vault1BalanceAfter = (await token.getAccount(connection, vault1)).amount;
    expect(Number(vault0BalanceAfter)).to.equal(amount0);
    expect(Number(vault1BalanceAfter)).to.equal(amount1);

    // 验证 admin token 余额减少
    const adminToken0BalanceAfter = (await token.getAccount(connection, adminToken0Account)).amount;
    const adminToken1BalanceAfter = (await token.getAccount(connection, adminToken1Account)).amount;
    expect(Number(adminToken0BalanceAfter)).to.equal(Number(adminToken0BalanceBefore) - amount0);
    expect(Number(adminToken1BalanceAfter)).to.equal(Number(adminToken1BalanceBefore) - amount1);

    // 验证 admin 的 LP token 余额
    const adminLpBalance = await token.getAccount(connection, adminPoolAta);
    const adminLpAmount = Number(adminLpBalance.amount);
    expect(adminLpAmount).to.be.greaterThan(0);

    console.log("✓ Admin 添加流动性成功");
    console.log("  - Vault0 余额:", vault0BalanceAfter.toString());
    console.log("  - Vault1 余额:", vault1BalanceAfter.toString());
    console.log("  - Admin LP Token 余额:", adminLpAmount);
  });

  it("步骤 4: User1 提供流动性", async () => {
    // 创建 user1 的 token 账户
    user1Token0Account = await token.createAssociatedTokenAccount(
      connection,
      user1,
      mint0,
      user1.publicKey
    );
    user1Token1Account = await token.createAssociatedTokenAccount(
      connection,
      user1,
      mint1,
      user1.publicKey
    );

    // 获取当前 vault 余额，按比例添加流动性（例如 30%）
    const vault0Balance = (await token.getAccount(connection, vault0)).amount;
    const vault1Balance = (await token.getAccount(connection, vault1)).amount;
    const liquidityRatio = 0.3; // 30%
    const amount0 = BigInt(Math.floor(Number(vault0Balance) * liquidityRatio));
    const amount1 = BigInt(Math.floor(Number(vault1Balance) * liquidityRatio));

    // 铸造代币给 user1
    await token.mintTo(
      connection,
      payer.payer,
      mint0,
      user1Token0Account,
      payer.publicKey,
      Number(amount0)
    );
    await token.mintTo(
      connection,
      payer.payer,
      mint1,
      user1Token1Account,
      payer.publicKey,
      Number(amount1)
    );

    // 创建 user1 的 LP token 账户
    user1PoolAta = await token.createAssociatedTokenAccount(
      connection,
      user1,
      poolMint,
      user1.publicKey
    );

    // 记录添加前的状态
    const vault0BalanceBefore = Number(vault0Balance);
    const vault1BalanceBefore = Number(vault1Balance);
    const user1Token0BalanceBefore = Number((await token.getAccount(connection, user1Token0Account)).amount);
    const user1Token1BalanceBefore = Number((await token.getAccount(connection, user1Token1Account)).amount);

    // 添加流动性
    const amounts = [
      new anchor.BN(amount0.toString()),
      new anchor.BN(amount1.toString()),
    ];

    console.log("User1 添加流动性:");
    console.log("  - Token0:", amounts[0].toString());
    console.log("  - Token1:", amounts[1].toString());

    await program.methods
      .addLiquidity(amounts)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: user1PoolAta,
        owner: user1.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: user1Token0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: user1Token1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
      ])
      .signers([user1])
      .rpc();

    // 验证 vault 余额增加
    const vault0BalanceAfter = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceAfter = Number((await token.getAccount(connection, vault1)).amount);
    expect(vault0BalanceAfter).to.equal(vault0BalanceBefore + Number(amount0));
    expect(vault1BalanceAfter).to.equal(vault1BalanceBefore + Number(amount1));

    // 验证 user1 token 余额减少
    const user1Token0BalanceAfter = Number((await token.getAccount(connection, user1Token0Account)).amount);
    const user1Token1BalanceAfter = Number((await token.getAccount(connection, user1Token1Account)).amount);
    expect(user1Token0BalanceAfter).to.equal(user1Token0BalanceBefore - Number(amount0));
    expect(user1Token1BalanceAfter).to.equal(user1Token1BalanceBefore - Number(amount1));

    // 验证 user1 的 LP token 余额
    const user1LpBalance = await token.getAccount(connection, user1PoolAta);
    const user1LpAmount = Number(user1LpBalance.amount);
    expect(user1LpAmount).to.be.greaterThan(0);

    console.log("✓ User1 添加流动性成功");
    console.log("  - Vault0 余额:", vault0BalanceAfter);
    console.log("  - Vault1 余额:", vault1BalanceAfter);
    console.log("  - User1 LP Token 余额:", user1LpAmount);
  });

  it("步骤 5: Admin 退出一半流动性", async () => {
    // 获取 admin 的 LP token 余额
    const adminLpBalance = await token.getAccount(connection, adminPoolAta);
    const adminLpAmount = Number(adminLpBalance.amount);
    const burnAmount = Math.floor(adminLpAmount / 2);

    console.log("Admin LP Token 总余额:", adminLpAmount);
    console.log("Admin 要移除的 LP Token 数量:", burnAmount);

    // 记录移除前的状态
    const vault0BalanceBefore = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceBefore = Number((await token.getAccount(connection, vault1)).amount);
    const adminToken0BalanceBefore = Number((await token.getAccount(connection, adminToken0Account)).amount);
    const adminToken1BalanceBefore = Number((await token.getAccount(connection, adminToken1Account)).amount);

    // 移除流动性
    await program.methods
      .removeLiquidity(new anchor.BN(burnAmount))
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: adminPoolAta,
        owner: admin.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: adminToken0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: adminToken1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
      ])
      .signers([admin])
      .rpc();

    // 验证 admin LP token 余额减少
    const adminLpBalanceAfter = await token.getAccount(connection, adminPoolAta);
    const adminLpAmountAfter = Number(adminLpBalanceAfter.amount);
    expect(adminLpAmountAfter).to.equal(adminLpAmount - burnAmount);

    // 验证 admin token 余额增加
    const adminToken0BalanceAfter = Number((await token.getAccount(connection, adminToken0Account)).amount);
    const adminToken1BalanceAfter = Number((await token.getAccount(connection, adminToken1Account)).amount);
    const token0Received = adminToken0BalanceAfter - adminToken0BalanceBefore;
    const token1Received = adminToken1BalanceAfter - adminToken1BalanceBefore;
    expect(token0Received).to.be.greaterThan(0);
    expect(token1Received).to.be.greaterThan(0);

    // 验证 vault 余额减少
    const vault0BalanceAfter = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceAfter = Number((await token.getAccount(connection, vault1)).amount);
    expect(vault0BalanceAfter).to.equal(vault0BalanceBefore - token0Received);
    expect(vault1BalanceAfter).to.equal(vault1BalanceBefore - token1Received);

    console.log("✓ Admin 移除一半流动性成功");
    console.log("  - Admin LP Token 余额（移除后）:", adminLpAmountAfter);
    console.log("  - Admin 收到的 Token0:", token0Received);
    console.log("  - Admin 收到的 Token1:", token1Received);
    console.log("  - Vault0 余额:", vault0BalanceAfter);
    console.log("  - Vault1 余额:", vault1BalanceAfter);
  });

  it("步骤 6: Admin 添加 token2 到 pool", async () => {
    const weight2 = new anchor.BN(40);

    const poolAccountBeforeToken2 = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountBeforeToken2.tokenCount).to.equal(2);

    // 创建 admin 的 token2 账户
    const adminToken2AccountInfo = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint2,
      admin.publicKey
    );
    adminToken2Account = adminToken2AccountInfo.address;

    // 获取当前 vault 余额，计算需要提供的 token2 流动性
    // 基于恒定乘积和公式：vault_new * weight_new = sum(vault_i * weight_i)
    const vault0Balance = (await token.getAccount(connection, vault0)).amount;
    const vault1Balance = (await token.getAccount(connection, vault1)).amount;
    
    // 获取当前权重
    const poolAccount = await program.account.anySwapPool.fetch(pool);
    const weight0 = poolAccount.tokens[0].weight.toNumber();
    const weight1 = poolAccount.tokens[1].weight.toNumber();
    
    // 计算 base = sum(vault_i * weight_i)
    const base = (vault0Balance * BigInt(weight0)) + (vault1Balance * BigInt(weight1));
    
    // 计算需要的 token2 流动性：vault_new * weight_new = base
    const requiredLiquidity = base / BigInt(weight2.toNumber());
    
    console.log("计算 Token2 流动性:");
    console.log("  - Vault0 balance:", vault0Balance.toString(), "weight:", weight0);
    console.log("  - Vault1 balance:", vault1Balance.toString(), "weight:", weight1);
    console.log("  - Base (sum):", base.toString());
    console.log("  - Required Token2 liquidity:", requiredLiquidity.toString());

    // 铸造 token2 给 admin
    await token.mintTo(
      connection,
      payer.payer,
      mint2,
      adminToken2Account,
      payer.publicKey,
      Number(requiredLiquidity)
    );

    // 添加 token2 到 pool
    await program.methods
      .addTokenToPool(weight2)
      .accountsPartial({
        pool: pool,
        mint: mint2,
        vault: vault2,
        adminToken: adminToken2Account,
        admin: admin.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vault0, isSigner: false, isWritable: false },
        { pubkey: vault1, isSigner: false, isWritable: false },
      ])
      .signers([admin])
      .rpc();

    // 验证 pool 状态
    const poolAccountAfter = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountAfter.tokenCount).to.equal(3);
    expect(poolAccountAfter.tokens[0].weight.toNumber()).to.equal(weight0);
    expect(poolAccountAfter.tokens[1].weight.toNumber()).to.equal(weight1);
    expect(poolAccountAfter.tokens[2].weight.toNumber()).to.equal(40);
    expect(poolAccountAfter.tokens[2].mintAccount.toString()).to.equal(mint2.toString());
    expect(poolAccountAfter.tokens[2].vaultAccount.toString()).to.equal(vault2.toString());

    // 验证 vault2 余额
    const vault2Balance = (await token.getAccount(connection, vault2)).amount;
    expect(Number(vault2Balance)).to.equal(Number(requiredLiquidity));

    console.log("✓ Token2 添加到 pool 成功");
    console.log("  - Token Count:", poolAccountAfter.tokenCount);
    console.log("  - Token2 weight:", poolAccountAfter.tokens[2].weight.toString());
    console.log("  - Vault2 余额:", vault2Balance.toString());
  });

  it("步骤 7: User2 提供流动性", async () => {
    // 创建 user2 的 token 账户
    user2Token0Account = await token.createAssociatedTokenAccount(
      connection,
      user2,
      mint0,
      user2.publicKey
    );
    user2Token1Account = await token.createAssociatedTokenAccount(
      connection,
      user2,
      mint1,
      user2.publicKey
    );
    user2Token2Account = await token.createAssociatedTokenAccount(
      connection,
      user2,
      mint2,
      user2.publicKey
    );

    // 获取当前 vault 余额，按比例添加流动性（例如 25%）
    const vault0Balance = (await token.getAccount(connection, vault0)).amount;
    const vault1Balance = (await token.getAccount(connection, vault1)).amount;
    const vault2Balance = (await token.getAccount(connection, vault2)).amount;
    const liquidityRatio = 0.25; // 25%
    const amount0 = BigInt(Math.floor(Number(vault0Balance) * liquidityRatio));
    const amount1 = BigInt(Math.floor(Number(vault1Balance) * liquidityRatio));
    const amount2 = BigInt(Math.floor(Number(vault2Balance) * liquidityRatio));

    // 铸造代币给 user2
    await token.mintTo(
      connection,
      payer.payer,
      mint0,
      user2Token0Account,
      payer.publicKey,
      Number(amount0)
    );
    await token.mintTo(
      connection,
      payer.payer,
      mint1,
      user2Token1Account,
      payer.publicKey,
      Number(amount1)
    );
    await token.mintTo(
      connection,
      payer.payer,
      mint2,
      user2Token2Account,
      payer.publicKey,
      Number(amount2)
    );

    // 创建 user2 的 LP token 账户
    user2PoolAta = await token.createAssociatedTokenAccount(
      connection,
      user2,
      poolMint,
      user2.publicKey
    );

    // 记录添加前的状态
    const vault0BalanceBefore = Number(vault0Balance);
    const vault1BalanceBefore = Number(vault1Balance);
    const vault2BalanceBefore = Number(vault2Balance);
    const user2Token0BalanceBefore = Number((await token.getAccount(connection, user2Token0Account)).amount);
    const user2Token1BalanceBefore = Number((await token.getAccount(connection, user2Token1Account)).amount);
    const user2Token2BalanceBefore = Number((await token.getAccount(connection, user2Token2Account)).amount);

    // 添加流动性
    const amounts = [
      new anchor.BN(amount0.toString()),
      new anchor.BN(amount1.toString()),
      new anchor.BN(amount2.toString()),
    ];

    console.log("User2 添加流动性:");
    console.log("  - Token0:", amounts[0].toString());
    console.log("  - Token1:", amounts[1].toString());
    console.log("  - Token2:", amounts[2].toString());

    await program.methods
      .addLiquidity(amounts)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: user2PoolAta,
        owner: user2.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: user2Token0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: user2Token1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
        { pubkey: user2Token2Account, isSigner: false, isWritable: true },
        { pubkey: vault2, isSigner: false, isWritable: true },
      ])
      .signers([user2])
      .rpc();

    // 验证 vault 余额增加
    const vault0BalanceAfter = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceAfter = Number((await token.getAccount(connection, vault1)).amount);
    const vault2BalanceAfter = Number((await token.getAccount(connection, vault2)).amount);
    expect(vault0BalanceAfter).to.equal(vault0BalanceBefore + Number(amount0));
    expect(vault1BalanceAfter).to.equal(vault1BalanceBefore + Number(amount1));
    expect(vault2BalanceAfter).to.equal(vault2BalanceBefore + Number(amount2));

    // 验证 user2 token 余额减少
    const user2Token0BalanceAfter = Number((await token.getAccount(connection, user2Token0Account)).amount);
    const user2Token1BalanceAfter = Number((await token.getAccount(connection, user2Token1Account)).amount);
    const user2Token2BalanceAfter = Number((await token.getAccount(connection, user2Token2Account)).amount);
    expect(user2Token0BalanceAfter).to.equal(user2Token0BalanceBefore - Number(amount0));
    expect(user2Token1BalanceAfter).to.equal(user2Token1BalanceBefore - Number(amount1));
    expect(user2Token2BalanceAfter).to.equal(user2Token2BalanceBefore - Number(amount2));

    // 验证 user2 的 LP token 余额
    const user2LpBalance = await token.getAccount(connection, user2PoolAta);
    const user2LpAmount = Number(user2LpBalance.amount);
    expect(user2LpAmount).to.be.greaterThan(0);

    console.log("✓ User2 添加流动性成功");
    console.log("  - Vault0 余额:", vault0BalanceAfter);
    console.log("  - Vault1 余额:", vault1BalanceAfter);
    console.log("  - Vault2 余额:", vault2BalanceAfter);
    console.log("  - User2 LP Token 余额:", user2LpAmount);
  });

  it("步骤 8: User1 退出全部流动性", async () => {
    // 获取 user1 的 LP token 余额
    const user1LpBalance = await token.getAccount(connection, user1PoolAta);
    const user1LpAmount = Number(user1LpBalance.amount);
    expect(user1LpAmount).to.be.greaterThan(0);

    console.log("User1 LP Token 总余额:", user1LpAmount);

    // 创建 user1 的 token2 账户（如果还没有）
    if (!user1Token2Account) {
      user1Token2Account = await token.createAssociatedTokenAccount(
        connection,
        user1,
        mint2,
        user1.publicKey
      );
    }

    // 记录移除前的状态
    const vault0BalanceBefore = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceBefore = Number((await token.getAccount(connection, vault1)).amount);
    const vault2BalanceBefore = Number((await token.getAccount(connection, vault2)).amount);
    const user1Token0BalanceBefore = Number((await token.getAccount(connection, user1Token0Account)).amount);
    const user1Token1BalanceBefore = Number((await token.getAccount(connection, user1Token1Account)).amount);
    const user1Token2BalanceBefore = Number((await token.getAccount(connection, user1Token2Account)).amount);

    // 移除全部流动性
    await program.methods
      .removeLiquidity(new anchor.BN(user1LpAmount))
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: user1PoolAta,
        owner: user1.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: user1Token0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: user1Token1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
        { pubkey: user1Token2Account, isSigner: false, isWritable: true },
        { pubkey: vault2, isSigner: false, isWritable: true },
      ])
      .signers([user1])
      .rpc();

    // 验证 user1 LP token 余额为 0
    const user1LpBalanceAfter = await token.getAccount(connection, user1PoolAta);
    const user1LpAmountAfter = Number(user1LpBalanceAfter.amount);
    expect(user1LpAmountAfter).to.equal(0);

    // 验证 user1 token 余额增加
    const user1Token0BalanceAfter = Number((await token.getAccount(connection, user1Token0Account)).amount);
    const user1Token1BalanceAfter = Number((await token.getAccount(connection, user1Token1Account)).amount);
    const user1Token2BalanceAfter = Number((await token.getAccount(connection, user1Token2Account)).amount);
    const token0Received = user1Token0BalanceAfter - user1Token0BalanceBefore;
    const token1Received = user1Token1BalanceAfter - user1Token1BalanceBefore;
    const token2Received = user1Token2BalanceAfter - user1Token2BalanceBefore;
    expect(token0Received).to.be.greaterThan(0);
    expect(token1Received).to.be.greaterThan(0);
    // token2 可能为 0，因为 user1 添加流动性时 pool 还没有 token2
    expect(token2Received).to.be.at.least(0);

    // 验证 vault 余额减少
    const vault0BalanceAfter = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceAfter = Number((await token.getAccount(connection, vault1)).amount);
    const vault2BalanceAfter = Number((await token.getAccount(connection, vault2)).amount);
    expect(vault0BalanceAfter).to.equal(vault0BalanceBefore - token0Received);
    expect(vault1BalanceAfter).to.equal(vault1BalanceBefore - token1Received);
    expect(vault2BalanceAfter).to.equal(vault2BalanceBefore - token2Received);

    console.log("✓ User1 移除全部流动性成功");
    console.log("  - User1 LP Token 余额（移除后）:", user1LpAmountAfter);
    console.log("  - User1 收到的 Token0:", token0Received);
    console.log("  - User1 收到的 Token1:", token1Received);
    console.log("  - User1 收到的 Token2:", token2Received);
    console.log("  - Vault0 余额:", vault0BalanceAfter);
    console.log("  - Vault1 余额:", vault1BalanceAfter);
    console.log("  - Vault2 余额:", vault2BalanceAfter);

    // 最终验证：检查所有用户的 LP token 余额
    const adminLpBalance = await token.getAccount(connection, adminPoolAta);
    const user2LpBalance = await token.getAccount(connection, user2PoolAta);
    console.log("\n最终状态:");
    console.log("  - Admin LP Token 余额:", Number(adminLpBalance.amount));
    console.log("  - User1 LP Token 余额:", user1LpAmountAfter);
    console.log("  - User2 LP Token 余额:", Number(user2LpBalance.amount));
  });

  it("步骤 9: Admin 移除 token2 从 pool", async () => {
    // 记录移除前的 pool 状态
    const poolAccountBefore = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountBefore.tokenCount).to.equal(3);
    expect(poolAccountBefore.tokens[2].mintAccount.toString()).to.equal(mint2.toString());

    // 记录移除前的 vault2 余额（应该不为0，因为还有流动性）
    const vault2BalanceBefore = (await token.getAccount(connection, vault2)).amount;
    expect(Number(vault2BalanceBefore)).to.be.greaterThan(0);
    console.log("移除前 Vault2 余额:", vault2BalanceBefore.toString());

    // 移除 token2
    await program.methods
      .removeTokenFromPool()
      .accounts({
        pool: pool,
        mint: mint2,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    // 验证 pool 状态
    const poolAccountAfter = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountAfter.tokenCount).to.equal(2);
    // 验证 token0 和 token1 还在
    expect(poolAccountAfter.tokens[0].mintAccount.toString()).to.equal(mint0.toString());
    expect(poolAccountAfter.tokens[1].mintAccount.toString()).to.equal(mint1.toString());

    console.log("✓ Token2 从 pool 移除成功");
    console.log("  - Token Count:", poolAccountAfter.tokenCount);
    console.log("  - Token0 mint:", poolAccountAfter.tokens[0].mintAccount.toString());
    console.log("  - Token1 mint:", poolAccountAfter.tokens[1].mintAccount.toString());
    console.log("  - Vault2 余额（移除后，应该保持不变）:", vault2BalanceBefore.toString());
  });

  it("步骤 10: User2 退出一半流动性（此时 pool 中只有 token0 和 token1）", async () => {
    // 获取 user2 的 LP token 余额
    const user2LpBalance = await token.getAccount(connection, user2PoolAta);
    const user2LpAmount = Number(user2LpBalance.amount);
    expect(user2LpAmount).to.be.greaterThan(0);
    const burnAmount = Math.floor(user2LpAmount / 2);

    console.log("User2 LP Token 总余额:", user2LpAmount);
    console.log("User2 要移除的 LP Token 数量:", burnAmount);

    // 验证 pool 中只有 token0 和 token1
    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(2);
    console.log("Pool 中 Token Count:", poolAccount.tokenCount);

    // 记录移除前的状态
    const vault0BalanceBefore = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceBefore = Number((await token.getAccount(connection, vault1)).amount);
    const user2Token0BalanceBefore = Number((await token.getAccount(connection, user2Token0Account)).amount);
    const user2Token1BalanceBefore = Number((await token.getAccount(connection, user2Token1Account)).amount);
    const user2Token2BalanceBefore = Number((await token.getAccount(connection, user2Token2Account)).amount);

    console.log("移除前状态:");
    console.log("  - Vault0 余额:", vault0BalanceBefore);
    console.log("  - Vault1 余额:", vault1BalanceBefore);
    console.log("  - User2 Token0 余额:", user2Token0BalanceBefore);
    console.log("  - User2 Token1 余额:", user2Token1BalanceBefore);
    console.log("  - User2 Token2 余额:", user2Token2BalanceBefore);

    // 移除一半流动性（只需要 token0 和 token1，因为 token2 已经从 pool 中移除）
    await program.methods
      .removeLiquidity(new anchor.BN(burnAmount))
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: user2PoolAta,
        owner: user2.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: user2Token0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: user2Token1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
      ])
      .signers([user2])
      .rpc();

    // 验证 user2 LP token 余额减少
    const user2LpBalanceAfter = await token.getAccount(connection, user2PoolAta);
    const user2LpAmountAfter = Number(user2LpBalanceAfter.amount);
    expect(user2LpAmountAfter).to.equal(user2LpAmount - burnAmount);

    // 验证 user2 token 余额变化
    const user2Token0BalanceAfter = Number((await token.getAccount(connection, user2Token0Account)).amount);
    const user2Token1BalanceAfter = Number((await token.getAccount(connection, user2Token1Account)).amount);
    const user2Token2BalanceAfter = Number((await token.getAccount(connection, user2Token2Account)).amount);
    
    const token0Received = user2Token0BalanceAfter - user2Token0BalanceBefore;
    const token1Received = user2Token1BalanceAfter - user2Token1BalanceBefore;
    const token2Received = user2Token2BalanceAfter - user2Token2BalanceBefore;

    // 应该收到 token0 和 token1
    expect(token0Received).to.be.greaterThan(0);
    expect(token1Received).to.be.greaterThan(0);
    
    // 关键验证：user2 不应该收到任何 token2（因为 token2 已经从 pool 中移除）
    expect(token2Received).to.equal(0);

    // 验证 vault 余额减少
    const vault0BalanceAfter = Number((await token.getAccount(connection, vault0)).amount);
    const vault1BalanceAfter = Number((await token.getAccount(connection, vault1)).amount);
    expect(vault0BalanceAfter).to.equal(vault0BalanceBefore - token0Received);
    expect(vault1BalanceAfter).to.equal(vault1BalanceBefore - token1Received);

    console.log("✓ User2 移除一半流动性成功");
    console.log("  - User2 LP Token 余额（移除后）:", user2LpAmountAfter);
    console.log("  - User2 收到的 Token0:", token0Received);
    console.log("  - User2 收到的 Token1:", token1Received);
    console.log("  - User2 收到的 Token2:", token2Received, "(应该为 0，因为 token2 已从 pool 移除)");
    console.log("  - Vault0 余额:", vault0BalanceAfter);
    console.log("  - Vault1 余额:", vault1BalanceAfter);
    console.log("  - User2 Token2 余额（保持不变）:", user2Token2BalanceAfter);
    
    // 最终验证：user2 的 token2 余额应该和移除前一样
    expect(user2Token2BalanceAfter).to.equal(user2Token2BalanceBefore);
  });
});

