import * as anchor from "@coral-xyz/anchor";
import { expect, assert, AssertionError } from "chai";

import { PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorError, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { createSplOffer, createNativeOffer } from "../helpers/create_offer";
import { Accounts, generateAccounts, topUp } from "../helpers/helper";
import { createMintAndAta } from "../helpers/spl";

type Offer = {
  type: 'monochain' | 'crosschain',
  srcToken: 'spl' | 'sol',
  dstToken: 'spl' | 'sol',
  id: number[],
  publicKey: PublicKey,
};

describe("CancelOffer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  const ENDPOINT_PROGRAM_ID =
    "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";
  const treasury = Keypair.generate().publicKey;

  let accounts: Accounts;
  let offers: Offer[] = [];

  before(async () => {
    // init otc

    accounts = await generateAccounts(
      connection,
      program.programId,
      wallet.payer
    );

    await program.methods
      .initialize({
        endpointProgram: new PublicKey(ENDPOINT_PROGRAM_ID),
        treasury: treasury,
      })
      .accounts({
        payer: wallet.publicKey,
        otcConfig: accounts.otcConfig,
        escrow: accounts.escrow,
      })
      .signers([wallet.payer])
      .rpc();

    await topUp(accounts, connection, wallet.payer);
  });

  beforeEach(async () => {
    // create offers

    const nativeOffer = await createNativeOffer(program, connection, wallet.payer, accounts);

    offers.push({
      type: 'monochain',
      srcToken: 'sol',
      dstToken: 'sol',
      id: nativeOffer.id as unknown as number[],
      publicKey: nativeOffer.account
    })
  });

  afterEach(async () => {
    // cancel offers

    for (const offer of offers.filter(
      (offer) => offer.srcToken === 'sol' && offer.type === 'monochain'
    )) {
      await program.methods
        .cancelOffer(offer.id)
        .accounts({
          seller: accounts.srcSeller.publicKey,
          otcConfig: accounts.otcConfig,
          offer: offer.publicKey,

          escrow: accounts.escrow,

          srcSellerAta: null,
          srcEscrowAta: null,
          srcTokenMint: null,
        })
        .signers([accounts.srcSeller])
        .rpc();
    }

    offers = [];
  })

  it("should revert on unexisting offer", async () => {
    const { ata: unexistingOffer } = await createMintAndAta(
      connection,
      wallet.payer,
      accounts.srcSeller.publicKey,
      6
    );


    try {
      await program.methods
        .cancelOffer(Array.from(unexistingOffer.toBytes()))
        .accounts({
          seller: accounts.srcSeller.publicKey,
          otcConfig: accounts.otcConfig,
          offer: unexistingOffer,

          escrow: accounts.escrow,

          srcSellerAta: null,
          srcEscrowAta: null,
          srcTokenMint: null,
        })
        .signers([accounts.srcSeller])
        .rpc();

      expect.fail("should revert");
    } catch (error: any) {
      if (error instanceof AssertionError) {
        throw error
      }
    }
  })

  it("should revert on invalid seller", async () => {
    for (const offer of offers.filter(
      (offer) => offer.srcToken === 'sol' && offer.type === 'monochain'
    )) {
      try {
        const invalidSeller = Keypair.generate();

        await program.methods
          .cancelOffer(offer.id)
          .accounts({
            seller: invalidSeller.publicKey,
            otcConfig: accounts.otcConfig,
            offer: offer.publicKey,

            escrow: accounts.escrow,

            srcSellerAta: null,
            srcEscrowAta: null,
            srcTokenMint: null,
          })
          .signers([invalidSeller])
          .rpc();

        expect.fail("should revert");
      } catch (error: any) {
        expect(error).to.be.instanceOf(AnchorError);
        expect((error as AnchorError).error.errorCode.code).to.equal(
          "OnlySeller"
        );
      }
    }
  })
});
