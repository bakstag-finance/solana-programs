import * as anchor from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import {
  OftTools,
  simulateTransaction,
  UlnProgram,
} from "@layerzerolabs/lz-solana-sdk-v2";
import { quoteAcceptOfferBeet } from "./utils/beet-decoder";
import { Otc } from "./utils/otc";
import { OtcTools } from "./utils/otc-tools";
import {
  AmountsLD,
  COMMITMENT,
  PEER,
  SOLANA_EID,
  Token,
  TREASURY_SECRET_KEY,
} from "./config/constants";
import { assert } from "chai";
import { ACCEPT_OFFER_AMOUNTS } from "../helpers/constants";
import { hexlify } from "ethers/lib/utils";

import { getRemainings } from "./utils/transfer";
import { solanaToArbSepConfig } from "./config/peer";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";
import { topUp } from "../helpers/helper";
import { V0TransactionTools } from "./utils/v0-transaction-tools";
import { AccountTools } from "./utils/account-tools";

describe("Accept Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = "confirmed";

  let accounts: {
    treasury: PublicKey;
    otcConfig: PublicKey;
    seller: Keypair;
    buyer: Keypair;
    offer: [PublicKey, number[]];
  };
  const otc = new Otc(program, connection, wallet.payer);

  before(async () => {
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    await AccountTools.topUpAccounts(otc, seller, buyer);
    const offer = await OtcTools.createOffer(otc, seller);
    accounts = {
      treasury: Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey,
      otcConfig: otc.deriver.config(),
      seller,
      buyer,
      offer,
    };
  });
  after(async () => {
    await getRemainings(
      connection,
      [accounts.seller, accounts.buyer],
      wallet.publicKey,
    );
  });

  describe("Quote Accept Offer", () => {
    it("should quote accept monochain sol-sol offer", async () => {
      const offer = await program.account.offer.fetch(accounts.offer[0]);
      const buyer = Array.from(accounts.buyer.publicKey.toBytes());
      const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
        offerId: accounts.offer[1],
        srcAmountSd: offer.srcAmountSd,
        srcBuyerAddress: buyer,
      };
      const parsed = await otc.quoteAcceptOffer(params, accounts.buyer);
      assert(parsed[0].dstAmountLd.toNumber() == AmountsLD.SOL, "dstAmount");
      assert(
        parsed[0].feeLd.toNumber() == AmountsLD.SOL / 100,
        "protocol fee amount",
      );
      assert(parsed[1].nativeFee.toNumber() == 0, "native fee, monochain");
      assert(parsed[1].lzTokenFee.toNumber() == 0, "lz token fee");
    });
    it("should quote accept cross chain offer", async () => {
      const offerId =
        "f9532dd755d15dee3e6b5cec2af4b20fe2f995e6741dc48b19d6846ac7875562";
      const srcBuyerAddress = "C37713ef41Aff1A7ac1c3D02f6f0B3a57F8A3091";
      const offerAddress = PublicKey.findProgramAddressSync(
        [Buffer.from(offerId, "hex")],
        program.programId,
      )[0];
      const offerAccount = await program.account.offer.fetch(offerAddress);
      const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
        offerId: Array.from(Buffer.from(offerId, "hex")),
        srcAmountSd: offerAccount.srcAmountSd,
        srcBuyerAddress: Array.from(Buffer.from(srcBuyerAddress, "hex")),
      };
      const parsed = await otc.quoteAcceptOffer(params, accounts.buyer);
      const dstAmount = parsed[0].dstAmountLd.toNumber();
      assert(
        parsed[0].feeLd.toNumber() == dstAmount / 100,
        "protocol fee amount",
      );
      assert(parsed[1].nativeFee.toNumber() > 0, "native fee");
      assert(parsed[1].lzTokenFee.toNumber() == 0, "lz token fee");
    });
    it("should create lookup table ", async () => {
      console.log(await connection.getBalance(wallet.publicKey));
      const addrs = [
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ];
      const tableAddr = await V0TransactionTools.createLookUpTable(
        connection,
        wallet.payer,
        addrs,
      );
      console.log(await connection.getBalance(wallet.publicKey));
      await V0TransactionTools.waitForNewBlock(connection, 2);
      await V0TransactionTools.deactivateLookUpTable(
        connection,
        tableAddr,
        wallet.payer,
      );
      console.log(await connection.getBalance(wallet.publicKey));
      await V0TransactionTools.waitForNewBlock(connection, 2);
      await V0TransactionTools.closeLookUpTable(
        connection,
        tableAddr,
        wallet.payer,
      );
      console.log(await connection.getBalance(wallet.publicKey));
    });
    it("should accept crosschain offer", async () => {
      const offerId =
        "f9532dd755d15dee3e6b5cec2af4b20fe2f995e6741dc48b19d6846ac7875562";
      const srcBuyerAddress = "C37713ef41Aff1A7ac1c3D02f6f0B3a57F8A3091";
      const offerAddress = PublicKey.findProgramAddressSync(
        [Buffer.from(offerId, "hex")],
        program.programId,
      )[0];
      const offerAccount = await program.account.offer.fetch(offerAddress);
      const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
        offerId: Array.from(Buffer.from(offerId, "hex")),
        srcAmountSd: offerAccount.srcAmountSd,
        srcBuyerAddress: Array.from(Buffer.from(srcBuyerAddress, "hex")),
      };
      const parsed = await otc.quoteAcceptOffer(params, accounts.buyer);

      const fee = parsed[1];

      await otc.acceptOffer(params, accounts.buyer, fee);
    });
  });
});
