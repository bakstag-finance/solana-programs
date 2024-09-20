import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import { AmountsLD, ExchangeRates } from "../config/constants";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { Otc } from "./otc";
import { solanaToArbSepConfig } from "../config/peer";

export class OtcTools {
  static async createOffer(
    otc: Otc,
    srcSeller: Keypair,
    dstSeller?: number[], // if defined - crosschain
    srcTokenMint: PublicKey | null = null, // if defined - src token is spl
    dstTokenAddress: number[] = Array.from(PublicKey.default.toBytes()), // if defined - dst token is not native
  ): Promise<[PublicKey, number[]]> {
    const [dstEid, dstSellerAddress] = !!dstSeller // is crosschain ?
      ? [solanaToArbSepConfig.to.eid, dstSeller]
      : [
          EndpointId.SOLANA_V2_TESTNET,
          Array.from(srcSeller.publicKey.toBytes()),
        ];

    const params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"] = {
      dstSellerAddress,
      dstEid,
      dstTokenAddress,
      srcAmountLd: new anchor.BN(!srcTokenMint ? AmountsLD.SOL : AmountsLD.SPL),
      exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
    };

    const fee = (await otc.quoteCreateOffer(params, srcSeller))[1];

    return await otc.createOffer(params, fee, srcSeller, srcTokenMint);
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
}
