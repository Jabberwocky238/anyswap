import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../../target/types/anyswap";
import * as token from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { AdminClient, Client, getVault } from "../src";
import { BN } from "@coral-xyz/anchor";

describe("AnySwap Client Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anyswap as Program<Anyswap>;
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  // 创建客户端
  const adminClient = new AdminClient(provider, program);
  const client = new Client(provider, program);

  // Pool 相关
  let pool: PublicKey;
  let poolKeypair: Keypair;
  let poolAuthorityPda: PublicKey;
  let poolMint: PublicKey;
  let poolCreator: Keypair;
  const poolId = new BN(0);

  // 费率：5/1000 = 0.5%
  const feeNumerator = new BN(5);
  const feeDenominator = new BN(1000);

  // Token 相关
  let mint0: PublicKey;
  let mint1: PublicKey;
  let mint2: PublicKey;
  let mint3: PublicKey; // WSOL
  let vault0: PublicKey;
  let vault1: PublicKey;
  let vault2: PublicKey;
  let vault3: PublicKey; // WSOL vault

  // Payer 的 token 账户
  let payerToken0Account: PublicKey;
  let payerToken1Account: PublicKey;
  let payerToken2Account: PublicKey;

  const nDecimals = 9;

  it("在客户端创建 Pool", async () => {
    // 创建 pool creator（用于测试，实际使用中可以使用 provider.wallet.publicKey）
    poolCreator = Keypair.generate();

    // 使用管理员客户端创建 pool
    // 注意：在测试环境中，我们需要使用 poolCreator 作为 admin
    // 但在实际使用中，可以省略 admin 参数，会使用 provider.wallet.publicKey
    const result = await adminClient.createPool(
      poolId,
      feeNumerator,
      feeDenominator,
      poolCreator.publicKey // 指定 admin
    );

    // 保存结果
    pool = result.pool;
    poolKeypair = result.poolKeypair;
    poolAuthorityPda = result.poolAuthority;
    poolMint = result.poolMint;

    // 验证 pool 账户
    const poolAccount = await client.getPool(pool);
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
      nDecimals
    );

    mint1 = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      nDecimals
    );

    mint2 = await token.createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      nDecimals
    );

    // 计算 vault PDA 地址
    vault0 = getVault(adminClient.program, pool, mint0);
    vault1 = getVault(adminClient.program, pool, mint1);
    vault2 = getVault(adminClient.program, pool, mint2);

    console.log("Token 和 Vault PDA 地址计算成功:");
    console.log("  - Mint0:", mint0.toString());
    console.log("  - Mint1:", mint1.toString());
    console.log("  - Mint2:", mint2.toString());
    console.log("  - Vault0 (PDA):", vault0.toString());
    console.log("  - Vault1 (PDA):", vault1.toString());
    console.log("  - Vault2 (PDA):", vault2.toString());
  });

  it("初始化三个 token，权重 20, 40, 40", async () => {
    const weight0 = new BN(20);
    const weight1 = new BN(40);
    const weight2 = new BN(40);

    // 添加 token0（第一个 token，pool 为空，不需要流动性）
    await adminClient.addTokenToPool(
      pool,
      mint0,
      weight0,
      [], // existingVaults
      poolCreator.publicKey // admin
    );

    // 添加 token1（需要传入现有 vault）
    await adminClient.addTokenToPool(
      pool,
      mint1,
      weight1,
      [vault0], // existingVaults
      poolCreator.publicKey // admin
    );

    // 添加 token2（需要传入现有 vaults）
    await adminClient.addTokenToPool(
      pool,
      mint2,
      weight2,
      [vault0, vault1], // existingVaults
      poolCreator.publicKey // admin
    );

    // 验证 pool 状态
    const poolAccount = await client.getPool(pool);
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
    const baseAmount = 10000 * 10 ** nDecimals;
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
    // 按比例的数量：20:40:40
    const baseAmount = 10000 * 10 ** nDecimals;
    const amounts = [
      new BN(baseAmount),      // token0: 10000
      new BN(baseAmount * 2),  // token1: 20000
      new BN(baseAmount * 2),  // token2: 20000
    ];

    console.log("添加流动性:");
    console.log("  - Token0:", amounts[0].toString());
    console.log("  - Token1:", amounts[1].toString());
    console.log("  - Token2:", amounts[2].toString());

    // 使用客户端添加流动性
    // 注意：在测试环境中，payer.payer 是 Keypair，但在实际使用中会通过 provider.wallet 自动签名
    const signature = await client.addLiquidity(
      pool,
      {
        amounts,
        userTokenAccounts: [payerToken0Account, payerToken1Account, payerToken2Account],
        vaultAccounts: [vault0, vault1, vault2],
      }
      // owner 和 signers 都是可选的，会使用 provider.wallet
    );

    console.log("添加流动性交易签名:", signature);

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
    const userPoolAta = await token.getAssociatedTokenAddress(
      poolMint,
      payer.publicKey
    );
    const lpBalance = await token.getAccount(connection, userPoolAta);
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
    const swapAmount1 = 10000 * 10 ** nDecimals; // 10000 token1
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
    // 注意：在测试环境中，我们需要传入 user 作为额外的签名者
    // 但在实际使用中，如果 user 就是 provider.wallet，可以省略 signers
    await client.swap(
      pool,
      {
        amountIn: new BN(swapAmount1),
        minAmountOut: new BN(0),
        vaultIn: vault1,
        vaultOut: vault2,
        userIn: userToken1Account,
        userOut: userToken2Account,
      },
      user.publicKey, // owner
      [user] // signers - 在测试环境中需要，实际使用中如果 owner 是 provider.wallet 可以省略
    );

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
    expect(vault1Increase).to.equal(swapAmount1);
    expect(vault2Decrease).to.equal(expectedAmountOut1);
    console.log("Swap1 后 Vault1 余额:", vault1BalanceAfterSwap1.amount.toString());
    console.log("Swap1 后 Vault2 余额:", vault2BalanceAfterSwap1.amount.toString());

    // 4. 管理员修改权重为 40, 20, 40
    await adminClient.modifyTokenWeight(
      pool,
      mint0,
      new BN(40),
      poolCreator.publicKey // admin
    );

    await adminClient.modifyTokenWeight(
      pool,
      mint1,
      new BN(20),
      poolCreator.publicKey // admin
    );

    // 验证权重已修改
    const poolAccountAfterWeightChange = await client.getPool(pool);
    expect(poolAccountAfterWeightChange.tokens[0].weight.toNumber()).to.equal(40);
    expect(poolAccountAfterWeightChange.tokens[1].weight.toNumber()).to.equal(20);
    expect(poolAccountAfterWeightChange.tokens[2].weight.toNumber()).to.equal(40);
    console.log("权重修改后:");
    console.log("  - Token0 weight:", poolAccountAfterWeightChange.tokens[0].weight.toString());
    console.log("  - Token1 weight:", poolAccountAfterWeightChange.tokens[1].weight.toString());
    console.log("  - Token2 weight:", poolAccountAfterWeightChange.tokens[2].weight.toString());

    // 5. 用户用 token2 交换 token0
    const swapAmount2 = Number(userToken2Balance.amount);
    const expectedFee2 = Math.floor(swapAmount2 * 5 / 1000);
    const expectedAmountInMinusFees2 = swapAmount2 - expectedFee2;
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
    await client.swap(
      pool,
      {
        amountIn: new BN(swapAmount2),
        minAmountOut: new BN(0),
        vaultIn: vault2,
        vaultOut: vault0,
        userIn: userToken2Account,
        userOut: userToken0Account,
      },
      user.publicKey, // owner
      [user] // signers
    );

    // 6. 验证 token0 数量是否符合预期
    const userToken0Balance = await token.getAccount(connection, userToken0Account);
    expect(userToken0Balance.amount.toString()).to.equal(expectedAmountOut2.toString());
    console.log("Swap2 后用户 token0 余额:", userToken0Balance.amount.toString());
    console.log("预期 token0 余额:", expectedAmountOut2.toString());

    // 7. 验证手续费是否保留在 vault 中
    const vault2BalanceAfterSwap2 = await token.getAccount(connection, vault2);
    const vault0BalanceAfterSwap2 = await token.getAccount(connection, vault0);
    
    const vault2Increase = Number(vault2BalanceAfterSwap2.amount) - Number(vault2BalanceBeforeSwap2.amount);
    const vault0Decrease = Number(vault0BalanceBeforeSwap2.amount) - Number(vault0BalanceAfterSwap2.amount);
    
    expect(vault2Increase).to.equal(swapAmount2);
    expect(vault0Decrease).to.equal(expectedAmountOut2);
    
    const totalFee = expectedFee1 + expectedFee2;
    console.log("总手续费:", totalFee.toString());
    console.log("Swap1 手续费:", expectedFee1.toString());
    console.log("Swap2 手续费:", expectedFee2.toString());
    console.log("Swap2 后 Vault2 余额:", vault2BalanceAfterSwap2.amount.toString());
    console.log("Swap2 后 Vault0 余额:", vault0BalanceAfterSwap2.amount.toString());
    console.log("Vault2 增加:", vault2Increase.toString());
    console.log("Vault0 减少:", vault0Decrease.toString());
    console.log("测试完成：手续费已保留在 vault 中");
  });

  it("添加 token4 (WSOL/SOL) 到 pool", async () => {
    // WSOL (Wrapped SOL) 的 mint 地址是固定的
    mint3 = new PublicKey("So11111111111111111111111111111111111111112");
    
    // 计算 WSOL vault PDA 地址
    vault3 = getVault(client.program, pool, mint3);

    console.log("WSOL Vault PDA 地址计算成功:");
    console.log("  - Mint3 (WSOL):", mint3.toString());
    console.log("  - Vault3 (PDA):", vault3.toString());

    // 添加 token4 (WSOL) 到 pool，权重设为 30
    const weight3 = new BN(30);
    
    // 计算需要提供的 WSOL 流动性
    const requiredLiquidity = await client.calculateRequiredWSOLLiquidity(
      pool,
      weight3
    );
    
    console.log("计算 WSOL 流动性:");
    console.log("  - Required WSOL liquidity:", requiredLiquidity.toString());
    
    // 如果 pool 中有流动性，需要先给 admin 的 WSOL 账户充值
    if (requiredLiquidity.gt(new BN(0))) {
      const wrapAmount = requiredLiquidity.toNumber();
      
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
      
      // 包装 SOL 为 WSOL
      // 注意：在测试环境中，poolCreator 不是 provider.wallet，所以需要传入作为签名者
      // 但在实际使用中，如果 owner 是 provider.wallet，可以省略 signers
      await client.wrapSOL(
        wrapAmount,
        poolCreator.publicKey, // owner
        [poolCreator] // signers - 在测试环境中需要，实际使用中如果 owner 是 provider.wallet 可以省略
      );
    }
    
    // 获取现有 vaults
    const tokens = await client.getPoolTokens(pool);
    const existingVaults = tokens.map((t) => t.vault);
    
    // 添加 WSOL token 到 Pool
    await adminClient.addTokenToPool(
      pool,
      mint3,
      weight3,
      existingVaults, // existingVaults
      poolCreator.publicKey // admin
    );

    // 验证 pool 状态
    const poolAccount = await client.getPool(pool);
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

