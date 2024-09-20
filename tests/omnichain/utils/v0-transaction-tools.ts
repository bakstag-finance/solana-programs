import { COMMITMENT } from "../config/constants";
import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  TransactionInstruction,
} from "@solana/web3.js";

export class V0TransactionTools {
  static async createLookUpTable(
    connection: Connection,
    payer: Keypair,
    accounts: Array<PublicKey>,
    remainingAccounts,
  ): Promise<PublicKey> {
    // Get the current slot
    const slot = await connection.getSlot();

    // Create an instruction for creating a lookup table
    // and retrieve the address of the new lookup table
    const [lookupTableInst, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
        payer: payer.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
        recentSlot: slot - 1, // The recent slot to derive lookup table's address
      });

    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      lookupTable: lookupTableAddress, // The address of the lookup table to extend
      addresses: accounts, // The addresses to add to the lookup table
    });

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [lookupTableInst, extendInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    transaction.sign([payer]);

    const transactionSignature = await connection.sendTransaction(transaction);

    const latestBlockhash = await connection.getLatestBlockhash();

    const confirmation = await connection.confirmTransaction(
      {
        signature: transactionSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      COMMITMENT,
    );
    console.log("look up tx", transactionSignature);

    return lookupTableAddress;
  }

  static async extendLookUpTable(
    connection: Connection,
    lookupTableAddress: PublicKey,
    accounts: Array<PublicKey>,
    payer: Keypair,
  ) {
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      lookupTable: lookupTableAddress, // The address of the lookup table to extend
      addresses: accounts, // The addresses to add to the lookup table
    });

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [extendInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    transaction.sign([payer]);

    const transactionSignature = await connection.sendTransaction(transaction);

    const latestBlockhash = await connection.getLatestBlockhash();

    const confirmation = await connection.confirmTransaction(
      {
        signature: transactionSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      COMMITMENT,
    );
  }

  static async deactivateLookUpTable(
    connection: Connection,
    lookupTableAddress: PublicKey,
    payer: Keypair,
  ) {
    const deactivateInstruction =
      AddressLookupTableProgram.deactivateLookupTable({
        lookupTable: lookupTableAddress, // The address of the lookup table to deactivate
        authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      });
    let { blockhash } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [deactivateInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    transaction.sign([payer]);

    const transactionSignature = await connection.sendTransaction(transaction);

    const latestBlockhash = await connection.getLatestBlockhash();

    const confirmation = await connection.confirmTransaction(
      {
        signature: transactionSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      COMMITMENT,
    );
  }

  static async closeLookUpTable(
    connection: Connection,
    lookupTableAddress: PublicKey,
    payer: Keypair,
  ) {
    const closeInstruction = AddressLookupTableProgram.closeLookupTable({
      lookupTable: lookupTableAddress, // The address of the lookup table to close
      authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      recipient: payer.publicKey, // The recipient of closed account lamports
    });

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [closeInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    transaction.sign([payer]);

    const transactionSignature = await connection.sendTransaction(transaction);

    const latestBlockhash = await connection.getLatestBlockhash();

    const confirmation = await connection.confirmTransaction(
      {
        signature: transactionSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      COMMITMENT,
    );
  }

  static waitForNewBlock(connection: Connection, targetHeight: number) {
    console.log(`Waiting for ${targetHeight} new blocks`);
    return new Promise(async (resolve: any) => {
      // Get the last valid block height of the blockchain
      const { lastValidBlockHeight } = await connection.getLatestBlockhash();

      // Set an interval to check for new blocks every 1000ms
      const intervalId = setInterval(async () => {
        // Get the new valid block height
        const { lastValidBlockHeight: newValidBlockHeight } =
          await connection.getLatestBlockhash();
        // console.log(newValidBlockHeight)

        // Check if the new valid block height is greater than the target block height
        if (newValidBlockHeight > lastValidBlockHeight + targetHeight) {
          // If the target block height is reached, clear the interval and resolve the promise
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  }

  static async sendV0Transaction(
    connection: Connection,
    user: Keypair,
    instructions: TransactionInstruction[],
    lookupTableAccounts?: AddressLookupTableAccount[],
  ) {
    // Get the latest blockhash and last valid block height
    const { lastValidBlockHeight, blockhash } =
      await connection.getLatestBlockhash();

    // Create a new transaction message with the provided instructions
    const messageV0 = new TransactionMessage({
      payerKey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      recentBlockhash: blockhash, // The blockhash of the most recent block
      instructions, // The instructions to include in the transaction
    }).compileToV0Message(
      lookupTableAccounts ? lookupTableAccounts : undefined,
    );

    // Create a new transaction object with the message
    const transaction = new VersionedTransaction(messageV0);

    // Sign the transaction with the user's keypair
    transaction.sign([user]);

    // Send the transaction to the cluster
    const txid = await connection.sendTransaction(transaction);

    // Confirm the transaction
    await connection.confirmTransaction(
      {
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature: txid,
      },
      COMMITMENT,
    );

    // Log the transaction URL on the Solana Explorer
    console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
  }
}
