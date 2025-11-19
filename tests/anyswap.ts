import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../target/types/anyswap";
import * as token from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";


// mint0, mint1, mint2, mint3
// vault0, vault1, vault2, vault3
// admin, user0, user1, user2

describe("anyswap", () => {
  return;
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
  let poolCreator: Keypair;
  const poolId = new anchor.BN(0); // 第一个 pool 使用 id 0

  // 费率：5/1000 = 0.5%
  const fee_numerator = new anchor.BN(5);
  const fee_denominator = new anchor.BN(1000);

  // Token 相关 - 三个 token + SOL (WSOL)
  let mint0: PublicKey;
  let mint1: PublicKey;
  let mint2: PublicKey;
  let mint3: PublicKey; // WSOL (Wrapped SOL)
  let vault0: PublicKey;
  let vault1: PublicKey;
  let vault2: PublicKey;
  let vault3: PublicKey; // WSOL vault

  // Payer 的 token 账户（用于添加流动性）
  let payerToken0Account: PublicKey;
  let payerToken1Account: PublicKey;
  let payerToken2Account: PublicKey;

  const n_decimals = 9;

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
  async function createPoolOnClient(
    program: Program<Anyswap>,
    connection: anchor.web3.Connection,
    payer: anchor.Wallet,
    poolCreator: anchor.web3.Keypair,
    poolId: anchor.BN,
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
      .createPool(poolId, feeNumerator, feeDenominator)
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

  it("在客户端创建 Pool", async () => {
    // 创建 pool creator
    poolCreator = Keypair.generate();

    // 使用辅助函数创建 pool
    const result = await createPoolOnClient(
      program,
      connection,
      payer,
      poolCreator,
      poolId,
      fee_numerator,
      fee_denominator
    );

    // 保存结果到测试变量
    pool = result.pool;
    poolAuthorityPda = result.poolAuthorityPda;
    poolAuthorityBump = result.poolAuthorityBump;
    poolMint = result.poolMint;

    // 验证 pool 账户
    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(0);
    expect(poolAccount.feeNumerator.toNumber()).to.equal(5);
    expect(poolAccount.feeDenominator.toNumber()).to.equal(1000);

    console.log("Pool 创建成功:");
    console.log("  - Token Count:", poolAccount.tokenCount);
    console.log("  - Admin:", poolAccount.admin.toString());
    console.log("  - Fee:", poolAccount.feeNumerator.toString(), "/", poolAccount.feeDenominator.toString());
  });

  it("创建三个 token 和 vault", async () => {
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

    // 计算 vault PDA 地址（由程序自动创建）
    // seeds = [b"vault", pool.key(), mint.key()]
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

    console.log("Token 和 Vault PDA 地址计算成功:");
    console.log("  - Mint0:", mint0.toString());
    console.log("  - Mint1:", mint1.toString());
    console.log("  - Mint2:", mint2.toString());
    console.log("  - Vault0 (PDA):", vault0.toString());
    console.log("  - Vault1 (PDA):", vault1.toString());
    console.log("  - Vault2 (PDA):", vault2.toString());
  });

  it("初始化三个 token，权重 20, 40, 40", async () => {
    const weight0 = new anchor.BN(20);
    const weight1 = new anchor.BN(40);
    const weight2 = new anchor.BN(40);

    // 获取或创建 admin 的 token 账户（ATA）
    // 注意：getOrCreateAssociatedTokenAccount 的第一个参数是 payer，用于支付创建账户的费用
    const adminToken0Account = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer, // 使用 payer 支付创建账户的费用
      mint0,
      poolCreator.publicKey
    );
    const adminToken1Account = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint1,
      poolCreator.publicKey
    );
    const adminToken2Account = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint2,
      poolCreator.publicKey
    );

    // 添加 token0（第一个 token，pool 为空，不需要流动性）
    await program.methods
      .addTokenToPool(weight0)
      .accountsPartial({
        pool: pool,
        mint: mint0,
        vault: vault0,
        adminToken: adminToken0Account.address,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([poolCreator])
      .rpc();

    // 添加 token1（pool 中已有 token0，但 vault0 为空，不需要流动性）
    await program.methods
      .addTokenToPool(weight1)
      .accountsPartial({
        pool: pool,
        mint: mint1,
        vault: vault1,
        adminToken: adminToken1Account.address,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vault0, isSigner: false, isWritable: false },
      ])
      .signers([poolCreator])
      .rpc();

    // 添加 token2（pool 中已有 token0 和 token1，但 vault 都为空，不需要流动性）
    await program.methods
      .addTokenToPool(weight2)
      .accountsPartial({
        pool: pool,
        mint: mint2,
        vault: vault2,
        adminToken: adminToken2Account.address,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vault0, isSigner: false, isWritable: false },
        { pubkey: vault1, isSigner: false, isWritable: false },
      ])
      .signers([poolCreator])
      .rpc();

    // 验证 pool 状态
    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(3);
    expect(poolAccount.tokens[0].weight.toNumber()).to.equal(20);
    expect(poolAccount.tokens[1].weight.toNumber()).to.equal(40);
    expect(poolAccount.tokens[2].weight.toNumber()).to.equal(40);

    console.log("三个 token 初始化成功:");
    console.log("  - Token Count:", poolAccount.tokenCount);
    console.log("  - Token0 weight:", poolAccount.tokens[0].weight.toString());
    console.log("  - Token1 weight:", poolAccount.tokens[1].weight.toString());
    console.log("  - Token2 weight:", poolAccount.tokens[2].weight.toString());
  });

  it("准备流动性：创建 payer 的 token 账户并铸造代币", async () => {
    // 创建 payer 的 token 账户
    payerToken0Account = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      mint0,
      payer.publicKey
    );
    payerToken1Account = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      mint1,
      payer.publicKey
    );
    payerToken2Account = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      mint2,
      payer.publicKey
    );

    // 按比例铸造代币：权重 20:40:40，所以数量比例也应该是 20:40:40
    // 例如：10000, 20000, 20000
    const baseAmount = 10000 * 10 ** n_decimals;
    const amount0 = baseAmount; // 20 的比例
    const amount1 = baseAmount * 2; // 40 的比例
    const amount2 = baseAmount * 2; // 40 的比例

    await token.mintTo(
      connection,
      payer.payer,
      mint0,
      payerToken0Account,
      payer.publicKey,
      amount0
    );
    await token.mintTo(
      connection,
      payer.payer,
      mint1,
      payerToken1Account,
      payer.publicKey,
      amount1
    );
    await token.mintTo(
      connection,
      payer.payer,
      mint2,
      payerToken2Account,
      payer.publicKey,
      amount2
    );

    console.log("流动性准备成功:");
    console.log("  - Token0 数量:", amount0.toString());
    console.log("  - Token1 数量:", amount1.toString());
    console.log("  - Token2 数量:", amount2.toString());
  });

  it("提供流动性到 pool", async () => {
    // 创建 payer 的 LP token 账户
    const payerPoolAta = await token.createAssociatedTokenAccount(
      connection,
      payer.payer,
      poolMint,
      payer.publicKey
    );

    // 按比例的数量：20:40:40
    const baseAmount = 10000 * 10 ** n_decimals;
    const amounts = [
      new anchor.BN(baseAmount),      // token0: 10000
      new anchor.BN(baseAmount * 2),  // token1: 20000
      new anchor.BN(baseAmount * 2),  // token2: 20000
    ];

    console.log("添加流动性:");
    console.log("  - Token0:", amounts[0].toString());
    console.log("  - Token1:", amounts[1].toString());
    console.log("  - Token2:", amounts[2].toString());

    // 调用 add_liquidity
    const tx = await program.methods
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
        { pubkey: payerToken0Account, isSigner: false, isWritable: true },
        { pubkey: vault0, isSigner: false, isWritable: true },
        { pubkey: payerToken1Account, isSigner: false, isWritable: true },
        { pubkey: vault1, isSigner: false, isWritable: true },
        { pubkey: payerToken2Account, isSigner: false, isWritable: true },
        { pubkey: vault2, isSigner: false, isWritable: true },
      ])
      .rpc();

    console.log("添加流动性交易签名:", tx);

    // 验证 vault 余额
    const vault0Balance = await token.getAccount(connection, vault0);
    const vault1Balance = await token.getAccount(connection, vault1);
    const vault2Balance = await token.getAccount(connection, vault2);

    expect(vault0Balance.amount.toString()).to.equal(amounts[0].toString());
    expect(vault1Balance.amount.toString()).to.equal(amounts[1].toString());
    expect(vault2Balance.amount.toString()).to.equal(amounts[2].toString());

    console.log("Vault 余额:");
    console.log("  - Vault0:", vault0Balance.amount.toString());
    console.log("  - Vault1:", vault1Balance.amount.toString());
    console.log("  - Vault2:", vault2Balance.amount.toString());

    // 验证 LP token 余额
    const lpBalance = await token.getAccount(connection, payerPoolAta);
    const lpAmount = typeof lpBalance.amount === 'bigint' 
      ? Number(lpBalance.amount) 
      : (lpBalance.amount as any).toNumber ? (lpBalance.amount as any).toNumber() : Number(lpBalance.amount);
    expect(lpAmount).to.be.greaterThan(0);
    console.log("LP Token 余额:", lpBalance.amount.toString());
  });

  it("测试 swap 和权重修改：用户交换 token 并验证手续费", async () => {
    // 1. 创建新用户
    const user = Keypair.generate();
    
    // 给用户一些 SOL 用于交易
    const airdropSignature = await connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature);

    // 2. 给用户 mint token1，10000 个
    const userToken1Account = await token.createAssociatedTokenAccount(
      connection,
      user,
      mint1,
      user.publicKey
    );
    const swapAmount1 = 10000 * 10 ** n_decimals; // 10000 token1
    await token.mintTo(
      connection,
      payer.payer,
      mint1,
      userToken1Account,
      payer.publicKey,
      swapAmount1
    );

    // 验证用户 token1 余额
    const userToken1BalanceBefore = await token.getAccount(connection, userToken1Account);
    expect(userToken1BalanceBefore.amount.toString()).to.equal(swapAmount1.toString());
    console.log("用户 token1 余额:", userToken1BalanceBefore.amount.toString());

    // 记录初始 vault 余额
    const vault1BalanceBeforeSwap1 = await token.getAccount(connection, vault1);
    const vault2BalanceBeforeSwap1 = await token.getAccount(connection, vault2);
    console.log("Swap1 前 Vault1 余额:", vault1BalanceBeforeSwap1.amount.toString());
    console.log("Swap1 前 Vault2 余额:", vault2BalanceBeforeSwap1.amount.toString());

    // 3. 用户用 token1 交换 token2
    // 权重是 40:40，所以 amount_out = amount_in_minus_fees
    // 手续费 = swapAmount1 * 5 / 1000 = 50 * 10^9
    // amount_in_minus_fees = 10000 * 10^9 - 50 * 10^9 = 9950 * 10^9
    // amount_out = (9950 * 10^9 * 40) / 40 = 9950 * 10^9
    const expectedFee1 = Math.floor(swapAmount1 * 5 / 1000); // 50 * 10^9
    const expectedAmountInMinusFees1 = swapAmount1 - expectedFee1; // 9950 * 10^9
    const expectedAmountOut1 = Math.floor((expectedAmountInMinusFees1 * 40) / 40); // 9950 * 10^9

    // 创建用户的 token2 账户
    const userToken2Account = await token.createAssociatedTokenAccount(
      connection,
      user,
      mint2,
      user.publicKey
    );

    // 执行第一次 swap: token1 -> token2
    await program.methods
      .swapAnyswap(
        new anchor.BN(swapAmount1),
        new anchor.BN(0) // min_amount_out = 0，接受任何输出
      )
      .accountsPartial({
        pool: pool,
        vaultIn: vault1,
        vaultOut: vault2,
        userIn: userToken1Account,
        userOut: userToken2Account,
        owner: user.publicKey,
      })
      .signers([user])
      .rpc();

    // 验证用户 token2 余额
    const userToken2Balance = await token.getAccount(connection, userToken2Account);
    expect(userToken2Balance.amount.toString()).to.equal(expectedAmountOut1.toString());
    console.log("Swap1 后用户 token2 余额:", userToken2Balance.amount.toString());
    console.log("预期 token2 余额:", expectedAmountOut1.toString());

    // 验证 vault 余额变化
    const vault1BalanceAfterSwap1 = await token.getAccount(connection, vault1);
    const vault2BalanceAfterSwap1 = await token.getAccount(connection, vault2);
    const vault1Increase = Number(vault1BalanceAfterSwap1.amount) - Number(vault1BalanceBeforeSwap1.amount);
    const vault2Decrease = Number(vault2BalanceBeforeSwap1.amount) - Number(vault2BalanceAfterSwap1.amount);
    expect(vault1Increase).to.equal(swapAmount1); // vault1 应该增加 swapAmount1
    expect(vault2Decrease).to.equal(expectedAmountOut1); // vault2 应该减少 expectedAmountOut1
    console.log("Swap1 后 Vault1 余额:", vault1BalanceAfterSwap1.amount.toString());
    console.log("Swap1 后 Vault2 余额:", vault2BalanceAfterSwap1.amount.toString());

    // 4. 管理员修改权重为 40, 20, 40
    // 当前权重是 20, 40, 40，需要改为 40, 20, 40
    await program.methods
      .modifyTokenWeight(new anchor.BN(40)) // token0 权重改为 40
      .accounts({
        pool: pool,
        mint: mint0,
        admin: poolCreator.publicKey,
      })
      .signers([poolCreator])
      .rpc();

    await program.methods
      .modifyTokenWeight(new anchor.BN(20)) // token1 权重改为 20
      .accounts({
        pool: pool,
        mint: mint1,
        admin: poolCreator.publicKey,
      })
      .signers([poolCreator])
      .rpc();

    // 验证权重已修改
    const poolAccountAfterWeightChange = await program.account.anySwapPool.fetch(pool);
    expect(poolAccountAfterWeightChange.tokens[0].weight.toNumber()).to.equal(40);
    expect(poolAccountAfterWeightChange.tokens[1].weight.toNumber()).to.equal(20);
    expect(poolAccountAfterWeightChange.tokens[2].weight.toNumber()).to.equal(40);
    console.log("权重修改后:");
    console.log("  - Token0 weight:", poolAccountAfterWeightChange.tokens[0].weight.toString());
    console.log("  - Token1 weight:", poolAccountAfterWeightChange.tokens[1].weight.toString());
    console.log("  - Token2 weight:", poolAccountAfterWeightChange.tokens[2].weight.toString());

    // 5. 用户用 token2 交换 token3 (token0)
    // 权重是 40:40，所以 amount_out = amount_in_minus_fees * 40 / 40
    const swapAmount2 = Number(userToken2Balance.amount); // 使用所有 token2
    const expectedFee2 = Math.floor(swapAmount2 * 5 / 1000);
    const expectedAmountInMinusFees2 = swapAmount2 - expectedFee2;
    // 权重 40:40，所以 amount_out = amount_in_minus_fees2
    const expectedAmountOut2 = Math.floor((expectedAmountInMinusFees2 * 40) / 40);

    // 创建用户的 token0 账户
    const userToken0Account = await token.createAssociatedTokenAccount(
      connection,
      user,
      mint0,
      user.publicKey
    );

    // 记录 swap2 前的 vault 余额
    const vault2BalanceBeforeSwap2 = await token.getAccount(connection, vault2);
    const vault0BalanceBeforeSwap2 = await token.getAccount(connection, vault0);

    // 执行第二次 swap: token2 -> token0
    await program.methods
      .swapAnyswap(
        new anchor.BN(swapAmount2),
        new anchor.BN(0)
      )
      .accountsPartial({
        pool: pool,
        vaultIn: vault2,
        vaultOut: vault0,
        userIn: userToken2Account,
        userOut: userToken0Account,
        owner: user.publicKey,
      })
      .signers([user])
      .rpc();

    // 6. 验证 token0 数量是否符合预期
    const userToken0Balance = await token.getAccount(connection, userToken0Account);
    expect(userToken0Balance.amount.toString()).to.equal(expectedAmountOut2.toString());
    console.log("Swap2 后用户 token0 余额:", userToken0Balance.amount.toString());
    console.log("预期 token0 余额:", expectedAmountOut2.toString());

    // 7. 验证手续费是否保留在 vault 中
    // 手续费应该保留在 vault_in 中（因为 amount_in 全部转入，但 amount_out 是基于 amount_in_minus_fees 计算的）
    const vault2BalanceAfterSwap2 = await token.getAccount(connection, vault2);
    const vault0BalanceAfterSwap2 = await token.getAccount(connection, vault0);
    
    const vault2Increase = Number(vault2BalanceAfterSwap2.amount) - Number(vault2BalanceBeforeSwap2.amount);
    const vault0Decrease = Number(vault0BalanceBeforeSwap2.amount) - Number(vault0BalanceAfterSwap2.amount);
    
    expect(vault2Increase).to.equal(swapAmount2); // vault2 应该增加 swapAmount2
    expect(vault0Decrease).to.equal(expectedAmountOut2); // vault0 应该减少 expectedAmountOut2
    
    // 手续费保留在 vault 中：vault_in 收到的比应该收到的多（因为手续费）
    // 总手续费 = expectedFee1 + expectedFee2
    const totalFee = expectedFee1 + expectedFee2;
    console.log("总手续费:", totalFee.toString());
    console.log("Swap1 手续费:", expectedFee1.toString());
    console.log("Swap2 手续费:", expectedFee2.toString());
    
    // 验证手续费确实保留在 vault 中
    // vault1 在 swap1 中收到 swapAmount1，但实际有效输入是 amount_in_minus_fees1
    // 所以 vault1 中保留了 expectedFee1 的手续费
    // vault2 在 swap2 中收到 swapAmount2，但实际有效输入是 amount_in_minus_fees2
    // 所以 vault2 中保留了 expectedFee2 的手续费
    
    console.log("Swap2 后 Vault2 余额:", vault2BalanceAfterSwap2.amount.toString());
    console.log("Swap2 后 Vault0 余额:", vault0BalanceAfterSwap2.amount.toString());
    console.log("Vault2 增加:", vault2Increase.toString());
    console.log("Vault0 减少:", vault0Decrease.toString());
    
    // 验证：vault 余额的变化应该反映手续费的存在
    // 在 swap1 中，vault1 增加了 swapAmount1，但有效输入是 amount_in_minus_fees1
    // 在 swap2 中，vault2 增加了 swapAmount2，但有效输入是 amount_in_minus_fees2
    // 手续费保留在相应的 vault 中
    
    console.log("测试完成：手续费已保留在 vault 中");
  });

  it("添加 token4 (WSOL/SOL) 到 pool", async () => {
    // WSOL (Wrapped SOL) 的 mint 地址是固定的
    mint3 = new PublicKey("So11111111111111111111111111111111111111112");
    
    // 计算 WSOL vault PDA 地址（由程序自动创建）
    // seeds = [b"vault", pool.key(), mint.key()]
    const [vault3Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pool.toBuffer(), mint3.toBuffer()],
      program.programId
    );
    vault3 = vault3Pda;

    console.log("WSOL Vault PDA 地址计算成功:");
    console.log("  - Mint3 (WSOL):", mint3.toString());
    console.log("  - Vault3 (PDA):", vault3.toString());

    // 获取或创建 admin 的 WSOL token 账户（ATA）
    const adminToken3Account = await token.getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer, // 使用 payer 支付创建账户的费用
      mint3,
      poolCreator.publicKey
    );

    // 添加 token4 (WSOL) 到 pool，权重设为 30
    // 此时 pool 中已有 token0, token1, token2，且已有流动性
    // 需要提供 WSOL 的流动性以保持池子平衡
    const weight3 = new anchor.BN(30);
    
    // 计算需要提供的 WSOL 流动性
    // 基于恒定乘积和公式：vault_new * weight_new = sum(vault_i * weight_i)
    // 读取所有 vault 余额并计算 base = sum(vault_i * weight_i)
    const vault0Balance = (await token.getAccount(connection, vault0)).amount;
    const vault1Balance = (await token.getAccount(connection, vault1)).amount;
    const vault2Balance = (await token.getAccount(connection, vault2)).amount;
    
    // 计算 base = sum(vault_i * weight_i)
    // token0: weight = 20 (或 40，如果被修改过)
    // token1: weight = 40 (或 20，如果被修改过)
    // token2: weight = 40
    // 注意：这里需要从 pool 中读取实际的权重
    const poolAccountForWeights = await program.account.anySwapPool.fetch(pool);
    const weight0 = poolAccountForWeights.tokens[0].weight.toNumber();
    const weight1 = poolAccountForWeights.tokens[1].weight.toNumber();
    const weight2 = poolAccountForWeights.tokens[2].weight.toNumber();
    
    // 计算 base = sum(vault_i * weight_i)
    const base = (vault0Balance * BigInt(weight0)) + 
                 (vault1Balance * BigInt(weight1)) + 
                 (vault2Balance * BigInt(weight2));
    
    // 计算需要的 WSOL 流动性：vault_new * weight_new = base
    // vault_new = base / weight_new
    const requiredLiquidity = base / BigInt(weight3.toNumber());
    
    // 检查是否超过 u64 最大值
    const maxU64 = BigInt("18446744073709551615");
    if (requiredLiquidity > maxU64) {
      throw new Error(`Required liquidity ${requiredLiquidity} exceeds u64 max value`);
    }
    
    console.log("计算 WSOL 流动性:");
    console.log("  - Vault0 balance:", vault0Balance.toString(), "weight:", weight0);
    console.log("  - Vault1 balance:", vault1Balance.toString(), "weight:", weight1);
    console.log("  - Vault2 balance:", vault2Balance.toString(), "weight:", weight2);
    console.log("  - Base (sum):", base.toString());
    console.log("  - Required WSOL liquidity:", requiredLiquidity.toString());
    
    // 如果 pool 中有流动性，需要先给 admin 的 WSOL 账户充值
    if (requiredLiquidity > 0) {
      // 创建 WSOL token 账户并充值（如果需要）
      // 注意：WSOL 是原生 SOL 的包装，需要先转账 SOL 到 WSOL 账户，然后调用 syncNative
      // requiredLiquidity 已经是正确的数量（不需要再乘以 1e9，因为 vault 余额已经是正确的单位）
      const wrapAmount = Number(requiredLiquidity);
      
      // 检查 poolCreator 是否有足够的 SOL
      const poolCreatorBalance = await connection.getBalance(poolCreator.publicKey);
      console.log("  - PoolCreator SOL balance:", poolCreatorBalance);
      console.log("  - Required SOL:", wrapAmount);
      
      if (poolCreatorBalance < wrapAmount) {
        // 如果余额不足，从 payer 转账一些 SOL 给 poolCreator
        const transferIx = SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: poolCreator.publicKey,
          lamports: wrapAmount + 1000000000, // 额外给一些用于交易费用
        });
        await provider.sendAndConfirm(new anchor.web3.Transaction().add(transferIx), [payer.payer]);
      }
      
      // 转账 SOL 到 WSOL 账户
      const transferSolIx = SystemProgram.transfer({
        fromPubkey: poolCreator.publicKey,
        toPubkey: adminToken3Account.address,
        lamports: wrapAmount,
      });
      
      // 同步原生余额（将 SOL 转换为 WSOL）
      const syncNativeIx = token.createSyncNativeInstruction(
        adminToken3Account.address,
        token.TOKEN_PROGRAM_ID
      );
      
      const wrapTx = new anchor.web3.Transaction().add(transferSolIx, syncNativeIx);
      await provider.sendAndConfirm(wrapTx, [poolCreator]);
    }
    
    await program.methods
      .addTokenToPool(weight3)
      .accountsPartial({
        pool: pool,
        mint: mint3,
        vault: vault3,
        adminToken: adminToken3Account.address,
        admin: poolCreator.publicKey,
        payer: payer.publicKey,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: vault0, isSigner: false, isWritable: false },
        { pubkey: vault1, isSigner: false, isWritable: false },
        { pubkey: vault2, isSigner: false, isWritable: false },
      ])
      .signers([poolCreator])
      .rpc();

    // 验证 pool 状态
    // 注意：权重在之前的测试中已被修改（token0: 40, token1: 20, token2: 40）
    const poolAccount = await program.account.anySwapPool.fetch(pool);
    expect(poolAccount.tokenCount).to.equal(4);
    expect(poolAccount.tokens[0].weight.toNumber()).to.equal(40); // 已修改为 40
    expect(poolAccount.tokens[1].weight.toNumber()).to.equal(20); // 已修改为 20
    expect(poolAccount.tokens[2].weight.toNumber()).to.equal(40); // 保持 40
    expect(poolAccount.tokens[3].weight.toNumber()).to.equal(30);
    expect(poolAccount.tokens[3].mintAccount.toString()).to.equal(mint3.toString());
    expect(poolAccount.tokens[3].vaultAccount.toString()).to.equal(vault3.toString());

    console.log("Token4 (WSOL) 添加成功:");
    console.log("  - Token Count:", poolAccount.tokenCount);
    console.log("  - Token0 weight:", poolAccount.tokens[0].weight.toString());
    console.log("  - Token1 weight:", poolAccount.tokens[1].weight.toString());
    console.log("  - Token2 weight:", poolAccount.tokens[2].weight.toString());
    console.log("  - Token3 (WSOL) weight:", poolAccount.tokens[3].weight.toString());
    console.log("  - Token3 (WSOL) mint:", poolAccount.tokens[3].mintAccount.toString());
    console.log("  - Token3 (WSOL) vault:", poolAccount.tokens[3].vaultAccount.toString());
  });
});

