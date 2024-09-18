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
    offer: [PublicKey, number[]];
  };
  const otc = new Otc(program, connection, wallet.payer);

  before(async () => {
    const seller = Keypair.generate();
    await OtcTools.topUpAccounts(otc, seller);
    const offer = await OtcTools.createOffer(otc, seller);
    accounts = {
      treasury: Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey,
      otcConfig: otc.deriver.config(),
      seller,
      offer,
    };
  });
  after(async () => {
    await getRemainings(connection, [accounts.seller], wallet.publicKey);
  });

  describe("Quote Accept Offer", () => {
    it("should quote accept monochain sol-sol offer", async () => {
      const offer = await program.account.offer.fetch(accounts.offer[0]);

      const buyer = Array.from(Keypair.generate().publicKey.toBytes());
      const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
        offerId: accounts.offer[1],
        srcAmountSd: offer.srcAmountSd,
        srcBuyerAddress: buyer,
      };

      const ix = await program.methods
        .quoteAcceptOffer(buyer, params, false)
        .accounts({
          otcConfig: accounts.otcConfig,
          offer: accounts.offer[0],
          dstTokenMint: null,
          peer: null,
          enforcedOptions: null,
        })
        .instruction();
      const response = await simulateTransaction(
        connection,
        [ix],
        programId,
        wallet.publicKey,
        commitment,
      );

      const parsed = quoteAcceptOfferBeet.read(response, 0);
      assert(parsed[0].dstAmountLd.toNumber() == AmountsLD.SOL, "dstAmount");
      assert(
        parsed[0].feeLd.toNumber() == AmountsLD.SOL / 100,
        "protocol fee amount",
      );
      assert(parsed[1].nativeFee.toNumber() == 0, "native fee, monochain");
      assert(parsed[1].lzTokenFee.toNumber() == 0, "lz token fee");
    });

    it("should accept cross chain offer", async () => {
      const offerId =
        "82c664ebb2fee3a734f882b88391e755fd0f02a3d81ec86b41bbac8df92de623";

      const offerAddress = PublicKey.findProgramAddressSync(
        [Buffer.from(offerId, "hex")],
        program.programId,
      )[0];

      const offerAccount = await program.account.offer.fetch(offerAddress);
      const buyer = Array.from(addressToBytes32(wallet.publicKey.toBase58()));

      const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
        offerId: Array.from(Buffer.from(offerId, "hex")),
        srcAmountSd: offerAccount.srcAmountSd,
        srcBuyerAddress: buyer,
      };

      const dstEid = solanaToArbSepConfig.to.eid;

      const peerAccount = otc.deriver.peer(dstEid);
      const enforcedOptions = otc.deriver.enforcedOptions(dstEid);

      const quote_rem_accs = await otc.endpoint.getQuoteIXAccountMetaForCPI(
        connection,
        wallet.publicKey,
        {
          dstEid: dstEid,
          srcEid: SOLANA_EID,
          sender: hexlify(accounts.otcConfig.toBytes()),
          receiver: PEER,
        },
        new UlnProgram.Uln(
          (
            await otc.endpoint.getSendLibrary(
              otc.connection,
              accounts.otcConfig,
              dstEid,
            )
          ).programId,
        ),
      );

      const ix = await program.methods
        .quoteAcceptOffer(buyer, params, false)
        .accounts({
          otcConfig: accounts.otcConfig,
          offer: offerAddress,
          dstTokenMint: null,
          peer: peerAccount,
          enforcedOptions: enforcedOptions,
        })
        .remainingAccounts(quote_rem_accs)
        .instruction();

      const response = await simulateTransaction(
        connection,
        [ix],
        programId,
        wallet.publicKey,
        commitment,
      );

      const parsed = quoteAcceptOfferBeet.read(response, 0);

      const remainingAccounts = await otc.endpoint.getSendIXAccountMetaForCPI(
        connection,
        wallet.publicKey,
        {
          dstEid: dstEid,
          srcEid: SOLANA_EID,
          sender: hexlify(accounts.otcConfig.toBytes()),
          receiver: PEER,
        },
        new UlnProgram.Uln(
          (
            await otc.endpoint.getSendLibrary(
              otc.connection,
              accounts.otcConfig,
              dstEid,
            )
          ).programId,
        ),
      );

      const accept = await program.methods
        .acceptOffer(params, parsed[1])
        .accounts({
          buyer: wallet.publicKey,
          otcConfig: accounts.otcConfig,
          offer: offerAddress,
          dstBuyerAta: null,
          dstSellerAta: null,
          dstSeller: wallet.publicKey,
          dstTreasuryAta: null,
          treasury: accounts.treasury,
          escrow: otc.deriver.escrow(),
          srcEscrowAta: null,
          dstTokenMint: null,
          srcBuyerAta: null,
          srcTokenMint: null,
          peer: peerAccount,
          enforcedOptions: enforcedOptions,
        })
        .remainingAccounts(remainingAccounts)
        .transaction();

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
        accept,
      );

      let { blockhash } = await connection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: wallet.publicKey, // Public key of the account that will pay for the transaction
        recentBlockhash: blockhash, // Latest blockhash
        instructions: tx.instructions, // Instructions included in transaction
      }).compileToV0Message();

      const transaction = new VersionedTransaction(message);

      transaction.sign([wallet.payer]);

      const transactionSignature =
        await connection.sendTransaction(transaction);

      const latestBlockhash = await connection.getLatestBlockhash();

      const confirmation = await connection.confirmTransaction(
        {
          signature: transactionSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        COMMITMENT,
      );

      console.log("Create offer tx signature:", transactionSignature);
    });
  });
});
