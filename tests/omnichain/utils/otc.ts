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
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { OtcPdaDeriver } from "./otc-pda-deriver";
import { OtcTools } from "./otc-tools";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import {
  EndpointProgram,
  simulateTransaction,
  UlnProgram,
} from "@layerzerolabs/lz-solana-sdk-v2";
import { COMMITMENT, ENDPOINT_PROGRAM_ID, PEER } from "../config/constants";
import { hexlify } from "ethers/lib/utils";
import { MessagingFee, quoteCreateOfferBeet } from "./beet-decoder";

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
}
