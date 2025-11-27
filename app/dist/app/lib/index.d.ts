import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { type Provider } from '@coral-xyz/anchor';
export declare class AnySwap {
    private provider;
    private program;
    private connection;
    constructor(provider: Provider);
    getPoolAuthority(pool: PublicKey): [PublicKey, number];
    getPoolMint(pool: PublicKey): PublicKey;
    getVault(pool: PublicKey, mint: PublicKey): PublicKey;
    createPool(feeNumerator: BN, feeDenominator: BN, adminPubkey: PublicKey): Promise<{
        pool: PublicKey;
        poolKeypair: Keypair;
        poolAuthority: PublicKey;
        poolMint: PublicKey;
        signature: string;
    }>;
    addTokenToPool(pool: PublicKey, mint: PublicKey, weight: BN, liquidity: BN, existingVaults?: PublicKey[], admin?: PublicKey): Promise<string>;
    addLiquidity(pool: PublicKey, amounts: BN[], userTokenAccounts: PublicKey[], vaultAccounts: PublicKey[], owner?: PublicKey): Promise<string>;
    removeLiquidity(pool: PublicKey, burnAmount: BN, userTokenAccounts: PublicKey[], vaultAccounts: PublicKey[], owner?: PublicKey): Promise<string>;
    swap(pool: PublicKey, inlets: {
        amount: BN;
        vault: PublicKey;
        user: PublicKey;
    }[], outlets: {
        amount: BN;
        vault: PublicKey;
        user: PublicKey;
    }[], owner?: PublicKey): Promise<string>;
    modifyFee(pool: PublicKey, feeNumerator: BN, feeDenominator: BN, admin?: PublicKey): Promise<string>;
    modifyTokenWeight(pool: PublicKey, newWeights: BN[], mints?: PublicKey[], admin?: PublicKey): Promise<string>;
    removeTokenFromPool(pool: PublicKey, mint: PublicKey, admin?: PublicKey): Promise<string>;
    getPoolInfo(pool: PublicKey): Promise<{
        tokens: {
            vaultAccount: PublicKey;
            mintAccount: PublicKey;
            weight: BN;
        }[];
        tokenCount: number;
        padding: number[];
        admin: PublicKey;
        totalAmountMinted: BN;
        feeNumerator: BN;
        feeDenominator: BN;
        lpMint: PublicKey;
        lpSupply: PublicKey;
    }>;
}
export { BN, type Provider } from '@coral-xyz/anchor';
export { PublicKey } from '@solana/web3.js';
export type { Anyswap } from "../../target/types/anyswap";
export { default as IDL } from "../../target/idl/anyswap.json";
