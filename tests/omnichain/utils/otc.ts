import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
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
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
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
  SOLANA_EID,
  TREASURY_SECRET_KEY,
} from "../config/constants";
import { hexlify } from "ethers/lib/utils";
import {
  MessagingFee,
  quoteAcceptOfferBeet,
  quoteCreateOfferBeet,
} from "./beet-decoder";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";
import { assert } from "chai";
import { isNativeToken } from "./is_native_token";

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

    // const messagingFee = await this.quoteCreateOffer(
    //   params,
    //   seller,
    //   srcTokenMint,
    // );

    const create = await this.program.methods
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
      .transaction();
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
      create,
    );

    let { blockhash } = await this.connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: seller.publicKey, // Public key of the account that will pay for the transaction
      recentBlockhash: blockhash, // Latest blockhash
      instructions: tx.instructions, // Instructions included in transaction
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    transaction.sign([seller]);

    const transactionSignature =
      await this.connection.sendTransaction(transaction);

    const latestBlockhash = await this.connection.getLatestBlockhash();

    const confirmation = await this.connection.confirmTransaction(
      {
        signature: transactionSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      COMMITMENT,
    );

    console.log("Create offer tx signature:", transactionSignature);

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

    const dstNative =
      dstToken.toString() == Array.from(PublicKey.default.toBytes()).toString();

    const dstTokenMint = dstNative ? null : new PublicKey(dstToken);

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

    const addresses = [
      //  buyer.publicKey,
      //  otcConfig,
      //  offerAddress,

      //  this.payer.publicKey,

      //  treasury,
      peer,
      enforcedOptions,
    ];

    const lookupTableAddress = await OtcTools.createLookUpTable(
      this.connection,
      buyer,
      addresses,
      remainingAccounts,
    );

    // await OtcTools.extendLookUpTable(
    //   this.connection,
    //   lookupTableAddress,
    //   remainingAccounts.map((account) => account.pubkey),
    //   buyer,
    // );

    await OtcTools.waitForNewBlock(this.connection, 1);

    const lookupTableAccount = (
      await this.connection.getAddressLookupTable(lookupTableAddress)
    ).value;

    if (!lookupTableAccount) {
      throw new Error("Lookup table not found");
    }

    const acceptIx = await this.program.methods
      .acceptOffer(params, fee)
      .accounts({
        buyer: buyer.publicKey,
        otcConfig: otcConfig,
        offer: offerAddress,
        dstBuyerAta: null,
        dstSellerAta: null,
        dstSeller: this.payer.publicKey,
        dstTreasuryAta: null,
        treasury: treasury,
        dstTokenMint: null,
        srcBuyerAta: null,
        srcEscrowAta: null,
        escrow: null,
        srcTokenMint: null,
        peer: null,
        enforcedOptions: null,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
    // .signers([buyer])
    // .rpc();

    await OtcTools.sendV0Transaction(
      this.connection,
      buyer,
      [acceptIx],
      [lookupTableAccount],
    );
  }
}
