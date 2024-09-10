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

export async function getRemainings(
  connection: Connection,
  accounts: Array<Keypair>,
  to: PublicKey,
) {
  const GAS = 1_000_000; //0.001 sol for transfer and rent
  for (const account of accounts) {
    const balance = await connection.getBalance(account.publicKey);
    if (balance > GAS) {
      await transferSol(connection, account, to, balance - GAS);
      // console.log(
      //   (balance - GAS) / 1_000_000_000,
      //   "SOL transfered from",
      //   account.publicKey,
      // );
    }
  }
}
