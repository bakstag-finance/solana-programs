import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";

export class OtcTools {
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
}
