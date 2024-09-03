import * as anchor from "@coral-xyz/anchor";

import {
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram,
  OftTools,
  SetConfigType,
  UlnProgram,
} from "@layerzerolabs/lz-solana-sdk-v2";
import {
  Options,
  PacketPath,
  bytes32ToEthAddress,
  addressToBytes32,
} from "@layerzerolabs/lz-v2-utilities";
import { hexlify } from "ethers/lib/utils";

import { solanaToArbSepConfig as peer } from "./config";
import { Accounts, genAccounts } from "../helpers/helper";
import { CreateOfferParams } from "../helpers/create_offer";
import { CREATE_OFFER_AMOUNTS, EXCHANGE_RATE_SD } from "../helpers/constants";

function extractAndDecodeReturnData(logs: string[], programId: string): any {
  // Find the log that corresponds to the program's return value
  const returnLog = logs.find((log) =>
    log.startsWith(`Program return: ${programId}`)
  );

  if (!returnLog) {
    throw new Error("Return data not found in logs");
  }

  // Extract the base64 encoded return value
  // console.log(returnLog);
  const base64Data = returnLog.split(" ");
  // console.log(base64Data);
  const buffer = Buffer.from(base64Data[3], "base64");

  return buffer;
}

describe("Create Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = "confirmed";

  let accounts: Accounts;
  let endpoint: EndpointProgram.Endpoint;

  before(async () => {
    accounts = await genAccounts(connection, program.programId, wallet.payer);
    endpoint = new EndpointProgram.Endpoint(accounts.endpoint);

    // console.log(
    //   "Solana Peer: ",
    //   hexlify(addressToBytes32(programId.toBase58()))
    // );
    // console.log("Arbitrum Peer: ", hexlify(peer.peerAddress));
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
          peer.to.eid
        )
      ).programId
    );
    const createOfferParams: CreateOfferParams = {
      dstSellerAddress: Array.from(wallet.publicKey.toBytes()),
      dstEid: peer.to.eid,
      dstTokenAddress: Array.from(PublicKey.default.toBytes()),
      srcAmountLd: new anchor.BN(CREATE_OFFER_AMOUNTS.srcAmountLdNative),
      exchangeRateSd: new anchor.BN(EXCHANGE_RATE_SD),
    };
    // const quoteParams: anchor.IdlTypes<OtcMarket>["QuoteParams"] = {
    //   dstEid: peer.to.eid,
    //   options: Buffer.from(
    //     Options.newOptions().addExecutorLzReceiveOption(0, 0).toBytes()
    //   ),
    //   to: Array.from(peer.peerAddress),
    //   composeMsg: null,
    //   payInLzToken: false,
    // };
    const [peerAccount, _] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("Peer", "utf8"),
        accounts.otcConfig.toBytes(),
        new anchor.BN(peer.to.eid).toArrayLike(Buffer, "be", 4),
      ],
      programId
    );
    const [enforcedOptions, __] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("EnforcedOptions", "utf8"),
        accounts.otcConfig.toBuffer(),
        new anchor.BN(peer.to.eid).toBuffer("be", 4),
      ],
      programId
    );
    const srcSellerAddress = Array.from(wallet.publicKey.toBytes());

    const response = await program.methods
      .quoteCreateOffer(srcSellerAddress, createOfferParams)
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
          sendLib
        )
      )
      .simulate();
    const returnedData = extractAndDecodeReturnData(
      [...response.raw],
      program.programId.toString()
    );
    console.log(returnedData);
  });
});
