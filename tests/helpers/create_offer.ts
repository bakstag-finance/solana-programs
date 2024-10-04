import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { BN, Program, IdlTypes, IdlAccounts } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import { Accounts, transferSol } from "./helper";
import {
  CREATE_OFFER_AMOUNTS,
  DST_EID,
  EXCHANGE_RATE_SD,
  SRC_EID,
} from "./constants";
import { mintTo } from "@solana/spl-token";

export type CreateOfferParams = IdlTypes<OtcMarket>["CreateOfferParams"];
export type Offer = Omit<
  IdlAccounts<OtcMarket>["offer"],
  "bump" | "srcAmountSd"
> & {
  srcAmountLd: BN;
};

export class OfferInfo {
  account: PublicKey;
  id: Uint8Array;
}

export async function getOfferAccount(
  program: Program<OtcMarket>,
  srcSellerAddress: number[],
  srcEid: number,
  dstEid: number,
  srcTokenAddress: number[],
  dstTokenAddress: number[],
  exchangeRateSd: BN,
): Promise<OfferInfo> {
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

  const [offer, __] = PublicKey.findProgramAddressSync(
    [offerId],
    program.programId,
  );

  return {
    account: offer,
    id: offerId,
  };
}

export async function createSplOffer(
  program: Program<OtcMarket>,
  connection: Connection,
  payer: Keypair,
  accounts: Accounts,
): Promise<OfferInfo> {
  return await createOffer(program, connection, payer, accounts, {
    srcSellerAddress: Array.from(accounts.srcSeller.publicKey.toBytes()),
    dstSellerAddress: Array.from(accounts.dstSeller.publicKey.toBytes()),
    srcEid: SRC_EID,
    dstEid: DST_EID,
    srcTokenAddress: Array.from(accounts.srcToken.toBytes()),
    dstTokenAddress: Array.from(accounts.dstToken.toBytes()),
    srcAmountLd: new anchor.BN(CREATE_OFFER_AMOUNTS.srcAmountLdSpl),
    exchangeRateSd: new anchor.BN(EXCHANGE_RATE_SD),
  });
}

export async function createOffer(
  program: Program<OtcMarket>,
  connection: Connection,
  payer: Keypair,
  accounts: Pick<
    Accounts,
    | "srcSeller"
    | "srcToken"
    | "srcSellerAta"
    | "otcConfig"
    | "escrow"
    | "srcEscrowAta"
    | "dstSeller"
  >,
  offer: Offer,
): Promise<OfferInfo> {
  // TODO: fix
  const isNative =
    offer.srcTokenAddress.toString() == PublicKey.default.toBytes().toString();

  if (isNative) {
    // sol
    await transferSol(
      connection,
      payer,
      accounts.srcSeller.publicKey,
      offer.srcAmountLd.toNumber(),
    );
  } else {
    // spl
    await mintTo(
      connection,
      payer,
      accounts.srcToken,
      accounts.srcSellerAta,
      payer.publicKey,
      offer.srcAmountLd.toNumber(),
    );
  }

  const offerInfo = await getOfferAccount(
    program,
    offer.srcSellerAddress,
    offer.srcEid,
    offer.dstEid,
    offer.srcTokenAddress,
    offer.dstTokenAddress,
    offer.exchangeRateSd,
  );

  await program.methods
    .createOffer({
      dstSellerAddress: offer.dstSellerAddress,
      dstEid: offer.dstEid,
      dstTokenAddress: offer.dstTokenAddress,
      srcAmountLd: offer.srcAmountLd,
      exchangeRateSd: offer.exchangeRateSd,
    })
    .accounts({
      seller: accounts.srcSeller.publicKey,
      offer: offerInfo.account,
      otcConfig: accounts.otcConfig,
      srcTokenMint: isNative ? null : accounts.srcToken,
      srcSellerAta: isNative ? null : accounts.srcSellerAta,
      escrowAta: isNative ? null : accounts.srcEscrowAta,
      escrow: accounts.escrow,
    })
    .signers([accounts.srcSeller])
    .rpc();

  return offerInfo;
}

export async function createNativeOffer(
  program: Program<OtcMarket>,
  connection: Connection,
  payer: Keypair,
  accounts: Accounts,
): Promise<OfferInfo> {
  return await createOffer(program, connection, payer, accounts, {
    srcSellerAddress: Array.from(accounts.srcSeller.publicKey.toBytes()),
    dstSellerAddress: Array.from(accounts.dstSeller.publicKey.toBytes()),
    srcEid: SRC_EID,
    dstEid: DST_EID,
    srcTokenAddress: Array.from(PublicKey.default.toBytes()),
    dstTokenAddress: Array.from(PublicKey.default.toBytes()),
    srcAmountLd: new anchor.BN(CREATE_OFFER_AMOUNTS.srcAmountLdNative),
    exchangeRateSd: new anchor.BN(EXCHANGE_RATE_SD),
  });
}
