import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

export default async function transferSol(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  lamports: Number,
) {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: BigInt(lamports.valueOf()),
    }),
  );
  await sendAndConfirmTransaction(connection, transaction, [from]);
}
