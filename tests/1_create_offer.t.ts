import * as anchor from "@coral-xyz/anchor";
import { expect, assert } from "chai";

import { PublicKey } from "@solana/web3.js";
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
  createSplOffer,
  CreateOfferParams,
  getOfferAccount,
} from "./helpers/create_offer";
import { initOtc } from "./helpers/init";
import {
  CREATE_OFFER_AMOUNTS,
  DST_EID,
  EXCHANGE_RATE_SD,
  LD_NATIVE,
  SD,
  SRC_EID,
  TOP_UP_AMOUNT,
} from "./helpers/constants";
import {
  getAssociatedTokenAddressSync,
  mintTo,
  transfer,
} from "@solana/spl-token";

describe("CreateOffer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  let accounts: Accounts;
  let srcSellerAddress: number[];
  let createOfferParams: CreateOfferParams;
  let offerAccount: PublicKey;

  before(async () => {
    accounts = await generateAccounts(
      connection,
      program.programId,
      wallet.payer,
    );

    // already inited in init test...
    // await initOtc(
    //   program,
    //   accounts.otcConfig,
    //   accounts.escrow,
    //   accounts.treasury,
    //   wallet.payer
    // );

    await topUp(accounts, connection, wallet.payer);

    assert(
      (await connection.getBalance(accounts.dstBuyer.publicKey)) ==
        TOP_UP_AMOUNT,
      "Top up failed",
    );

    srcSellerAddress = Array.from(accounts.srcSeller.publicKey.toBytes());

    createOfferParams = {
      dstSellerAddress: Array.from(accounts.dstSellerAta.toBytes()),
      dstEid: DST_EID,
      dstTokenAddress: Array.from(accounts.dstToken.toBytes()),
      srcAmountLd: new anchor.BN(CREATE_OFFER_AMOUNTS.srcAmountLdSpl),
      exchangeRateSd: new anchor.BN(EXCHANGE_RATE_SD),
    };

    ({ account: offerAccount } = await getOfferAccount(
      program,
      srcSellerAddress,
      SRC_EID,
      createOfferParams.dstEid,
      Array.from(accounts.srcToken.toBytes()),
      createOfferParams.dstTokenAddress,
      createOfferParams.exchangeRateSd,
    ));
  });

  it("should revert on invalid local decimals", async () => {
    const { mint: srcTokenMint } = await createMintAndAta(
      connection,
      wallet.payer,
      accounts.srcSeller.publicKey,
      4,
    );

    try {
      await program.methods
        .quoteCreateOffer(srcSellerAddress, createOfferParams)
        .accounts({
          otcConfig: accounts.otcConfig,
          srcTokenMint: srcTokenMint,
          escrow: accounts.escrow,
        })
        .view();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error.simulationResponse.logs).to.include(
        "Program log: AnchorError caused by account: src_token_mint. Error Code: InvalidLocalDecimals. Error Number: 6000. Error Message: InvalidLocalDecimals.",
      );
    }
  });

  it("should revert on invalid offer account", async () => {
    const fakeOfferId: Uint8Array = await program.methods
      .hashOffer(
        Array.from(PublicKey.default.toBytes()),
        SRC_EID,
        DST_EID,
        Array.from(accounts.srcToken.toBytes()),
        Array.from(accounts.dstToken.toBytes()),
        new anchor.BN(EXCHANGE_RATE_SD),
      )
      .view();

    const [fakeOffer, __] = PublicKey.findProgramAddressSync(
      [fakeOfferId],
      program.programId,
    );

    //    const escrowAta = getAssociatedTokenAddressSync(srcTokenMint, escrow, true);

    try {
      await program.methods
        .createOffer(createOfferParams)
        .accounts({
          seller: accounts.srcSeller.publicKey,
          offer: fakeOffer,
          otcConfig: accounts.otcConfig,
          srcTokenMint: accounts.srcToken,
          srcSellerAta: accounts.srcSellerAta,
          escrowAta: accounts.srcEscrowAta,
          escrow: accounts.escrow,
        })
        .signers([accounts.srcSeller])
        .rpc();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal(
        "ConstraintSeeds",
      );

      // expect(error.toString()).to.include(
      //   "Error: Invalid arguments: offer not provided."
      // );
    }
  });

  it("should revert on invalid escrow", async () => {
    try {
      const fakeTokenEscrow = getAssociatedTokenAddressSync(
        accounts.srcToken,
        accounts.srcSeller.publicKey,
        true,
      );

      await program.methods
        .createOffer(createOfferParams)
        .accounts({
          seller: accounts.srcSeller.publicKey,
          offer: offerAccount,
          otcConfig: accounts.otcConfig,
          srcTokenMint: accounts.srcToken,
          srcSellerAta: accounts.srcSellerAta,
          escrowAta: fakeTokenEscrow,
          escrow: accounts.escrow,
        })
        .signers([accounts.srcSeller])
        .rpc();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal(
        "ConstraintTokenOwner",
      );
    }

    try {
      await program.methods
        .createOffer(createOfferParams)
        .accounts({
          seller: accounts.srcSeller.publicKey,
          offer: offerAccount,
          otcConfig: accounts.otcConfig,
          srcTokenMint: accounts.srcToken,
          srcSellerAta: accounts.srcSellerAta,
          escrowAta: accounts.dstEscrowAta,
          escrow: accounts.escrow,
        })
        .signers([accounts.srcSeller])
        .rpc();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error).to.be.instanceOf(AnchorError);
      expect((error as AnchorError).error.errorCode.code).to.equal(
        "ConstraintTokenMint",
      );
    }
  });

  it("should revert on invalid otc config", async () => {
    const [otcConfig, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("FakeOtc")],
      program.programId,
    );

    try {
      await program.methods
        .quoteCreateOffer(srcSellerAddress, createOfferParams)
        .accounts({
          otcConfig: otcConfig,
          srcTokenMint: accounts.srcToken,
          escrow: accounts.escrow,
        })
        .view();

      assert(false, "should revert");
    } catch (error: any) {
      expect(error.simulationResponse.logs).to.include(
        "Program log: AnchorError caused by account: otc_config. Error Code: AccountNotInitialized. Error Number: 3012. Error Message: The program expected this account to be already initialized.",
      );
    }
  });

  it("should revert on invalid seller ata", async () => {
    const fakeSellerAtas = [
      getAssociatedTokenAddressSync(
        accounts.srcToken,
        accounts.dstSeller.publicKey,
        true,
      ),
      accounts.dstSellerAta,
    ];
    const errorCodes = ["AccountNotInitialized", "ConstraintTokenOwner"];

    for (const [index, fakeSellerAta] of fakeSellerAtas.entries()) {
      try {
        await program.methods
          .createOffer(createOfferParams)
          .accounts({
            seller: accounts.srcSeller.publicKey,
            offer: offerAccount,
            otcConfig: accounts.otcConfig,
            srcTokenMint: accounts.srcToken,
            srcSellerAta: fakeSellerAta,
            escrowAta: accounts.srcEscrowAta,
            escrow: accounts.escrow,
          })
          .signers([accounts.srcSeller])
          .rpc();

        assert(false, "should revert");
      } catch (error: any) {
        expect(error).to.be.instanceOf(AnchorError);
        expect((error as AnchorError).error.errorCode.code).to.equal(
          errorCodes[index],
        );
      }
    }
  });

  it("should create offer Spl", async () => {
    const { account: offerAccount, id: offerId } = await createSplOffer(
      program,
      connection,
      wallet.payer,
      accounts,
    );

    const createdOffer = await program.account.offer.fetch(offerAccount);

    assert(
      createdOffer.srcSellerAddress.toString() == srcSellerAddress.toString(),
      "srcSellerAddress",
    );
    assert(
      createdOffer.dstSellerAddress.toString() ==
        Array.from(accounts.dstSeller.publicKey.toBytes()).toString(),
      "dstSellerAddress",
    );
    assert(createdOffer.srcEid == Number(SRC_EID), "srcEid");
    assert(createdOffer.dstEid == Number(DST_EID), "dstEid");
    assert(
      createdOffer.srcTokenAddress.toString() ==
        Array.from(accounts.srcToken.toBytes()).toString(),
      "srcTokenAddress",
    );
    assert(
      createdOffer.dstTokenAddress.toString() ==
        Array.from(accounts.dstToken.toBytes()).toString(),
      "dstTokenAddress",
    );
    assert(
      createdOffer.srcAmountSd.toNumber() ==
        Number(CREATE_OFFER_AMOUNTS.srcAmountSd),
      "srcAmountSD",
    );
    assert(
      createdOffer.exchangeRateSd.toNumber() == Number(EXCHANGE_RATE_SD),
      "exchangeRate",
    );

    const escrowBalance = await getBalance(connection, accounts.srcEscrowAta);
    assert(
      escrowBalance == Number(CREATE_OFFER_AMOUNTS.srcAmountLdSpl),
      "escrow balance",
    );
  });

  it("should create native offer", async () => {
    const initialEscrowBalance = await connection.getBalance(accounts.escrow);

    const { account: offer } = await createNativeOffer(
      program,
      connection,
      wallet.payer,
      accounts,
    );

    const createdOffer = await program.account.offer.fetch(offer);

    assert(
      createdOffer.srcSellerAddress.toString() == srcSellerAddress.toString(),
      "srcSellerAddress",
    );
    assert(
      createdOffer.dstSellerAddress.toString() ==
        Array.from(accounts.dstSeller.publicKey.toBytes()).toString(),
      "dstSellerAddress",
    );
    assert(createdOffer.srcEid == Number(SRC_EID), "srcEid");
    assert(createdOffer.dstEid == Number(DST_EID), "dstEid");
    assert(
      createdOffer.srcTokenAddress.toString() ==
        Array.from(PublicKey.default.toBytes()).toString(),
      "srcTokenAddress",
    );
    assert(
      createdOffer.dstTokenAddress.toString() ==
        Array.from(PublicKey.default.toBytes()).toString(),
      "dstTokenAddress",
    );
    assert(
      createdOffer.srcAmountSd.toNumber() ==
        Number(CREATE_OFFER_AMOUNTS.srcAmountSd),
      "srcAmountSD",
    );
    assert(
      createdOffer.exchangeRateSd.toNumber() == Number(EXCHANGE_RATE_SD),
      "exchangeRate",
    );

    const escrowBalance = await connection.getBalance(accounts.escrow);
    const decimalsConversionrate = getDecimalsConversionRate(LD_NATIVE, SD);

    assert(
      escrowBalance - initialEscrowBalance ==
        Number(CREATE_OFFER_AMOUNTS.srcAmountLdNative),
      "escrow balance",
    );
  });
});
