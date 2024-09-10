import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import {
  AmountsLD,
  Decimals,
  ExchangeRates,
  GAS,
  SOLANA_EID,
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
    srcTokenMint?: PublicKey,
  ) {
    const isSrcTokenNative = !!!srcTokenMint;
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
function hexlify(arg0: any): string {
  throw new Error("Function not implemented.");
}
