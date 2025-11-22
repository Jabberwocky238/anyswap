import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../target/types/anyswap";
import * as token from "@solana/spl-token";
import { expect } from "chai";
import { ComputeBudgetProgram } from "@solana/web3.js";

describe("100in100out - 极限性能测试", () => {
    return
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Anyswap as Program<Anyswap>;
  const connection = provider.connection;

  // 测试账户
  const poolCreator = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let pool: anchor.web3.PublicKey;
  let poolMint: anchor.web3.PublicKey;
  let poolAuthorityPda: anchor.web3.PublicKey;

  // Token和vault数组
  const TOKEN_COUNT = 250;
  const mints: anchor.web3.PublicKey[] = [];
  const vaults: anchor.web3.PublicKey[] = [];
  const userTokenAccounts: anchor.web3.PublicKey[] = [];

  // 权重：每个token权重为4（总权重=1000）
  const TOKEN_WEIGHT = 4;

  // 费率：0.03%
  const FEE_NUMERATOR = 3;
  const FEE_DENOMINATOR = 10000;

  before(async () => {
    console.log("\n=== 开始极限性能测试：250 tokens, 100 in, 100 out ===\n");

    // 1. 空投SOL
    const airdropTx1 = await connection.requestAirdrop(
      poolCreator.publicKey,
      100 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropTx1);

    const airdropTx2 = await connection.requestAirdrop(
      user.publicKey,
      100 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropTx2);

    console.log("✅ SOL空投完成");

    // 2. 创建pool
    const poolKeypair = anchor.web3.Keypair.generate();
    pool = poolKeypair.publicKey;
    
    [poolAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("anyswap_authority"), pool.toBuffer()],
      program.programId
    );

    [poolMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool_mint"), pool.toBuffer()],
      program.programId
    );

    await program.methods
      .createPool(new anchor.BN(FEE_NUMERATOR), new anchor.BN(FEE_DENOMINATOR))
      .accounts({
        poolCreator: poolCreator.publicKey,
        pool: pool,
        poolMint: poolMint,
        poolAuthority: poolAuthorityPda,
        admin: poolCreator.publicKey,
        payer: poolCreator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([poolCreator, poolKeypair])
      .rpc();

    console.log(`✅ Pool创建成功: ${pool.toString()}`);

    // 3. 创建250个tokens和vaults
    console.log("\n创建250个tokens和vaults（这可能需要几分钟）...");
    
    for (let i = 0; i < TOKEN_COUNT; i++) {
      // 创建mint
      const mintKeypair = anchor.web3.Keypair.generate();
      const mint = mintKeypair.publicKey;

      // 创建vault PDA
      const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("anyswap_vault"), pool.toBuffer(), mint.toBuffer()],
        program.programId
      );

      // 添加token到pool
      await program.methods
        .addToken(new anchor.BN(TOKEN_WEIGHT))
        .accounts({
          pool: pool,
          mint: mint,
          vault: vault,
          admin: poolCreator.publicKey,
          poolAuthority: poolAuthorityPda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([poolCreator, mintKeypair])
        .rpc();

      mints.push(mint);
      vaults.push(vault);

      if ((i + 1) % 25 === 0) {
        console.log(`  进度: ${i + 1}/${TOKEN_COUNT} tokens创建完成`);
      }
    }

    console.log(`✅ 全部 ${TOKEN_COUNT} 个tokens创建完成`);

    // 4. 为用户创建token账户并铸造
    console.log("\n为用户铸造tokens（这可能需要几分钟）...");
    
    const INITIAL_MINT_AMOUNT = 1_000_000_000_000; // 1T per token

    for (let i = 0; i < TOKEN_COUNT; i++) {
      // 创建用户token账户
      const userTokenAccount = await token.createAssociatedTokenAccount(
        connection,
        user,
        mints[i],
        user.publicKey
      );

      // 铸造token给用户
      await token.mintTo(
        connection,
        user,
        mints[i],
        userTokenAccount,
        poolCreator,
        INITIAL_MINT_AMOUNT
      );

      userTokenAccounts.push(userTokenAccount);

      if ((i + 1) % 25 === 0) {
        console.log(`  进度: ${i + 1}/${TOKEN_COUNT} 用户token账户创建完成`);
      }
    }

    console.log(`✅ 全部 ${TOKEN_COUNT} 个用户token账户创建完成`);

    // 5. 添加初始流动性（每个token 500T到vault）
    console.log("\n添加初始流动性到pool...");
    
    const LIQUIDITY_AMOUNT = 500_000_000_000; // 500T per token
    const liquidityAmounts = new Array(TOKEN_COUNT).fill(LIQUIDITY_AMOUNT);

    // 准备remaining accounts
    const liquidityRemainingAccounts = [];
    for (let i = 0; i < TOKEN_COUNT; i++) {
      liquidityRemainingAccounts.push(
        { pubkey: userTokenAccounts[i], isSigner: false, isWritable: true },
        { pubkey: vaults[i], isSigner: false, isWritable: true }
      );
    }

    // 创建用户LP token账户
    const userLpAccount = await token.createAssociatedTokenAccount(
      connection,
      user,
      poolMint,
      user.publicKey
    );

    // 添加流动性（可能需要大量CU）
    const addLiquidityTx = await program.methods
      .addLiquidity(liquidityAmounts.map(a => new anchor.BN(a)))
      .accounts({
        pool: pool,
        poolMint: poolMint,
        poolAuthority: poolAuthorityPda,
        lpTokenAccount: userLpAccount,
        owner: user.publicKey,
        tokenProgram: token.TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(liquidityRemainingAccounts)
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
      ])
      .signers([user])
      .rpc();

    console.log(`✅ 初始流动性添加成功`);
    console.log(`   交易签名: ${addLiquidityTx}`);

    // 验证vault余额
    const vault0Balance = await token.getAccount(connection, vaults[0]);
    console.log(`   Vault[0] 余额: ${vault0Balance.amount.toString()}`);
  });

  it("执行 100 in, 100 out 的极限swap", async () => {
    console.log("\n=== 开始极限swap测试 ===");

    // 前100个token作为输入，后100个token作为输出
    const IN_COUNT = 100;
    const OUT_COUNT = 100;

    // 准备amounts_tolerance和is_in_token
    const swapAmountPerToken = 10_000_000_000; // 10B per input token
    const amounts_tolerance: anchor.BN[] = [];
    const is_in_token: boolean[] = [];

    for (let i = 0; i < IN_COUNT + OUT_COUNT; i++) {
      if (i < IN_COUNT) {
        // 输入token
        amounts_tolerance.push(new anchor.BN(swapAmountPerToken));
        is_in_token.push(true);
      } else {
        // 输出token（最小输出为0）
        amounts_tolerance.push(new anchor.BN(0));
        is_in_token.push(false);
      }
    }

    // 准备remaining accounts（只包含参与swap的200个token）
    const swapRemainingAccounts = [];
    for (let i = 0; i < IN_COUNT + OUT_COUNT; i++) {
      swapRemainingAccounts.push(
        { pubkey: userTokenAccounts[i], isSigner: false, isWritable: true },
        { pubkey: vaults[i], isSigner: false, isWritable: true }
      );
    }

    console.log(`\n准备swap:`);
    console.log(`  输入: ${IN_COUNT} tokens, 每个 ${swapAmountPerToken.toLocaleString()}`);
    console.log(`  输出: ${OUT_COUNT} tokens`);
    console.log(`  Remaining accounts: ${swapRemainingAccounts.length}`);

    // 记录swap前的余额
    const vault0Before = await token.getAccount(connection, vaults[0]);
    const vault100Before = await token.getAccount(connection, vaults[100]);
    
    console.log(`\nSwap前余额:`);
    console.log(`  Vault[0] (输入): ${vault0Before.amount.toString()}`);
    console.log(`  Vault[100] (输出): ${vault100Before.amount.toString()}`);

    // 尝试不同的CU限制
    const CU_LIMITS = [400_000, 800_000, 1_200_000, 1_400_000];
    let swapTx: string | null = null;

    for (const cuLimit of CU_LIMITS) {
      try {
        console.log(`\n尝试 CU 限制: ${cuLimit.toLocaleString()}...`);
        
        const tx = await program.methods
          .swapAnyswap(amounts_tolerance, is_in_token)
          .accountsPartial({
            pool: pool,
            poolAuthority: poolAuthorityPda,
            owner: user.publicKey,
            tokenProgram: token.TOKEN_PROGRAM_ID,
          })
          .remainingAccounts(swapRemainingAccounts)
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit })
          ])
          .signers([user])
          .rpc();

        swapTx = tx;
        console.log(`✅ Swap成功！使用 CU 限制: ${cuLimit.toLocaleString()}`);
        console.log(`   交易签名: ${tx}`);
        break;
      } catch (error) {
        console.log(`❌ CU 限制 ${cuLimit.toLocaleString()} 不足`);
        if (cuLimit === CU_LIMITS[CU_LIMITS.length - 1]) {
          console.log(`错误详情: ${error.message}`);
          throw error;
        }
      }
    }

    expect(swapTx).to.not.be.null;

    // 验证swap后的余额
    const vault0After = await token.getAccount(connection, vaults[0]);
    const vault100After = await token.getAccount(connection, vaults[100]);
    const user100Balance = await token.getAccount(connection, userTokenAccounts[100]);

    console.log(`\nSwap后余额:`);
    console.log(`  Vault[0] (输入): ${vault0After.amount.toString()}`);
    console.log(`  Vault[100] (输出): ${vault100After.amount.toString()}`);
    console.log(`  User Token[100] (收到): ${user100Balance.amount.toString()}`);

    const vault0Increase = Number(vault0After.amount) - Number(vault0Before.amount);
    const vault100Decrease = Number(vault100Before.amount) - Number(vault100After.amount);

    console.log(`\n余额变化:`);
    console.log(`  Vault[0] 增加: ${vault0Increase.toLocaleString()}`);
    console.log(`  Vault[100] 减少: ${vault100Decrease.toLocaleString()}`);
    console.log(`  User Token[100] 收到: ${user100Balance.amount.toString()}`);

    // 验证输入token确实增加了
    expect(vault0Increase).to.be.greaterThan(0);
    // 验证输出token确实减少了
    expect(vault100Decrease).to.be.greaterThan(0);
    // 验证用户确实收到了token
    expect(Number(user100Balance.amount)).to.be.greaterThan(0);

    console.log("\n✅ 极限swap测试通过！");
  });

  it("查看交易的实际CU消耗", async () => {
    console.log("\n=== 分析CU消耗 ===");
    console.log("注意：此测试需要访问交易日志");
    console.log("可以通过 solana logs 或 Solana Explorer 查看实际CU消耗");
  });
});

