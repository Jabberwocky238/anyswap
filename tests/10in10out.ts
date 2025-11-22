import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../target/types/anyswap";
import * as token from "@solana/spl-token";
import { expect } from "chai";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { createPoolOnClient } from "./utils";

describe("10in10out - CU消耗测试", () => {
    return
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Anyswap as Program<Anyswap>;
    const connection = provider.connection;
    const payer = provider.wallet as anchor.Wallet;
    // 测试账户
    const poolCreator = anchor.web3.Keypair.generate();
    const user = anchor.web3.Keypair.generate();

    let pool: anchor.web3.PublicKey;
    let poolMint: anchor.web3.PublicKey;
    let poolAuthorityPda: anchor.web3.PublicKey;

    // Token和vault数组
    const TOKEN_COUNT = 30;
    const mints: anchor.web3.PublicKey[] = [];
    const vaults: anchor.web3.PublicKey[] = [];
    const userTokenAccounts: anchor.web3.PublicKey[] = [];
    const adminTokenAccounts: anchor.web3.PublicKey[] = [];

    // 权重：每个token权重为33（总权重=990，约1000）
    const TOKEN_WEIGHT = 33;

    // 费率：0.03%
    const FEE_NUMERATOR = 3;
    const FEE_NUMERATOR_BN = new anchor.BN(FEE_NUMERATOR);
    const FEE_DENOMINATOR = 10000;
    const FEE_DENOMINATOR_BN = new anchor.BN(FEE_DENOMINATOR);

    before(async () => {
        console.log("\n=== 开始CU消耗测试：30 tokens, 10 in, 10 out ===\n");

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
        const { pool, poolAuthorityPda, poolMint } = await createPoolOnClient(
            provider, program, connection, payer, poolCreator, FEE_NUMERATOR_BN, FEE_DENOMINATOR_BN
        );

        console.log(`✅ Pool创建成功: ${pool.toString()}`);

        // 3. 创建30个mints
        console.log("\n创建30个mints...");

        for (let i = 0; i < TOKEN_COUNT; i++) {
            const mint = await token.createMint(
                connection,
                poolCreator,
                poolCreator.publicKey,
                null,
                9
            );
            mints.push(mint);

            if ((i + 1) % 10 === 0) {
                console.log(`  进度: ${i + 1}/${TOKEN_COUNT} mints创建完成`);
            }
        }

        console.log(`✅ 全部 ${TOKEN_COUNT} 个mints创建完成`);

        // 4. 为admin创建token账户并铸造（用于添加到pool）
        console.log("\n为admin创建token账户并铸造...");

        const ADMIN_MINT_AMOUNT = 1_000_000_000_000_000; // 1000T per token

        for (let i = 0; i < TOKEN_COUNT; i++) {
            const adminTokenAccount = await token.createAssociatedTokenAccount(
                connection,
                poolCreator,
                mints[i],
                poolCreator.publicKey
            );

            await token.mintTo(
                connection,
                poolCreator,
                mints[i],
                adminTokenAccount,
                poolCreator,
                ADMIN_MINT_AMOUNT
            );

            adminTokenAccounts.push(adminTokenAccount);

            if ((i + 1) % 10 === 0) {
                console.log(`  进度: ${i + 1}/${TOKEN_COUNT} admin账户创建完成`);
            }
        }

        console.log(`✅ 全部 ${TOKEN_COUNT} 个admin token账户创建完成`);

        // 5. 添加tokens到pool并提供初始流动性
        console.log("\n添加tokens到pool...");

        const INITIAL_LIQUIDITY = 500_000_000_000_000; // 500T per token

        for (let i = 0; i < TOKEN_COUNT; i++) {
            const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), pool.toBuffer(), mints[i].toBuffer()],
                program.programId
            );

            await program.methods
                .addTokenToPool(new anchor.BN(TOKEN_WEIGHT), new anchor.BN(INITIAL_LIQUIDITY))
                .accountsPartial({
                    pool: pool,
                    mint: mints[i],
                    vault: vault,
                    adminToken: adminTokenAccounts[i],
                    admin: poolCreator.publicKey,
                    payer: poolCreator.publicKey,
                    associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .signers([poolCreator])
                .rpc();

            vaults.push(vault);

            if ((i + 1) % 10 === 0) {
                console.log(`  进度: ${i + 1}/${TOKEN_COUNT} tokens添加到pool`);
            }
        }

        console.log(`✅ 全部 ${TOKEN_COUNT} 个tokens添加到pool`);

        // 6. 为用户创建token账户并铸造
        console.log("\n为用户创建token账户并铸造...");

        const USER_MINT_AMOUNT = 1_000_000_000_000; // 1T per token

        for (let i = 0; i < TOKEN_COUNT; i++) {
            const userTokenAccount = await token.createAssociatedTokenAccount(
                connection,
                user,
                mints[i],
                user.publicKey
            );

            await token.mintTo(
                connection,
                user,
                mints[i],
                userTokenAccount,
                poolCreator,
                USER_MINT_AMOUNT
            );

            userTokenAccounts.push(userTokenAccount);

            if ((i + 1) % 10 === 0) {
                console.log(`  进度: ${i + 1}/${TOKEN_COUNT} 用户token账户创建完成`);
            }
        }

        console.log(`✅ 全部 ${TOKEN_COUNT} 个用户token账户创建完成`);

        // 验证setup完成
        const poolAccount = await program.account.anySwapPool.fetch(pool);
        console.log(`\n✅ Setup完成，Pool有 ${poolAccount.tokenCount} 个tokens`);
    });

    it("执行 10 in, 10 out 的swap并测试CU消耗", async () => {
        console.log("\n=== 开始swap测试 ===");

        // 前10个token作为输入，后10个token作为输出
        const IN_COUNT = 10;
        const OUT_COUNT = 10;

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

        // 准备remaining accounts（只包含参与swap的20个token）
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
        const vault10Before = await token.getAccount(connection, vaults[10]);

        console.log(`\nSwap前余额:`);
        console.log(`  Vault[0] (输入): ${vault0Before.amount.toString()}`);
        console.log(`  Vault[10] (输出): ${vault10Before.amount.toString()}`);

        // 尝试不同的CU限制
        const CU_LIMITS = [200_000, 400_000, 600_000, 800_000, 1_000_000];
        let swapTx: string | null = null;
        let successfulCuLimit = 0;

        for (const cuLimit of CU_LIMITS) {
            try {
                console.log(`\n尝试 CU 限制: ${cuLimit.toLocaleString()}...`);

                const tx = await program.methods
                    .swapAnyswap(amounts_tolerance, is_in_token)
                    .accountsPartial({
                        pool: pool,
                        owner: user.publicKey,
                    })
                    .remainingAccounts(swapRemainingAccounts)
                    .preInstructions([
                        ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit })
                    ])
                    .signers([user])
                    .rpc();

                swapTx = tx;
                successfulCuLimit = cuLimit;
                console.log(`✅ Swap成功！使用 CU 限制: ${cuLimit.toLocaleString()}`);
                console.log(`   交易签名: ${tx}`);
                break;
            } catch (error) {
                if (error.message?.includes("exceeded CUs meter") ||
                    error.message?.includes("Program failed to complete")) {
                    console.log(`❌ CU 限制 ${cuLimit.toLocaleString()} 不足`);
                } else {
                    console.log(`❌ 错误: ${error.message}`);
                    throw error;
                }

                if (cuLimit === CU_LIMITS[CU_LIMITS.length - 1]) {
                    throw new Error(`所有CU限制都失败了，最大尝试: ${cuLimit}`);
                }
            }
        }

        expect(swapTx).to.not.be.null;

        // 验证swap后的余额
        const vault0After = await token.getAccount(connection, vaults[0]);
        const vault10After = await token.getAccount(connection, vaults[10]);
        const user10Balance = await token.getAccount(connection, userTokenAccounts[10]);

        console.log(`\nSwap后余额:`);
        console.log(`  Vault[0] (输入): ${vault0After.amount.toString()}`);
        console.log(`  Vault[10] (输出): ${vault10After.amount.toString()}`);
        console.log(`  User Token[10] (收到): ${user10Balance.amount.toString()}`);

        const vault0Increase = Number(vault0After.amount) - Number(vault0Before.amount);
        const vault10Decrease = Number(vault10Before.amount) - Number(vault10After.amount);

        console.log(`\n余额变化:`);
        console.log(`  Vault[0] 增加: ${vault0Increase.toLocaleString()}`);
        console.log(`  Vault[10] 减少: ${vault10Decrease.toLocaleString()}`);
        console.log(`  User Token[10] 收到: ${user10Balance.amount.toString()}`);

        // 验证
        expect(vault0Increase).to.be.greaterThan(0);
        expect(vault10Decrease).to.be.greaterThan(0);
        expect(Number(user10Balance.amount)).to.be.greaterThan(0);

        console.log(`\n✅ 10 in, 10 out swap测试通过！`);
        console.log(`✅ 最低需要 CU: ${successfulCuLimit.toLocaleString()}`);
    });
});

