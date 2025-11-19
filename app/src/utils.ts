import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Anyswap } from "../../target/types/anyswap";

/**
 * 计算 Pool Authority PDA
 */
export function getPoolAuthority(
  program: Program<Anyswap>,
  pool: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("anyswap_authority"), pool.toBuffer()],
    program.programId
  );
}

/**
 * 计算 Pool Mint PDA
 */
export function getPoolMint(
  program: Program<Anyswap>,
  pool: PublicKey
): PublicKey {
  const [poolMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_mint"), pool.toBuffer()],
    program.programId
  );
  return poolMint;
}

/**
 * 计算 Vault PDA
 */
export function getVault(
  program: Program<Anyswap>,
  pool: PublicKey,
  mint: PublicKey
): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer(), mint.toBuffer()],
    program.programId
  );
  return vault;
}

/**
 * 计算 Pool 账户所需的空间
 */
export function getPoolSpace(): number {
  // 8 (discriminator) + 2 + 6 + 32 + 8 + 8 + 8 + (72 * 1024) = 73792 bytes
  return 8 + 2 + 6 + 32 + 8 + 8 + 8 + 72 * 1024;
}

