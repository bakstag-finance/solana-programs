import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import transferSol from "./transfer";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { SRC_EID } from "../config/constants";
import { OtcPdaDeriver } from "./otc_pda_deriver";

export class OtcTools {
  static async getOfferFromParams(
    program: Program<OtcMarket>,
    srcSellerAddress: number[],
    srcEid: number,
    dstEid: number,
    srcTokenAddress: number[],
    dstTokenAddress: number[],
    exchangeRateSd: anchor.BN,
  ): Promise<PublicKey> {
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

    return PublicKey.findProgramAddressSync([offerId], program.programId)[0];
  }
}

export class Otc {
  programId: PublicKey;
  deriver: OtcPdaDeriver;

  constructor(programId: PublicKey) {
    this.programId = programId;
  }

  async createOffer(
    program: Program<OtcMarket>,
    connection: Connection,
    params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"],
    payer: Keypair,
    seller: Keypair,
    otcConfig: PublicKey,
    srcTokenMint?: PublicKey, // required for src spl token
  ): Promise<PublicKey> {
    const srcSellerAta = srcTokenMint
      ? (
          await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            srcTokenMint,
            seller.publicKey,
          )
        ).address
      : undefined;

    if (!srcTokenMint) {
      // src sol token
      await transferSol(
        connection,
        payer,
        seller.publicKey,
        params.srcAmountLd.toNumber(),
      );
    } else {
      // src spl token
      await mintTo(
        connection,
        payer,
        srcTokenMint,
        srcSellerAta,
        payer.publicKey,
        params.srcAmountLd.toNumber(),
      );
    }

    const offer = await OtcTools.getOfferFromParams(
      program,
      Array.from(seller.publicKey.toBytes()),
      SRC_EID,
      params.dstEid,
      srcTokenMint
        ? Array.from(srcTokenMint.toBytes())
        : Array.from(PublicKey.default.toBytes()),
      params.dstTokenAddress,
      params.exchangeRateSd,
    );

    const otcPdaDeriver = new OtcPdaDeriver(program.programId);
    const escrow = otcPdaDeriver.escrow();
    const srcEscrowAta = srcTokenMint
      ? (
          await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            srcTokenMint,
            seller.publicKey,
          )
        ).address
      : undefined;

    await program.methods
      .createOffer(params)
      .accounts({
        seller: seller.publicKey,
        offer,
        otcConfig,
        srcTokenMint,
        srcSellerAta,
        srcEscrowAta,
        escrow,
      })
      .signers([seller])
      .rpc();

    return offer;
  }
}
