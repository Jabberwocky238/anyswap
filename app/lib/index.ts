import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import type { Anyswap } from "../../target/types/anyswap";
import type { Idl } from "@coral-xyz/anchor";
import * as token from "@solana/spl-token";
// @ts-ignore
import idl from "../../target/idl/anyswap.json";
import {
    utils,
    type Provider,
    getProvider,
} from '@coral-xyz/anchor';

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export class Client {
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

        const signature = await this.provider.sendAndConfirm(tx, [this.provider.wallet.payer, poolKeypair], {
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
        existingVaults: PublicKey[] = [],
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const vault = this.getVault(pool, mint);
        const adminToken = await token.getAssociatedTokenAddress(
            mint,
            adminPubkey,
            false,
            token.TOKEN_PROGRAM_ID,
            token.ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const accounts: any = {
            pool: pool,
            poolAuthority: poolAuthority,
            mint: mint,
            vault: vault,
            adminToken: adminToken,
            admin: adminPubkey,
            payer: this.provider.wallet.publicKey,
            tokenProgram: token.TOKEN_PROGRAM_ID,
            associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        };

        const remainingAccounts = existingVaults.flatMap((vault) => [
            { pubkey: vault, isWritable: false, isSigner: false },
        ]);

        return await this.program.methods
            .addTokenToPool(weight)
            .accounts(accounts)
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
        const ownerPubkey = owner || this.provider.wallet.publicKey;
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
        const ownerPubkey = owner || this.provider.wallet.publicKey;
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
        amountIn: BN,
        minAmountOut: BN,
        vaultIn: PublicKey,
        vaultOut: PublicKey,
        userIn: PublicKey,
        userOut: PublicKey,
        owner?: PublicKey
    ): Promise<string> {
        const ownerPubkey = owner || this.provider.wallet.publicKey;

        return await this.program.methods
            .swapAnyswap(amountIn, minAmountOut)
            .accountsPartial({
                pool: pool,
                vaultIn: vaultIn,
                vaultOut: vaultOut,
                userIn: userIn,
                userOut: userOut,
                owner: ownerPubkey,
                tokenProgram: token.TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    // 修改费率
    async modifyFee(
        pool: PublicKey,
        feeNumerator: BN,
        feeDenominator: BN,
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet.publicKey;

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
        mint: PublicKey,
        newWeight: BN,
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet.publicKey;

        return await this.program.methods
            .modifyTokenWeight(newWeight)
            .accounts({
                pool: pool,
                mint: mint,
                admin: adminPubkey,
            })
            .rpc();
    }

    // 从 Pool 移除 Token
    async removeTokenFromPool(
        pool: PublicKey,
        mint: PublicKey,
        admin?: PublicKey
    ): Promise<string> {
        const adminPubkey = admin || this.provider.wallet.publicKey;

        return await this.program.methods
            .removeTokenFromPool()
            .accounts({
                pool: pool,
                mint: mint,
                admin: adminPubkey,
            })
            .rpc();
    }

    // 获取 Pool 账户信息（公开方法）
    async getPoolInfo(pool: PublicKey) {
        const poolInfo = await this.program.account.anySwapPool.fetch(pool);
        const lpMint = this.getPoolMint(pool);
        const lpSupply = await token.getAssociatedTokenAddress(lpMint, this.provider.wallet.publicKey);
        return {
            lpMint: lpMint,
            lpSupply: lpSupply,
            ...poolInfo,
            tokens: poolInfo.tokens.slice(0, poolInfo.tokenCount),
        };
    }
}