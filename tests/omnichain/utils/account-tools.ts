import { Keypair, PublicKey } from "@solana/web3.js";
import { AmountsLD, Decimals, GAS, Token } from "../config/constants";
import { Otc } from "./otc";
import transferSol from "./transfer";
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
}
