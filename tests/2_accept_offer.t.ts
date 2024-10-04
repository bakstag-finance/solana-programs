import * as anchor from "@coral-xyz/anchor";
import { expect, assert } from "chai";

import { PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorError, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../target/types/otc_market";

import { createMintAndAta, getBalance } from "./helpers/spl";
import { getDecimalsConversionRate, ld2sd } from "./helpers/otc";

import {
  Accounts,
  generateAccounts,
  topUp,
  transferSol,
} from "./helpers/helper";
import {
  createNativeOffer,
  createOffer,
  CreateOfferParams,
  createSplOffer,
  getOfferAccount,
} from "./helpers/create_offer";
import { AcceptOfferParams } from "./helpers/accept_offer";
import { initOtc } from "./helpers/init";
import {
  ACCEPT_OFFER_AMOUNTS,
  CREATE_OFFER_AMOUNTS,
  DST_EID,
  EXCHANGE_RATE_SD,
  SRC_EID,
  TOP_UP_AMOUNT,
} from "./helpers/constants";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

describe("AcceptOffer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  let accounts: Accounts;
  let nativeOffer: PublicKey;
  let nativeOfferId: number[];
  let srcSellerAddress: number[];
  let acceptNativeOfferParams: AcceptOfferParams;

  let splOfferId: number[];
  let splOffer: PublicKey;
  let acceptSplOfferParams: AcceptOfferParams;

  before(async () => {
    accounts = await generateAccounts(
      connection,
      program.programId,
      wallet.payer,
    );

    await topUp(accounts, connection, wallet.payer);

    assert(
      (await connection.getBalance(accounts.dstBuyer.publicKey)) ==
        TOP_UP_AMOUNT,
      "Top up failed",
    );
    srcSellerAddress = Array.from(wallet.publicKey.toBytes());

    const { account: _nativeOffer, id: _nativeOfferId } =
      await createNativeOffer(program, connection, wallet.payer, accounts);
    nativeOfferId = Array.from(_nativeOfferId);
    nativeOffer = _nativeOffer;

    const { account: _splOffer, id: _splOfferId } = await createSplOffer(
      program,
      connection,
      wallet.payer,
      accounts,
    );
    splOfferId = Array.from(_splOfferId);
    splOffer = _splOffer;

    acceptNativeOfferParams = {
      offerId: nativeOfferId,
      srcAmountSd: new anchor.BN(ACCEPT_OFFER_AMOUNTS.srcAmountSd),
      srcBuyerAddress: Array.from(accounts.srcBuyer.publicKey.toBytes()),
    };
    acceptSplOfferParams = {
      offerId: splOfferId,
      srcAmountSd: new anchor.BN(ACCEPT_OFFER_AMOUNTS.srcAmountSd),
      srcBuyerAddress: Array.from(accounts.srcBuyer.publicKey.toBytes()),
    };
  });

  it("should revert on Exesive amount", async () => {
    const params: AcceptOfferParams = {
      offerId: splOfferId,
      srcAmountSd: new anchor.BN(ACCEPT_OFFER_AMOUNTS.srcAmountSd * 10),
      srcBuyerAddress: Array.from(accounts.srcBuyerAta.toBytes()),
    };
    try {
      await program.methods
        .quoteAcceptOffer(
          Array.from(accounts.dstBuyer.publicKey.toBytes()),
          params,
        )
        .accounts({
          otcConfig: accounts.otcConfig,
          offer: splOffer,
          dstTokenMint: accounts.dstToken,
        })
        .view();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error.simulationResponse.logs[1]).to.be.equal(
        "Program log: Instruction: QuoteAcceptOffer",
      );
    }
  });

  it("should revert on InvalidLocalDecimals", async () => {
    const { mint: dstToken } = await createMintAndAta(
      connection,
      wallet.payer,
      accounts.srcSeller.publicKey,
      4,
    );
    const offerInfo = await createOffer(
      program,
      connection,
      wallet.payer,
      accounts,
      {
        srcSellerAddress: Array.from(accounts.srcSeller.publicKey.toBytes()),
        dstSellerAddress: Array.from(accounts.dstSeller.publicKey.toBytes()),
        srcEid: SRC_EID,
        dstEid: DST_EID,
        srcTokenAddress: Array.from(accounts.srcToken.toBytes()),
        dstTokenAddress: Array.from(dstToken.toBytes()),
        srcAmountLd: new anchor.BN(CREATE_OFFER_AMOUNTS.srcAmountLdSpl),
        exchangeRateSd: new anchor.BN(EXCHANGE_RATE_SD),
      },
    );
    const params: AcceptOfferParams = {
      offerId: Array.from(offerInfo.id),
      srcAmountSd: new anchor.BN(ACCEPT_OFFER_AMOUNTS.srcAmountSd),
      srcBuyerAddress: Array.from(accounts.srcBuyer.publicKey.toBytes()),
    };
    try {
      await program.methods
        .quoteAcceptOffer(
          Array.from(accounts.dstBuyer.publicKey.toBytes()),
          params,
        )
        .accounts({
          otcConfig: accounts.otcConfig,
          offer: offerInfo.account,
          dstTokenMint: dstToken,
        })
        .view();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error.simulationResponse.logs).to.include(
        "Program log: AnchorError caused by account: dst_token_mint. Error Code: InvalidLocalDecimals. Error Number: 6000. Error Message: InvalidLocalDecimals.",
      );
    }
  });

  it("should revert on InvalidDstSeller", async () => {
    const invalidDstSellers: PublicKey[] = [Keypair.generate().publicKey];

    for (const invalidDstSeller of invalidDstSellers) {
      try {
        // accept native offer
        await program.methods
          .acceptOffer(acceptNativeOfferParams)
          .accounts({
            buyer: accounts.dstBuyer.publicKey,
            otcConfig: accounts.otcConfig,
            offer: nativeOffer,
            dstBuyerAta: null,
            dstSellerAta: null,
            dstSeller: invalidDstSeller,
            dstTreasuryAta: null,
            treasury: accounts.treasury,
            dstTokenMint: null,
            srcBuyerAta: null,
            escrow: accounts.escrow,
            srcEscrowAta: null,
            srcTokenMint: null,
          })
          .signers([accounts.dstBuyer])
          .rpc();

        assert(false, "should revert");
      } catch (error: any) {
        expect(error).to.be.instanceOf(AnchorError);
        expect((error as AnchorError).error.errorCode.code).to.equal(
          "InvalidDstSeller",
        );
      }
    }
  });

  it("should revert on InvalidOffer", async () => {
    const invalidOffers: PublicKey[] = [splOffer];

    for (const invalidOffer of invalidOffers) {
      try {
        // accept native offer
        await program.methods
          .acceptOffer(acceptNativeOfferParams)
          .accounts({
            buyer: accounts.dstBuyer.publicKey,
            otcConfig: accounts.otcConfig,
            offer: invalidOffer,
            dstBuyerAta: null,
            dstSellerAta: null,
            dstSeller: accounts.dstSeller.publicKey,
            dstTreasuryAta: null,
            treasury: accounts.treasury,
            dstTokenMint: null,
            srcBuyerAta: null,
            escrow: accounts.escrow,
            srcEscrowAta: null,
            srcTokenMint: null,
          })
          .signers([accounts.dstBuyer])
          .rpc();

        assert(false, "should revert");
      } catch (error: any) {
        expect(error).to.be.instanceOf(AnchorError);
        expect((error as AnchorError).error.errorCode.code).to.equal(
          "ConstraintSeeds",
        );
      }
    }
  });

  it("should revert on InvalidTreasury", async () => {
    const invalidTreasuries: PublicKey[] = [Keypair.generate().publicKey];

    for (const invalidTreasury of invalidTreasuries) {
      try {
        // accept native offer
        await program.methods
          .acceptOffer(acceptNativeOfferParams)
          .accounts({
            buyer: accounts.dstBuyer.publicKey,
            otcConfig: accounts.otcConfig,
            offer: nativeOffer,
            dstBuyerAta: null,
            dstSellerAta: null,
            dstSeller: accounts.dstSeller.publicKey,
            dstTreasuryAta: null,
            treasury: invalidTreasury,
            dstTokenMint: null,
            srcBuyerAta: null,
            escrow: accounts.escrow,
            srcEscrowAta: null,
            srcTokenMint: null,
          })
          .signers([accounts.dstBuyer])
          .rpc();

        assert(false, "should revert");
      } catch (error: any) {
        expect(error).to.be.instanceOf(AnchorError);
        expect((error as AnchorError).error.errorCode.code).to.equal(
          "InvalidTreasury",
        );
      }
    }
  });

  it("should revert on InvalidDstTokenMint", async () => {
    const invalidDstToken = await createMint(
      connection,
      wallet.payer,
      accounts.dstSeller.publicKey,
      null,
      6,
    );

    const invalidDstAtas = await Promise.all([
      getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        invalidDstToken,
        accounts.dstBuyer.publicKey,
      ),
      getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        invalidDstToken,
        accounts.dstSeller.publicKey,
      ),
      getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        invalidDstToken,
        accounts.treasury,
      ),
    ]);

    try {
      // accept native offer
      await program.methods
        .acceptOffer(acceptSplOfferParams)
        .accounts({
          buyer: accounts.dstBuyer.publicKey,
          otcConfig: accounts.otcConfig,
          offer: splOffer,
          dstBuyerAta: invalidDstAtas[0].address,
          dstSellerAta: invalidDstAtas[1].address,
          dstSeller: accounts.dstSeller.publicKey,
          dstTreasuryAta: invalidDstAtas[2].address,
          treasury: accounts.treasury,
          dstTokenMint: invalidDstToken,
          srcBuyerAta: accounts.srcBuyerAta,
          escrow: accounts.escrow,
          srcEscrowAta: accounts.srcEscrowAta,
          srcTokenMint: accounts.srcToken,
        })
        .signers([accounts.dstBuyer])
        .rpc();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal(
        "InvalidDstTokenMint",
      );
    }
  });

  it("should revert on InvalidSrcTokenMint", async () => {
    const invalidSrcToken = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6,
    );

    const invalidSrcAtas = await Promise.all([
      getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        invalidSrcToken,
        accounts.dstBuyer.publicKey,
      ),
      getOrCreateAssociatedTokenAccount(
        connection,
        wallet.payer,
        invalidSrcToken,
        accounts.escrow,
        true,
      ),
    ]);

    try {
      await program.methods
        .acceptOffer(acceptSplOfferParams)
        .accounts({
          buyer: accounts.dstBuyer.publicKey,
          otcConfig: accounts.otcConfig,
          offer: splOffer,
          dstBuyerAta: accounts.dstBuyerAta,
          dstSellerAta: accounts.dstSellerAta,
          dstSeller: accounts.dstSeller.publicKey,
          dstTreasuryAta: accounts.dstTreasuryAta,
          treasury: accounts.treasury,
          dstTokenMint: accounts.dstToken,
          srcBuyerAta: invalidSrcAtas[0].address,
          escrow: accounts.escrow,
          srcEscrowAta: invalidSrcAtas[1].address,
          srcTokenMint: invalidSrcToken,
        })
        .signers([accounts.dstBuyer])
        .rpc();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal(
        "InvalidSrcTokenMint",
      );
    }
  });

  it("should accept offer Spl", async () => {
    await mintTo(
      connection,
      wallet.payer,
      accounts.dstToken,
      accounts.dstBuyerAta,
      wallet.payer.publicKey,
      ACCEPT_OFFER_AMOUNTS.dstAmountLdSpl,
    );

    const initialEscrowSrcBalance = await getBalance(
      connection,
      accounts.srcEscrowAta,
    );
    const initialBuyerDstBalance = await getBalance(
      connection,
      accounts.dstBuyerAta,
    );
    const initialTreasuryDstBalance = await getBalance(
      connection,
      accounts.dstTreasuryAta,
    );

    const initialSellerDstBalance = await getBalance(
      connection,
      accounts.dstSellerAta,
    );
    const initialBuyerSrcBalance = await getBalance(
      connection,
      accounts.srcBuyerAta,
    );

    await program.methods
      .acceptOffer(acceptSplOfferParams)
      .accounts({
        buyer: accounts.dstBuyer.publicKey,
        otcConfig: accounts.otcConfig,
        offer: splOffer,
        dstBuyerAta: accounts.dstBuyerAta,
        dstSellerAta: accounts.dstSellerAta,
        dstSeller: accounts.dstSeller.publicKey,
        dstTreasuryAta: accounts.dstTreasuryAta,
        treasury: accounts.treasury,
        dstTokenMint: accounts.dstToken,
        srcBuyerAta: accounts.srcBuyerAta,
        escrow: accounts.escrow,
        srcEscrowAta: accounts.srcEscrowAta,
        srcTokenMint: accounts.srcToken,
      })
      .signers([accounts.dstBuyer])
      .rpc();

    const escrowSrcBalance = await getBalance(
      connection,
      accounts.srcEscrowAta,
    );

    const buyerDstBalance = await getBalance(connection, accounts.dstBuyerAta);
    const sellerDstBalance = await getBalance(
      connection,
      accounts.dstSellerAta,
    );
    const treasuryDstBalance = await getBalance(
      connection,
      accounts.dstTreasuryAta,
    );
    const buyerSrcBalance = await getBalance(connection, accounts.srcBuyerAta);

    //check offer
    const acceptedOffer = await program.account.offer.fetch(splOffer);

    assert(
      Number(acceptedOffer.srcAmountSd) ==
        CREATE_OFFER_AMOUNTS.srcAmountSd - ACCEPT_OFFER_AMOUNTS.srcAmountSd,
      "remaining src amount",
    );

    // balances check
    assert(
      initialEscrowSrcBalance.valueOf() - escrowSrcBalance.valueOf() ==
        ACCEPT_OFFER_AMOUNTS.srcAmountLdSpl,
      "escrow balance",
    );

    // console.log(buyerSrcBalance - initialBuyerSrcBalance);
    // console.log(ACCEPT_OFFER_AMOUNTS.srcAmountLdNative);
    assert(
      buyerSrcBalance.valueOf() - initialBuyerSrcBalance.valueOf() ==
        ACCEPT_OFFER_AMOUNTS.srcAmountLdSpl,
      "src buyer balance",
    );

    assert(
      initialBuyerDstBalance.valueOf() - buyerDstBalance.valueOf() ==
        ACCEPT_OFFER_AMOUNTS.dstAmountLdSpl,
      "dst buyer balance",
    );

    assert(
      treasuryDstBalance.valueOf() - initialTreasuryDstBalance.valueOf() ==
        ACCEPT_OFFER_AMOUNTS.dstFeeAmountLdSpl,
      "treasuty balance",
    );

    assert(
      sellerDstBalance.valueOf() - initialSellerDstBalance.valueOf() ==
        ACCEPT_OFFER_AMOUNTS.dstAmountLdSpl -
          ACCEPT_OFFER_AMOUNTS.dstFeeAmountLdSpl,
      "seller dst balance",
    );
  });

  it("should accept offer Native", async () => {
    transferSol(
      connection,
      wallet.payer,
      accounts.dstBuyer.publicKey,
      ACCEPT_OFFER_AMOUNTS.dstAmountLdNative,
    );

    const initialEscrowSrcBalance = await connection.getBalance(
      accounts.escrow,
    );

    const initialBuyerDstBalance = await connection.getBalance(
      accounts.dstBuyer.publicKey,
    );
    const initialTreasuryDstBalance = await connection.getBalance(
      accounts.treasury,
    );

    const initialSellerDstBalance = await connection.getBalance(
      accounts.dstSeller.publicKey,
    );

    await program.methods
      .acceptOffer(acceptNativeOfferParams)
      .accounts({
        buyer: accounts.dstBuyer.publicKey,
        otcConfig: accounts.otcConfig,
        offer: nativeOffer,
        dstBuyerAta: null,
        dstSellerAta: null,
        dstSeller: accounts.dstSeller.publicKey,
        dstTreasuryAta: null,
        treasury: accounts.treasury,
        dstTokenMint: null,
        srcBuyerAta: null,
        escrow: accounts.escrow,
        srcEscrowAta: null,
        srcTokenMint: null,
      })
      .signers([accounts.dstBuyer])
      .rpc();

    const escrowSrcBalance = await connection.getBalance(accounts.escrow);

    const buyerDstBalance = await connection.getBalance(
      accounts.dstBuyer.publicKey,
    );
    const sellerDstBalance = await connection.getBalance(
      accounts.dstSeller.publicKey,
    );
    const treasuryDstBalance = await connection.getBalance(accounts.treasury);

    //check offer
    const acceptedOffer = await program.account.offer.fetch(nativeOffer);

    assert(
      Number(acceptedOffer.srcAmountSd) ==
        CREATE_OFFER_AMOUNTS.srcAmountSd - ACCEPT_OFFER_AMOUNTS.srcAmountSd,
      "remaining src amount",
    );

    // balances check

    assert(
      initialEscrowSrcBalance - escrowSrcBalance ==
        ACCEPT_OFFER_AMOUNTS.srcAmountLdNative,
      "escrow balance",
    );
    assert(
      treasuryDstBalance - initialTreasuryDstBalance ==
        ACCEPT_OFFER_AMOUNTS.dstFeeAmountLdNative,
    );

    assert(
      sellerDstBalance - initialSellerDstBalance ==
        ACCEPT_OFFER_AMOUNTS.dstAmountLdNative -
          ACCEPT_OFFER_AMOUNTS.dstFeeAmountLdNative,
    );
  });
});
