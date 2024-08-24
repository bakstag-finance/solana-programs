import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import type { Connection, PublicKey, Signer } from "@solana/web3.js";

export class Token {
  mint: PublicKey;
  ata: PublicKey;
}

export async function createMintAndAta(
  connection: Connection,
  payer: Signer,
  owner: PublicKey,
  decimals: number
): Promise<Token> {
  const mint = await createMint(connection, payer, owner, null, decimals);

  const ata = (
    await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner)
  ).address;

  return { mint, ata };
}

// export async function createAta(
//   connection: Connection,
//   payer: Signer,
//   mint: PublicKey,
//   owner: PublicKey
// ) {
//   return (
//     await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner)
//   ).address;
// }

export async function getBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<Number> {
  const info = await getAccount(connection, tokenAccount);

  return Number(info.amount);
}
