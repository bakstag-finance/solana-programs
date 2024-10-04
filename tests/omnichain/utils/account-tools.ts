import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { AmountsLD, Decimals, GAS, Token } from "../config/constants";
import { Otc } from "./otc";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export class AccountTools {
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
      await this.transferSol(
        otc.connection,
        otc.payer,
        srcSeller.publicKey,
        AmountsLD.SOL + GAS, // offer amount + gas
      );
    } else {
      await this.transferSol(
        otc.connection,
        otc.payer,
        srcSeller.publicKey,
        GAS,
      );
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
        await this.transferSol(
          otc.connection,
          otc.payer,
          dstBuyer.publicKey,
          AmountsLD.SOL + GAS, // offer amount + gas
        );
      } else {
        await this.transferSol(
          otc.connection,
          otc.payer,
          dstBuyer.publicKey,
          GAS,
        );
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

  static async transferSol(
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

  static async getRemainings(
    connection: Connection,
    accounts: Array<Keypair>,
    to: PublicKey,
  ) {
    const GAS = 1_000_000; //0.001 sol for transfer and rent
    for (const account of accounts) {
      const balance = await connection.getBalance(account.publicKey);
      if (balance > GAS) {
        await this.transferSol(connection, account, to, balance - GAS);
        // console.log(
        //   (balance - GAS) / 1_000_000_000,
        //   "SOL transfered from",
        //   account.publicKey,
        // );
      }
    }
  }
}
