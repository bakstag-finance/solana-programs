import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { OtcPdaDeriver } from "./otc-pda-deriver";
import { OtcTools } from "./otc-tools";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import {
  EndpointProgram,
  simulateTransaction,
  UlnProgram,
} from "@layerzerolabs/lz-solana-sdk-v2";
import {
  COMMITMENT,
  ENDPOINT_PROGRAM_ID,
  PEER,
  TREASURY_SECRET_KEY,
} from "../config/constants";
import { hexlify } from "ethers/lib/utils";
import {
  MessagingFee,
  quoteAcceptOfferBeet,
  quoteCreateOfferBeet,
} from "./beet-decoder";
import { assert } from "chai";
import { isNativeToken } from "./is-native-token";
import { V0TransactionTools } from "./v0-transaction-tools";

export class Otc {
  program: Program<OtcMarket>;
  connection: Connection;
  payer: Keypair;

  deriver: OtcPdaDeriver;
  endpoint: EndpointProgram.Endpoint;

  constructor(
    program: Program<OtcMarket>,
    connection: Connection,
    payer: Keypair,
  ) {
    this.program = program;
    this.connection = connection;
    this.payer = payer;

    this.deriver = new OtcPdaDeriver(program.programId);
    this.endpoint = new EndpointProgram.Endpoint(
      new PublicKey(ENDPOINT_PROGRAM_ID),
    );
  }

