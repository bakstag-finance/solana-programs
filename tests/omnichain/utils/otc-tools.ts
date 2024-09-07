import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import { AmountsLD, Decimals, ExchangeRates, Token } from "../config/constants";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { Otc } from "./otc";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import transferSol from "./transfer";

export class OtcTools {
  static async createOffer(
    otc: Otc,
    tokenPair: {
      srcToken: Token.SOL | Token.SPL;
      dstToken: Token;
    },
    crosschain?: {
      dstSeller: number[];
      dstEid: number;
    },
  ): Promise<{
    seller: Keypair;
    offer: [PublicKey, number[]];
    srcTokenMint?: PublicKey;
  }> {
    const isCrosschain = !!crosschain;
    const isSrcTokenNative = tokenPair.srcToken == Token.SOL;

    const srcSeller = Keypair.generate();

    const [dstEid, dstSellerAddress] = isCrosschain
      ? [crosschain.dstEid, crosschain.dstSeller]
      : [
          EndpointId.SOLANA_V2_TESTNET,
          Array.from(srcSeller.publicKey.toBytes()),
        ];

    // accounts
    const srcTokenMint = isSrcTokenNative
      ? null
      : await createMint(
          otc.connection,
          otc.payer,
          otc.payer.publicKey,
          null,
          Decimals.SPL,
        ); // create token on behalf of otc payer

    // fund seller
    if (isSrcTokenNative) {
      await transferSol(
        otc.connection,
        otc.payer,
        srcSeller.publicKey,
        AmountsLD.SOL + 1_000_000_000, // offer amount + gas
      );
    } else {
      await transferSol(
        otc.connection,
        otc.payer,
        srcSeller.publicKey,
        1_000_000_000, // gas
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

    // create offer
    const params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"] = {
      dstSellerAddress,
      dstEid,
      dstTokenAddress: Array.from(PublicKey.default.toBytes()),
      srcAmountLd: new anchor.BN(
        isSrcTokenNative ? AmountsLD.SOL : AmountsLD.SPL,
      ),
      exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
    };

    const offer = await otc.createOffer(params, srcSeller, srcTokenMint);

    // return
    return {
      seller: srcSeller,
      offer,
      srcTokenMint: srcTokenMint ?? undefined,
    };
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
