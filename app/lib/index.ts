import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import type { Anyswap } from "../../target/types/anyswap";
import type { Idl } from "@coral-xyz/anchor";
import * as token from "@solana/spl-token";
// @ts-ignore
import idl from "../../target/idl/anyswap.json";
import {
    type Provider,
} from '@coral-xyz/anchor';

export class AnySwap {
    private provider: Provider;
    private program: Program<Anyswap>;
    private connection: Connection;

    constructor(
        provider: Provider,
    ) {
        this.provider = provider;
        this.program = new Program<Anyswap>(idl as Idl, provider);
        this.connection = provider.connection;
    }

    // 辅助函数：获取 Pool Authority PDA
    public getPoolAuthority(pool: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("anyswap_authority"), pool.toBuffer()],
            this.program.programId
        );
    }

    // 辅助函数：获取 Pool Mint PDA
    public getPoolMint(pool: PublicKey): PublicKey {
        const [poolMint] = PublicKey.findProgramAddressSync(
            [Buffer.from("pool_mint"), pool.toBuffer()],
            this.program.programId
        );
        return poolMint;
    }

    // 辅助函数：获取 Vault PDA
    public getVault(pool: PublicKey, mint: PublicKey): PublicKey {
        const [vault] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), pool.toBuffer(), mint.toBuffer()],
            this.program.programId
        );
        return vault;
    }

    // 创建 Pool
    async createPool(
        feeNumerator: BN,
        feeDenominator: BN,
        adminPubkey: PublicKey,
    ): Promise<{
        pool: PublicKey;
        poolKeypair: Keypair;
        poolAuthority: PublicKey;
        poolMint: PublicKey;
        signature: string;
    }> {
        const poolKeypair = Keypair.generate();
        const pool = poolKeypair.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const poolMint = this.getPoolMint(pool);

        const poolSpace = 8 + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024); // 73792 bytes
        const lamports = await this.connection.getMinimumBalanceForRentExemption(poolSpace);

        const createAccountIx = SystemProgram.createAccount({
            fromPubkey: adminPubkey,
            newAccountPubkey: pool,
            space: poolSpace,
            lamports,
            programId: this.program.programId,
        });

        const createPoolIx = await this.program.methods
            .createPool(feeNumerator, feeDenominator)
            .accountsPartial({
                poolCreator: adminPubkey,
                pool: pool,
                poolAuthority: poolAuthority,
                poolMint: poolMint,
                admin: adminPubkey,
                payer: adminPubkey,
                systemProgram: SystemProgram.programId,
                tokenProgram: token.TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();

        const tx = new Transaction().add(
            createAccountIx,
            createPoolIx
        );

        // 使用 sendAndConfirm 发送交易，poolKeypair 作为额外签名者
        const signature = await this.provider.sendAndConfirm!(tx, [poolKeypair], {
            skipPreflight: false,
        });

        return {
            pool,
            poolKeypair,
            poolAuthority,
            poolMint,
            signature,
        };
    }

    // 添加 Token 到 Pool
    async addTokenToPool(
        pool: PublicKey,
        mint: PublicKey,
        weight: BN,
        liquidity: BN,
        existingVaults: PublicKey[] = [],
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet!.publicKey;
        const remainingAccounts = existingVaults.flatMap((vault) => [
            { pubkey: vault, isWritable: false, isSigner: false },
        ]);

        return await this.program.methods
            .addTokenToPool(weight, liquidity)
            .accounts({
                pool: pool,
                mint: mint,
                admin: adminPubkey,
                payer: this.provider.wallet!.publicKey,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();
    }

    // 添加流动性
    async addLiquidity(
        pool: PublicKey,
        amounts: BN[],
        userTokenAccounts: PublicKey[],
        vaultAccounts: PublicKey[],
        owner?: PublicKey
    ): Promise<string> {
        const ownerPubkey = owner || this.provider.wallet!.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const poolMint = this.getPoolMint(pool);
        const userPoolAta = await token.getAssociatedTokenAddress(
            poolMint,
            ownerPubkey,
            false,
            token.TOKEN_PROGRAM_ID,
            token.ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const accounts: any = {
            pool: pool,
            poolAuthority: poolAuthority,
            poolMint: poolMint,
            userPoolAta: userPoolAta,
            owner: ownerPubkey,
            tokenProgram: token.TOKEN_PROGRAM_ID,
        };

        const remainingAccounts = userTokenAccounts
            .map((userAccount, index) => [
                { pubkey: userAccount, isWritable: true, isSigner: false },
                { pubkey: vaultAccounts[index], isWritable: true, isSigner: false },
            ])
            .flat();

        return await this.program.methods
            .addLiquidity(amounts)
            .accounts(accounts)
            .remainingAccounts(remainingAccounts)
            .rpc();
    }

    // 移除流动性
    async removeLiquidity(
        pool: PublicKey,
        burnAmount: BN,
        userTokenAccounts: PublicKey[],
        vaultAccounts: PublicKey[],
        owner?: PublicKey
    ): Promise<string> {
        const ownerPubkey = owner || this.provider.wallet!.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const poolMint = this.getPoolMint(pool);
        const userPoolAta = await token.getAssociatedTokenAddress(
            poolMint,
            ownerPubkey,
            false,
            token.TOKEN_PROGRAM_ID,
            token.ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const accounts: any = {
            pool: pool,
            poolAuthority: poolAuthority,
            poolMint: poolMint,
            userPoolAta: userPoolAta,
            owner: ownerPubkey,
            tokenProgram: token.TOKEN_PROGRAM_ID,
        };

        const remainingAccounts = userTokenAccounts
            .map((userAccount, index) => [
                { pubkey: userAccount, isWritable: true, isSigner: false },
                { pubkey: vaultAccounts[index], isWritable: true, isSigner: false },
            ])
            .flat();

        return await this.program.methods
            .removeLiquidity(burnAmount)
            .accounts(accounts)
            .remainingAccounts(remainingAccounts)
            .rpc();
    }

    // 交换代币
    async swap(
        pool: PublicKey,
        inlets: {
            amount: BN,
            vault: PublicKey,
            user: PublicKey,
        }[],
        outlets: {
            amount: BN,
            vault: PublicKey,
            user: PublicKey,
        }[],
        owner?: PublicKey
    ): Promise<string> {
        const ownerPubkey = owner || this.provider.wallet!.publicKey;
        const intos = []
        for (const inlet of inlets) {
            intos.push({
                amount: inlet.amount,
                vault: inlet.vault,
                user: inlet.user,
                isIn: true,
            })
        }
        for (const outlet of outlets) {
            intos.push({
                amount: outlet.amount,
                vault: outlet.vault,
                user: outlet.user,
                isIn: false,
            })
        }
        const amounts_tolerance = intos.map(into => into.amount);
        const is_in_token = intos.map(into => into.isIn);
        const remainingAccounts = []
        for (const item of intos) {
            remainingAccounts.push({ pubkey: item.user, isWritable: true, isSigner: false });
            remainingAccounts.push({ pubkey: item.vault, isWritable: true, isSigner: false });
        }
        let cu;
        if (intos.length == 2) {
            cu = 400_000;
        } else if (intos.length <= 6) {
            cu = 400_000 + 200_000 * intos.length;
        } else {
            throw new Error("Too many tokens to swap");
        }
        return await this.program.methods
            .swapAnyswap(amounts_tolerance, is_in_token)
            .accountsPartial({
                pool: pool,
                owner: ownerPubkey,
                tokenProgram: token.TOKEN_PROGRAM_ID,
            })
            .preInstructions([
                ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
            ])
            .remainingAccounts(remainingAccounts)
            .rpc();
    }

    // 修改费率
    async modifyFee(
        pool: PublicKey,
        feeNumerator: BN,
        feeDenominator: BN,
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet!.publicKey;

        return await this.program.methods
            .modifyFee(feeNumerator, feeDenominator)
            .accounts({
                pool: pool,
                admin: adminPubkey,
            })
            .rpc();
    }

    // 修改 Token 权重
    async modifyTokenWeight(
        pool: PublicKey,
        newWeights: BN[],
        mints: PublicKey[] = [],
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet!.publicKey;

        return await this.program.methods
            .modifyTokenWeight(newWeights)
            .accounts({
                pool: pool,
                admin: adminPubkey,
            })
            .remainingAccounts(mints.map(mint => ({ pubkey: mint, isWritable: false, isSigner: false })))
            .rpc();
    }

    // 从 Pool 移除 Token
    async removeTokenFromPool(
        pool: PublicKey,
        mint: PublicKey,
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet!.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const vault = this.getVault(pool, mint);

        return await this.program.methods
            .removeTokenFromPool()
            .accountsPartial({
                pool: pool,
                poolAuthority: poolAuthority,
                mint: mint,
                vault: vault,
                admin: adminPubkey,
            })
            .rpc();
    }

    // 获取 Pool 账户信息（公开方法）
    async getPoolInfo(pool: PublicKey) {
        const poolInfo = await this.program.account.anySwapPool.fetch(pool);
        const lpMint = this.getPoolMint(pool);
        const lpSupply = await token.getAssociatedTokenAddress(lpMint, this.provider.wallet!.publicKey);
        return {
            lpMint: lpMint,
            lpSupply: lpSupply,
            ...poolInfo,
            tokens: poolInfo.tokens.slice(0, poolInfo.tokenCount),
        };
    }
}

// 导出所需的类型和依赖
export { BN, type Provider } from '@coral-xyz/anchor';
export { PublicKey } from '@solana/web3.js';
export type { Anyswap } from "../../target/types/anyswap";
// @ts-ignore
export { default as IDL } from "../../target/idl/anyswap.json";