  async quoteCreateOffer(
    params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"],
    seller: Keypair,
    srcTokenMint: PublicKey | null = null, // required for src spl token
  ): Promise<[anchor.IdlTypes<OtcMarket>["CreateOfferReceipt"], MessagingFee]> {
    const srcEid = EndpointId.SOLANA_V2_TESTNET;
    const crosschain = params.dstEid !== srcEid;

    const otcConfig = this.deriver.config();

    const [peer, enforcedOptions, remainingAccounts] = crosschain
      ? [
          this.deriver.peer(params.dstEid),
          this.deriver.enforcedOptions(params.dstEid),
          await this.endpoint.getQuoteIXAccountMetaForCPI(
            this.connection,
            seller.publicKey,
            {
              dstEid: params.dstEid,
              srcEid,
              sender: hexlify(otcConfig.toBytes()),
              receiver: PEER,
            },
            new UlnProgram.Uln(
              (
                await this.endpoint.getSendLibrary(
                  this.connection,
                  otcConfig,
                  params.dstEid,
                )
              ).programId,
            ),
          ),
        ]
      : [null, null, []];

    const ix = await this.program.methods
      .quoteCreateOffer(Array.from(seller.publicKey.toBytes()), params, false)
      .accounts({
        otcConfig,
        srcTokenMint,
        peer,
        enforcedOptions,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const response = await simulateTransaction(
      this.connection,
      [ix],
      this.program.programId,
      seller.publicKey,
      COMMITMENT,
    );

    return quoteCreateOfferBeet.read(response, 0);
  }

  async createOffer(
    params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"],
    messagingFee: MessagingFee,
    seller: Keypair,
    srcTokenMint: PublicKey | null = null, // required for src spl token
  ): Promise<[PublicKey, number[]]> {
    const srcEid = EndpointId.SOLANA_V2_TESTNET;
    const crosschain = params.dstEid !== srcEid;

    const otcConfig = this.deriver.config();
    const escrow = this.deriver.escrow();
    const offerPromise = OtcTools.getOfferFromParams(
      this.program,
      Array.from(seller.publicKey.toBytes()),
      srcEid,
      params.dstEid,
      srcTokenMint
        ? Array.from(srcTokenMint.toBytes())
        : Array.from(PublicKey.default.toBytes()),
      params.dstTokenAddress,
      params.exchangeRateSd,
    );

    const [srcEscrowAtaPromise, srcSellerAtaPromise] = srcTokenMint
      ? [
          getOrCreateAssociatedTokenAccount(
            this.connection,
            seller,
            srcTokenMint,
            escrow,
            true,
          ).then((account) => account.address),
          getOrCreateAssociatedTokenAccount(
            this.connection,
            seller,
            srcTokenMint,
            seller.publicKey,
          ).then((account) => account.address),
        ]
      : [Promise.resolve(null), Promise.resolve(null)];

    const [offer, srcEscrowAta, srcSellerAta] = await Promise.all([
      offerPromise,
      srcEscrowAtaPromise,
      srcSellerAtaPromise,
    ]);

    const [peer, enforcedOptions, remainingAccounts] = crosschain
      ? [
          this.deriver.peer(params.dstEid),
          this.deriver.enforcedOptions(params.dstEid),
          await this.endpoint.getSendIXAccountMetaForCPI(
            this.connection,
            seller.publicKey,
            {
              dstEid: params.dstEid,
              srcEid,
              sender: hexlify(otcConfig.toBytes()),
              receiver: PEER,
            },
            new UlnProgram.Uln(
              (
                await this.endpoint.getSendLibrary(
                  this.connection,
                  otcConfig,
                  params.dstEid,
                )
              ).programId,
            ),
          ),
        ]
      : [null, null, []];

    const createIx = await this.program.methods
      .createOffer(params, messagingFee)
      .accounts({
        seller: seller.publicKey,
        offer: offer[0],
        otcConfig,
        escrow,
        srcTokenMint, // required for src spl token
        srcSellerAta, // required for src spl token
        srcEscrowAta, // required for src spl token
        peer, // required for cross chain offer
        enforcedOptions, // required for cross chain offer
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const setComputeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1000000,
    });

    const tx = await V0TransactionTools.createV0Transaction(
      this.connection,
      seller.publicKey,
      [setComputeLimitIx, createIx],
      undefined,
      COMMITMENT,
    );

    const signature = await V0TransactionTools.sendAndConfirmV0Transaction(
      this.connection,
      tx,
      [seller],
      COMMITMENT,
    );

    console.log("Create offer tx signature: ", signature);

    return offer;
  }

  async quoteAcceptOffer(
    params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"],
    buyer: Keypair, // dst buyer with regards to offer
  ): Promise<[anchor.IdlTypes<OtcMarket>["AcceptOfferReceipt"], MessagingFee]> {
    const buyerBalance = await this.connection.getBalance(buyer.publicKey);
    assert(buyerBalance > 0, "Buyer balance should be non zero");

    const offerAddress = PublicKey.findProgramAddressSync(
      [Buffer.from(params.offerId)],
      this.program.programId,
    )[0];
    const offerAccount = await this.program.account.offer.fetch(offerAddress);

    const dstEid = offerAccount.srcEid; // dst with regards to this otc
    const srcEid = offerAccount.dstEid; // src with regards to this otc

    const dstToken = offerAccount.dstTokenAddress;
    const dstTokenMint = isNativeToken(dstToken)
      ? null
      : new PublicKey(dstToken);

    const crosschain = offerAccount.srcEid !== offerAccount.dstEid;

    const otcConfig = this.deriver.config();

    const [peer, enforcedOptions, remainingAccounts] = crosschain
      ? [
          this.deriver.peer(dstEid),
          this.deriver.enforcedOptions(dstEid),
          await this.endpoint.getQuoteIXAccountMetaForCPI(
            this.connection,
            buyer.publicKey,
            {
              dstEid: dstEid,
              srcEid: srcEid,
              sender: hexlify(otcConfig.toBytes()),
              receiver: PEER,
            },
            new UlnProgram.Uln(
              (
                await this.endpoint.getSendLibrary(
                  this.connection,
                  otcConfig,
                  dstEid,
                )
              ).programId,
            ),
          ),
        ]
      : [null, null, []];

    const ix = await this.program.methods
      .quoteAcceptOffer(Array.from(buyer.publicKey.toBytes()), params, false)
      .accounts({
        otcConfig: otcConfig,
        offer: offerAddress,
        dstTokenMint,
        peer: peer,
        enforcedOptions: enforcedOptions,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const response = await simulateTransaction(
      this.connection,
      [ix],
      this.program.programId,
      buyer.publicKey,
      COMMITMENT,
    );

    return quoteAcceptOfferBeet.read(response, 0);
  }

  async acceptOffer(
    params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"],
    buyer: Keypair, // dst buyer with regards to offer
    fee: MessagingFee,
  ) {
    const buyerBalance = await this.connection.getBalance(buyer.publicKey);
    assert(buyerBalance > 0, "Buyer balance should be non zero");

    const offerAddress = PublicKey.findProgramAddressSync(
      [Buffer.from(params.offerId)],
      this.program.programId,
    )[0];
    const offerAccount = await this.program.account.offer.fetch(offerAddress);

    const dstEid = offerAccount.srcEid; // dst with regards to this otc
    const srcEid = offerAccount.dstEid; // src with regards to this otc

    const dstToken = offerAccount.dstTokenAddress;
    const dstTokenMint = isNativeToken(dstToken)
      ? null
      : new PublicKey(dstToken);

    const crosschain = offerAccount.srcEid !== offerAccount.dstEid;

    const otcConfig = this.deriver.config();
    const treasury = Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey;

    const [peer, enforcedOptions, remainingAccounts] = crosschain
      ? [
          this.deriver.peer(dstEid),
          this.deriver.enforcedOptions(dstEid),
          await this.endpoint.getSendIXAccountMetaForCPI(
            this.connection,
            buyer.publicKey,
            {
              dstEid: dstEid,
              srcEid: srcEid,
              sender: hexlify(otcConfig.toBytes()),
              receiver: PEER,
            },
            new UlnProgram.Uln(
              (
                await this.endpoint.getSendLibrary(
                  this.connection,
                  otcConfig,
                  dstEid,
                )
              ).programId,
            ),
          ),
        ]
      : [null, null, []];

    // const addresses = [
    //   //  buyer.publicKey,
    //   //  otcConfig,
    //   //  offerAddress,

    //   //  this.payer.publicKey,

    //   //  treasury,
    //   peer,
    //   enforcedOptions,
    // ];

    // const lookupTableAddress = await V0TransactionTools.createLookUpTable(
    //   this.connection,
    //   buyer,
    //   addresses,
    //   remainingAccounts,
    // );

    // // await OtcTools.extendLookUpTable(
    // //   this.connection,
    // //   lookupTableAddress,
    // //   remainingAccounts.map((account) => account.pubkey),
    // //   buyer,
    // // );

    // await V0TransactionTools.waitForNewBlock(this.connection, 1);

    // const lookupTableAccount = (
    //   await this.connection.getAddressLookupTable(lookupTableAddress)
    // ).value;

    // if (!lookupTableAccount) {
    //   throw new Error("Lookup table not found");
    // }

    const acceptIx = await this.program.methods
      .acceptOffer(params, fee)
      // TODO: fix accounts
      .accounts({
        buyer: buyer.publicKey,
        otcConfig,
        offer: offerAddress,
        // src token
        srcBuyerAta: null,
        srcEscrowAta: null,
        escrow: this.deriver.escrow(),
        srcTokenMint: null,
        // dst token
        dstBuyerAta: null,
        dstSeller: new PublicKey(offerAccount.dstSellerAddress),
        dstSellerAta: null,
        dstTreasuryAta: null,
        treasury,
        dstTokenMint: null,
        // crosschain
        peer,
        enforcedOptions,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const setComputeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1000000,
    });

    const addresses = acceptIx.keys.map((key) => key.pubkey);

    const lookUpTableAddress = await V0TransactionTools.createLookupTable(
      this.connection,
      buyer,
    );
    console.log("look up table address: ", lookUpTableAddress);

    // First batch: 16 addresses (from index 0 to 15)
    await V0TransactionTools.extendLookUpTable(
      this.connection,
      buyer,
      lookUpTableAddress,
      addresses.slice(0, 16), // First 16 addresses
      COMMITMENT,
    );

    // Second batch: Next 16 addresses (from index 16 to 31)
    await V0TransactionTools.extendLookUpTable(
      this.connection,
      buyer,
      lookUpTableAddress,
      addresses.slice(16, 32), // Next 16 addresses
      COMMITMENT,
    );

    // Third batch: Last 14 addresses (from index 32 to 45)
    await V0TransactionTools.extendLookUpTable(
      this.connection,
      buyer,
      lookUpTableAddress,
      addresses.slice(32, 46), // Last 14 addresses
      COMMITMENT,
    );

    await V0TransactionTools.waitForNewBlock(this.connection, 1);

    const lookupTableAccount = (
      await this.connection.getAddressLookupTable(lookUpTableAddress)
    ).value;
    console.log("look up table account: ", lookupTableAccount);

    const tx = await V0TransactionTools.createV0Transaction(
      this.connection,
      buyer.publicKey,
      [setComputeLimitIx, acceptIx],
      [lookupTableAccount],
      COMMITMENT,
    );
    console.log("v0 tx: ", tx);

    const signature = await V0TransactionTools.sendAndConfirmV0Transaction(
      this.connection,
      tx,
      [buyer],
      COMMITMENT,
    );
    console.log("v0 signature: ", signature);
  }
}
