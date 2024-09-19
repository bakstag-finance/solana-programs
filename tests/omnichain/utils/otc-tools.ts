import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program, web3 } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import {
  AmountsLD,
  COMMITMENT,
  Decimals,
  ExchangeRates,
  GAS,
  Token,
} from "../config/constants";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { Otc } from "./otc";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import transferSol from "./transfer";
import { solanaToArbSepConfig } from "../config/peer";

import { CreateOfferParams } from "../../helpers/create_offer";
import {
  bytes32ToEthAddress,
  PacketPath,
} from "@layerzerolabs/lz-v2-utilities";
import { solanaToArbSepConfig as peer } from "../config/peer";
import { EndpointProgram, UlnProgram } from "@layerzerolabs/lz-solana-sdk-v2";

export class OtcTools {
  static async createOffer(
    otc: Otc,
    srcSeller: Keypair,
    crosschain?: {
      dstSeller: number[];
    },
    srcToken?: {
      srcTokenMint: PublicKey;
    },
    dstToken?: {
      dstTokenMint: PublicKey;
    },
  ): Promise<[PublicKey, number[]]> {
    const isCrosschain = !!crosschain;

    const isSrcTokenNative = !!!srcToken;
    const isDstTokenNative = !!!dstToken;

    const [dstEid, dstSellerAddress] = isCrosschain
      ? [solanaToArbSepConfig.to.eid, crosschain.dstSeller]
      : [
          EndpointId.SOLANA_V2_TESTNET,
          Array.from(srcSeller.publicKey.toBytes()),
        ];

    const srcTokenMint = isSrcTokenNative ? null : srcToken.srcTokenMint;
    const dstTokenMint = isDstTokenNative
      ? PublicKey.default
      : dstToken.dstTokenMint;

    // create offer
    const params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"] = {
      dstSellerAddress,
      dstEid,
      dstTokenAddress: Array.from(dstTokenMint.toBytes()),
      srcAmountLd: new anchor.BN(
        isSrcTokenNative ? AmountsLD.SOL : AmountsLD.SPL,
      ),
      exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
    };

    const sth = await otc.quoteCreateOffer(params, srcSeller);

    const offer = await otc.createOffer(
      params,
      sth[1],
      srcSeller,
      srcTokenMint,
    );

    // return
    return offer;
  }

  static async generateAccounts(otc, srcToken: Token.SOL | Token.SPL) {
    const seller = Keypair.generate();
    let srcTokenMint = null;
    if (srcToken == Token.SPL) {
      srcTokenMint = await createMint(
        otc.connection,
        otc.payer,
        otc.payer.publicKey,
        null,
        Decimals.SPL,
      );
    }
    this.topUpAccounts(otc, seller, srcTokenMint);

    return {
      seller,
      srcTokenMint,
    };
  }

  static async topUpAccounts(
    otc: Otc,
    srcSeller: Keypair,
    dstBuyer: Keypair | null = null,
    srcTokenMint?: PublicKey,
    dstTokenMint?: PublicKey,
  ) {
    const isSrcTokenNative = !!!srcTokenMint;
    const isDstTokenNative = !!!dstTokenMint;
    if (isSrcTokenNative) {
      await transferSol(
        otc.connection,
        otc.payer,
        srcSeller.publicKey,
        AmountsLD.SOL + GAS, // offer amount + gas
      );
    } else {
      await transferSol(otc.connection, otc.payer, srcSeller.publicKey, GAS);
      const srcSellerAta = (
        await getOrCreateAssociatedTokenAccount(
          otc.connection,
          srcSeller,
          srcTokenMint,
          srcSeller.publicKey,
        )
      ).address;
      await mintTo(
        otc.connection,
        otc.payer,
        srcTokenMint,
        srcSellerAta,
        otc.payer,
        AmountsLD.SPL,
      ); // mint on behalf of otc payer
    }

    if (dstBuyer) {
      if (isDstTokenNative) {
        await transferSol(
          otc.connection,
          otc.payer,
          dstBuyer.publicKey,
          AmountsLD.SOL + GAS, // offer amount + gas
        );
      } else {
        await transferSol(otc.connection, otc.payer, dstBuyer.publicKey, GAS);
        const dstBuyerAta = (
          await getOrCreateAssociatedTokenAccount(
            otc.connection,
            dstBuyer,
            dstTokenMint,
            dstBuyer.publicKey,
          )
        ).address;
        await mintTo(
          otc.connection,
          otc.payer,
          dstTokenMint,
          dstBuyerAta,
          otc.payer,
          AmountsLD.SPL,
        ); // mint on behalf of otc payer
      }
    }
  }

  static async getOfferFromParams(
    program: Program<OtcMarket>,
    srcSellerAddress: number[],
    srcEid: number,
    dstEid: number,
    srcTokenAddress: number[],
    dstTokenAddress: number[],
    exchangeRateSd: anchor.BN,
  ): Promise<[PublicKey, number[]]> {
    const offerId: Uint8Array = await program.methods
      .hashOffer(
        srcSellerAddress,
        srcEid,
        dstEid,
        srcTokenAddress,
        dstTokenAddress,
        exchangeRateSd,
      )
      .view();

    return [
      PublicKey.findProgramAddressSync([offerId], program.programId)[0],
      Array.from(offerId),
    ];
  }

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
      web3.AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
        payer: payer.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
        recentSlot: slot - 1, // The recent slot to derive lookup table's address
      });

    const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      lookupTable: lookupTableAddress, // The address of the lookup table to extend
      addresses: accounts, // The addresses to add to the lookup table
    });

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new web3.TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [lookupTableInst, extendInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new web3.VersionedTransaction(message);

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
    const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      lookupTable: lookupTableAddress, // The address of the lookup table to extend
      addresses: accounts, // The addresses to add to the lookup table
    });

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new web3.TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [extendInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new web3.VersionedTransaction(message);

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
      web3.AddressLookupTableProgram.deactivateLookupTable({
        lookupTable: lookupTableAddress, // The address of the lookup table to deactivate
        authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      });
    let { blockhash } = await connection.getLatestBlockhash();

    const message = new web3.TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [deactivateInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new web3.VersionedTransaction(message);

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
    const closeInstruction = web3.AddressLookupTableProgram.closeLookupTable({
      lookupTable: lookupTableAddress, // The address of the lookup table to close
      authority: payer.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      recipient: payer.publicKey, // The recipient of closed account lamports
    });

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new web3.TransactionMessage({
      payerKey: payer.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: [closeInstruction], // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new web3.VersionedTransaction(message);

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

  static waitForNewBlock(connection: web3.Connection, targetHeight: number) {
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
    connection: web3.Connection,
    user: web3.Keypair,
    instructions: web3.TransactionInstruction[],
    lookupTableAccounts?: web3.AddressLookupTableAccount[],
  ) {
    // Get the latest blockhash and last valid block height
    const { lastValidBlockHeight, blockhash } =
      await connection.getLatestBlockhash();

    // Create a new transaction message with the provided instructions
    const messageV0 = new web3.TransactionMessage({
      payerKey: user.publicKey, // The payer (i.e., the account that will pay for the transaction fees)
      recentBlockhash: blockhash, // The blockhash of the most recent block
      instructions, // The instructions to include in the transaction
    }).compileToV0Message(
      lookupTableAccounts ? lookupTableAccounts : undefined,
    );

    // Create a new transaction object with the message
    const transaction = new web3.VersionedTransaction(messageV0);

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
function hexlify(arg0: any): string {
  throw new Error("Function not implemented.");
}
