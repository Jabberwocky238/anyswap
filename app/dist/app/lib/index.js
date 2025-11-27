"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDL = exports.PublicKey = exports.BN = exports.AnySwap = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const token = __importStar(require("@solana/spl-token"));
// @ts-ignore
const anyswap_json_1 = __importDefault(require("../../target/idl/anyswap.json"));
class AnySwap {
    constructor(provider) {
        this.provider = provider;
        this.program = new anchor_1.Program(anyswap_json_1.default, provider);
        this.connection = provider.connection;
    }
    // 辅助函数：获取 Pool Authority PDA
    getPoolAuthority(pool) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("anyswap_authority"), pool.toBuffer()], this.program.programId);
    }
    // 辅助函数：获取 Pool Mint PDA
    getPoolMint(pool) {
        const [poolMint] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool_mint"), pool.toBuffer()], this.program.programId);
        return poolMint;
    }
    // 辅助函数：获取 Vault PDA
    getVault(pool, mint) {
        const [vault] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("vault"), pool.toBuffer(), mint.toBuffer()], this.program.programId);
        return vault;
    }
    // 创建 Pool
    async createPool(feeNumerator, feeDenominator, adminPubkey) {
        const poolKeypair = web3_js_1.Keypair.generate();
        const pool = poolKeypair.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const poolMint = this.getPoolMint(pool);
        const poolSpace = 8 + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024); // 73792 bytes
        const lamports = await this.connection.getMinimumBalanceForRentExemption(poolSpace);
        const createAccountIx = web3_js_1.SystemProgram.createAccount({
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
            systemProgram: web3_js_1.SystemProgram.programId,
            tokenProgram: token.TOKEN_PROGRAM_ID,
            rent: web3_js_1.SYSVAR_RENT_PUBKEY,
        })
            .instruction();
        const tx = new web3_js_1.Transaction().add(createAccountIx, createPoolIx);
        // 使用 sendAndConfirm 发送交易，poolKeypair 作为额外签名者
        const signature = await this.provider.sendAndConfirm(tx, [poolKeypair], {
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
    async addTokenToPool(pool, mint, weight, liquidity, existingVaults = [], admin) {
        const adminPubkey = admin || this.provider.wallet.publicKey;
        const remainingAccounts = existingVaults.flatMap((vault) => [
            { pubkey: vault, isWritable: false, isSigner: false },
        ]);
        return await this.program.methods
            .addTokenToPool(weight, liquidity)
            .accounts({
            pool: pool,
            mint: mint,
            admin: adminPubkey,
            payer: this.provider.wallet.publicKey,
        })
            .remainingAccounts(remainingAccounts)
            .rpc();
    }
    // 添加流动性
    async addLiquidity(pool, amounts, userTokenAccounts, vaultAccounts, owner) {
        const ownerPubkey = owner || this.provider.wallet.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const poolMint = this.getPoolMint(pool);
        const userPoolAta = await token.getAssociatedTokenAddress(poolMint, ownerPubkey, false, token.TOKEN_PROGRAM_ID, token.ASSOCIATED_TOKEN_PROGRAM_ID);
        const accounts = {
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
    async removeLiquidity(pool, burnAmount, userTokenAccounts, vaultAccounts, owner) {
        const ownerPubkey = owner || this.provider.wallet.publicKey;
        const [poolAuthority] = this.getPoolAuthority(pool);
        const poolMint = this.getPoolMint(pool);
        const userPoolAta = await token.getAssociatedTokenAddress(poolMint, ownerPubkey, false, token.TOKEN_PROGRAM_ID, token.ASSOCIATED_TOKEN_PROGRAM_ID);
        const accounts = {
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
    async swap(pool, inlets, outlets, owner) {
        const ownerPubkey = owner || this.provider.wallet.publicKey;
        const intos = [];
        for (const inlet of inlets) {
            intos.push({
                amount: inlet.amount,
                vault: inlet.vault,
                user: inlet.user,
                isIn: true,
            });
        }
        for (const outlet of outlets) {
            intos.push({
                amount: outlet.amount,
                vault: outlet.vault,
                user: outlet.user,
                isIn: false,
            });
        }
        const amounts_tolerance = intos.map(into => into.amount);
        const is_in_token = intos.map(into => into.isIn);
        const remainingAccounts = [];
        for (const item of intos) {
            remainingAccounts.push({ pubkey: item.user, isWritable: true, isSigner: false });
            remainingAccounts.push({ pubkey: item.vault, isWritable: true, isSigner: false });
        }
        return await this.program.methods
            .swapAnyswap(amounts_tolerance, is_in_token)
            .accountsPartial({
            pool: pool,
            owner: ownerPubkey,
            tokenProgram: token.TOKEN_PROGRAM_ID,
        })
            .remainingAccounts(remainingAccounts)
            .rpc();
    }
    // 修改费率
    async modifyFee(pool, feeNumerator, feeDenominator, admin) {
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
    async modifyTokenWeight(pool, newWeights, mints = [], admin) {
        const adminPubkey = admin || this.provider.wallet.publicKey;
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
    async removeTokenFromPool(pool, mint, admin) {
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
    async getPoolInfo(pool) {
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
exports.AnySwap = AnySwap;
// 导出所需的类型和依赖
var anchor_2 = require("@coral-xyz/anchor");
Object.defineProperty(exports, "BN", { enumerable: true, get: function () { return anchor_2.BN; } });
var web3_js_2 = require("@solana/web3.js");
Object.defineProperty(exports, "PublicKey", { enumerable: true, get: function () { return web3_js_2.PublicKey; } });
// @ts-ignore
var anyswap_json_2 = require("../../target/idl/anyswap.json");
Object.defineProperty(exports, "IDL", { enumerable: true, get: function () { return __importDefault(anyswap_json_2).default; } });
