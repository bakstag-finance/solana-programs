import * as anchor from "@coral-xyz/anchor";

import { Keypair, PublicKey } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram,
  UlnProgram,
  simulateTransaction,
} from "@layerzerolabs/lz-solana-sdk-v2";
import {
  PacketPath,
  bytes32ToEthAddress,
} from "@layerzerolabs/lz-v2-utilities";
import { hexlify } from "ethers/lib/utils";

import { solanaToArbSepConfig as peer } from "./config/peer";
import { CreateOfferParams } from "../helpers/create_offer";
import {
  CREATE_OFFER_AMOUNTS,
  ENDPOINT_PROGRAM_ID,
  EXCHANGE_RATE_SD,
  TREASURY_SECRET_KEY,
} from "../helpers/constants";
import { quoteCreateOfferBeet } from "./utils/decode";
import { OtcPdaDeriver } from "./utils/otc_pda_deriver";

describe("Create Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = "confirmed";

  let accounts: {
    otcConfig: PublicKey;
    endpoint: PublicKey;
    treasury: PublicKey;
    escrow: PublicKey;
  };
  let endpoint: EndpointProgram.Endpoint;

  before(async () => {
    const otcPdaDeriver = new OtcPdaDeriver(programId);

    accounts = {
      otcConfig: otcPdaDeriver.config(),
      endpoint: new PublicKey(ENDPOINT_PROGRAM_ID),
      treasury: Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey,
      escrow: otcPdaDeriver.escrow(),
    };

    endpoint = new EndpointProgram.Endpoint(accounts.endpoint);
  });

  it("should quote create offer", async () => {
    const path: PacketPath = {
      dstEid: peer.to.eid,
      srcEid: 40168,
      sender: hexlify(accounts.otcConfig.toBytes()),
      receiver: bytes32ToEthAddress(peer.peerAddress),
    };

    const sendLib = new UlnProgram.Uln(
      (
        await endpoint.getSendLibrary(
          connection,
          accounts.otcConfig,
          peer.to.eid,
        )
      ).programId,
    );

    const createOfferParams: CreateOfferParams = {
      dstSellerAddress: Array.from(wallet.publicKey.toBytes()),
      dstEid: peer.to.eid,
      dstTokenAddress: Array.from(PublicKey.default.toBytes()),
      srcAmountLd: new anchor.BN(CREATE_OFFER_AMOUNTS.srcAmountLdNative),
      exchangeRateSd: new anchor.BN(EXCHANGE_RATE_SD),
    };

    const [peerAccount, _] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("Peer", "utf8"),
        accounts.otcConfig.toBytes(),
        new anchor.BN(peer.to.eid).toArrayLike(Buffer, "be", 4),
      ],
      programId,
    );

    const [enforcedOptions, __] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("EnforcedOptions", "utf8"),
        accounts.otcConfig.toBuffer(),
        new anchor.BN(peer.to.eid).toBuffer("be", 4),
      ],
      programId,
    );

    const srcSellerAddress = Array.from(wallet.publicKey.toBytes());

    const ix = await program.methods
      .quoteCreateOffer(srcSellerAddress, createOfferParams, false)
      .accounts({
        otcConfig: accounts.otcConfig,
        srcTokenMint: null,
        peer: peerAccount,
        enforcedOptions,
      })
      .remainingAccounts(
        await endpoint.getQuoteIXAccountMetaForCPI(
          connection,
          wallet.publicKey,
          path,
          sendLib,
        ),
      )
      .instruction();

    const response = await simulateTransaction(
      connection,
      [ix],
      programId,
      wallet.publicKey,
      commitment,
    );

    const parsed = quoteCreateOfferBeet.read(response, 0);

    console.log("offer id", parsed[0].offerId);
    console.log("src amount ld", parsed[0].srcAmountLd);

    console.log("native fee", parsed[1].nativeFee);
    console.log("lz token fee", parsed[1].lzTokenFee);
  });
});
