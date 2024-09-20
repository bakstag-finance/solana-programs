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
    dstSeller?: number[],
    srcToken?: PublicKey,
    dstToken?: PublicKey,
  ): Promise<[PublicKey, number[]]> {
    const isCrosschain = !!dstSeller;

    const isSrcTokenNative = !srcToken;

    const [dstEid, dstSellerAddress] = isCrosschain
      ? [solanaToArbSepConfig.to.eid, dstSeller]
      : [
          EndpointId.SOLANA_V2_TESTNET,
          Array.from(srcSeller.publicKey.toBytes()),
        ];

    const srcTokenMint = isSrcTokenNative ? null : srcToken;
    const dstTokenMint = !dstToken ? PublicKey.default : dstToken;

    const params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"] = {
      dstSellerAddress,
      dstEid,
      dstTokenAddress: Array.from(dstTokenMint.toBytes()),
      srcAmountLd: new anchor.BN(
        isSrcTokenNative ? AmountsLD.SOL : AmountsLD.SPL,
      ),
      exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
    };

    const offer = await otc.createOffer(
      params,
      await otc.quoteCreateOffer(params, srcSeller)[1], // fee
      srcSeller,
      srcTokenMint,
    );

    return offer;
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
