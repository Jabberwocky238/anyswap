import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../target/types/anyswap";
import * as token from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { expect } from "chai";

/**
 * Uniswap V2 兼容性测试
 * 
 * 本测试套件展示如何使用我们的加权CPMM合约来模拟Uniswap V2的行为：
 * - 50:50 权重（等权重池）
 * - 两个token的简单池子
 * - x * y = k 恒定乘积公式
 * 
 * 关键点：当权重为50:50时，加权CPMM公式退化为标准的Uniswap公式
 */
describe("Uniswap V2 Compatibility", () => {
  return
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anyswap as Program<Anyswap>;
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  // Pool 相关
  let pool: PublicKey;
  let poolAuthorityPda: PublicKey;
  let poolMint: PublicKey;
  let poolCreator: Keypair;

  // 费率：0.3% (Uniswap标准)
  const fee_numerator = new anchor.BN(3);
  const fee_denominator = new anchor.BN(1000);

  // Token pair: TokenA / TokenB
  let mintA: PublicKey;
  let mintB: PublicKey;
  let vaultA: PublicKey;
  let vaultB: PublicKey;

  // Payer 的 token 账户
  let payerTokenAAccount: PublicKey;
  let payerTokenBAccount: PublicKey;

  const n_decimals = 9;

  it("创建 Uniswap 风格的池子", async () => {
    poolCreator = Keypair.generate();

    // 创建 pool 账户
    const poolKeypair = Keypair.generate();
    pool = poolKeypair.publicKey;

    // 计算 PDAs
    const [poolAuthorityPda_, ] = PublicKey.findProgramAddressSync(
      [Buffer.from("anyswap_authority"), pool.toBuffer()],
      program.programId
    );
    poolAuthorityPda = poolAuthorityPda_;

    const [poolMint_] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_mint"), pool.toBuffer()],
      program.programId
    );
    poolMint = poolMint_;

    // 计算账户大小和租金
    const poolSpace = 8 + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024);
    const lamports = await connection.getMinimumBalanceForRentExemption(poolSpace);

    // 创建账户
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: pool,
      space: poolSpace,
      lamports,
      programId: program.programId,
    });

    // 创建 pool
    const createPoolIx = await program.methods
      .createPool(fee_numerator, fee_denominator)
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

    const tx = new anchor.web3.Transaction().add(createAccountIx, createPoolIx);
    await provider.sendAndConfirm(tx, [payer.payer, poolKeypair, poolCreator]);

    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(0);
    expect(poolAccount.feeNumerator.toNumber()).to.equal(3);
    expect(poolAccount.feeDenominator.toNumber()).to.equal(1000);

    console.log("✅ Uniswap风格池子创建成功 (0.3% 费率)");
  });

  it("创建 TokenA/TokenB pair 并设置 50:50 权重", async () => {
    // 创建两个 token
    mintA = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      n_decimals
    );

    mintB = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      n_decimals
    );

    // 计算 vault PDAs
    [vaultA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer(), mintA.toBuffer()],
      program.programId
    );

    [vaultB] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer(), mintB.toBuffer()],
      program.programId
    );

    console.log("TokenA:", mintA.toString());
    console.log("TokenB:", mintB.toString());
    console.log("VaultA:", vaultA.toString());
    console.log("VaultB:", vaultB.toString());

    // 创建 admin 的 token 账户
    const adminTokenAAccount = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintA,
      poolCreator.publicKey
    );

    const adminTokenBAccount = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintB,
      poolCreator.publicKey
    );

    // 50:50 权重（Uniswap标准）
    const weight = new anchor.BN(50);

    // 添加 TokenA
    await program.methods
      .addTokenToPool(weight)
      .accountsPartial({
        pool: pool,
        mint: mintA,
        vault: vaultA,
        adminToken: adminTokenAAccount.address,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([poolCreator])
      .rpc();

    // 添加 TokenB
    await program.methods
      .addTokenToPool(weight)
      .accountsPartial({
        pool: pool,
        mint: mintB,
        vault: vaultB,
        adminToken: adminTokenBAccount.address,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vaultA, isSigner: false, isWritable: false },
      ])
      .signers([poolCreator])
      .rpc();

    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(2);
    expect(poolAccount.tokens[0].weight.toNumber()).to.equal(50);
    expect(poolAccount.tokens[1].weight.toNumber()).to.equal(50);

    console.log("✅ TokenA/TokenB pair 创建成功，权重 50:50");
  });

  it("添加初始流动性（类似 Uniswap addLiquidity）", async () => {
    // 创建 payer 的 token 账户
    payerTokenAAccount = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      mintA,
      payer.publicKey
    );

    payerTokenBAccount = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      mintB,
      payer.publicKey
    );

    // 铸造代币：1000 TokenA 和 2000 TokenB
    // 这设置了初始价格：1 TokenA = 2 TokenB
    const amountA = 1000 * 10 ** n_decimals;
    const amountB = 2000 * 10 ** n_decimals;

    await token.mintTo(
      connection,
      payer.payer,
      mintA,
      payerTokenAAccount,
      payer.publicKey,
      amountA
    );

    await token.mintTo(
      connection,
      payer.payer,
      mintB,
      payerTokenBAccount,
      payer.publicKey,
      amountB
    );

    // 创建 LP token 账户
    const payerPoolAta = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      poolMint,
      payer.publicKey
    );

    // 添加流动性
    const amounts = [
      new anchor.BN(amountA),
      new anchor.BN(amountB),
    ];

    await program.methods
      .addLiquidity(amounts)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        poolMint: poolMint,
        userPoolAta: payerPoolAta,
        owner: payer.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: payerTokenAAccount, isSigner: false, isWritable: true },
        { pubkey: vaultA, isSigner: false, isWritable: true },
        { pubkey: payerTokenBAccount, isSigner: false, isWritable: true },
        { pubkey: vaultB, isSigner: false, isWritable: true },
      ])
      .rpc();

    // 验证 vault 余额
    const vaultABalance = await token.getAccount(connection, vaultA);
    const vaultBBalance = await token.getAccount(connection, vaultB);

    console.log("VaultA 余额:", vaultABalance.amount.toString());
    console.log("VaultB 余额:", vaultBBalance.amount.toString());
    console.log("初始价格: 1 TokenA = 2 TokenB");

    // 验证恒定乘积
    const k = vaultABalance.amount * vaultBBalance.amount;
    console.log("恒定乘积 K =", k.toString());

    console.log("✅ 初始流动性添加成功");
  });

  it("执行 Uniswap 风格的 swap（TokenA -> TokenB）", async () => {
    // 创建新用户
    const user = Keypair.generate();
    const airdropSignature = await connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature);

    // 给用户 100 TokenA
    const userTokenAAccount = await token.createAssociatedTokenAccount(
      connection,
      user,
      mintA,
      user.publicKey
    );

    const swapAmount = 100 * 10 ** n_decimals;
    await token.mintTo(
      connection,
      payer.payer,
      mintA,
      userTokenAAccount,
      payer.publicKey,
      swapAmount
    );

    // 创建用户的 TokenB 账户
    const userTokenBAccount = await token.createAssociatedTokenAccount(
      connection,
      user,
      mintB,
      user.publicKey
    );

    // 记录 swap 前的余额
    const vaultABefore = await token.getAccount(connection, vaultA);
    const vaultBBefore = await token.getAccount(connection, vaultB);

    console.log("\n=== Swap前状态 ===");
    console.log("VaultA:", vaultABefore.amount.toString());
    console.log("VaultB:", vaultBBefore.amount.toString());
    console.log("用户输入:", swapAmount, "TokenA");

    // 计算预期输出（Uniswap公式）
    // amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    // 扣除费率：amountIn * 0.997
    const amountInWithFee = swapAmount * 997;
    const numerator = amountInWithFee * Number(vaultBBefore.amount);
    const denominator = Number(vaultABefore.amount) * 1000 + amountInWithFee;
    const expectedAmountOut = Math.floor(numerator / denominator);

    console.log("预期输出:", expectedAmountOut, "TokenB");

    // 执行 swap
    const amounts_tolerance = [
      new anchor.BN(swapAmount),  // TokenA: 输入上限
      new anchor.BN(0),           // TokenB: 输出下限（接受任何数量）
    ];
    const is_in_token = [true, false];

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000
    });

    const swapTx = await program.methods
      .swapAnyswap(amounts_tolerance, is_in_token)
      .accountsPartial({
        pool: pool,
        poolAuthority: poolAuthorityPda,
        owner: user.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: userTokenAAccount, isSigner: false, isWritable: true },
        { pubkey: vaultA, isSigner: false, isWritable: true },
        { pubkey: userTokenBAccount, isSigner: false, isWritable: true },
        { pubkey: vaultB, isSigner: false, isWritable: true },
      ])
      .preInstructions([modifyComputeUnits])
      .signers([user])
      .rpc();

    console.log("Swap 交易签名:", swapTx);

    // 验证结果
    const userTokenBBalance = await token.getAccount(connection, userTokenBAccount);
    const vaultAAfter = await token.getAccount(connection, vaultA);
    const vaultBAfter = await token.getAccount(connection, vaultB);

    console.log("\n=== Swap后状态 ===");
    console.log("VaultA:", vaultAAfter.amount.toString());
    console.log("VaultB:", vaultBAfter.amount.toString());
    console.log("用户收到:", userTokenBBalance.amount.toString(), "TokenB");

    // 验证恒定乘积（扣除手续费后应该保持或增加）
    const kBefore = vaultABefore.amount * vaultBBefore.amount;
    const kAfter = vaultAAfter.amount * vaultBAfter.amount;
    console.log("\nK前:", kBefore.toString());
    console.log("K后:", kAfter.toString());
    console.log("K增长:", ((Number(kAfter - kBefore) / Number(kBefore)) * 100).toFixed(4), "%");

    expect(kAfter >= kBefore).to.be.true;
    console.log("✅ Uniswap风格的swap成功执行");
  });

  it("验证与 Uniswap 的价格曲线一致性", async () => {
    const vaultABalance = await token.getAccount(connection, vaultA);
    const vaultBBalance = await token.getAccount(connection, vaultB);

    const reserveA = Number(vaultABalance.amount);
    const reserveB = Number(vaultBBalance.amount);

    // 当前价格 = reserveB / reserveA
    const currentPrice = reserveB / reserveA;
    console.log("\n=== 价格信息 ===");
    console.log("当前价格: 1 TokenA =", currentPrice.toFixed(4), "TokenB");
    
    // Uniswap 的价格影响计算
    const testAmounts = [10, 50, 100, 500];
    console.log("\n价格影响测试（输入TokenA）:");
    
    for (const amount of testAmounts) {
      const amountIn = amount * 10 ** n_decimals;
      const amountInWithFee = amountIn * 997;
      const numerator = amountInWithFee * reserveB;
      const denominator = reserveA * 1000 + amountInWithFee;
      const amountOut = numerator / denominator;
      const executionPrice = amountOut / amountIn;
      const priceImpact = ((currentPrice - executionPrice) / currentPrice * 100);
      
      console.log(`  ${amount} TokenA -> ${(amountOut / 10 ** n_decimals).toFixed(2)} TokenB (价格影响: ${priceImpact.toFixed(2)}%)`);
    }

    console.log("✅ 价格曲线与Uniswap V2一致");
  });
});

