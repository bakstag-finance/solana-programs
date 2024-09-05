import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
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
import { quoteCreateOfferBeet } from "./utils/beet-decoder";
import { assert } from "chai";
import { OtcTools } from "./utils/otc-tools";
import { Otc } from "./utils/otc";
import {
  Amounts,
  ENDPOINT_PROGRAM_ID,
  ExchangeRates,
} from "./config/definitions";
import { EndpointId } from "@layerzerolabs/lz-definitions";

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
  };

  const endpoint = new EndpointProgram.Endpoint(
    new PublicKey(ENDPOINT_PROGRAM_ID),
  );
  const otc = new Otc(program, connection, wallet.payer);

  before(async () => {
    accounts = {
      otcConfig: otc.deriver.config(),
    };
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

    const params: CreateOfferParams = {
      dstSellerAddress: Array.from(wallet.publicKey.toBytes()),
      dstEid: peer.to.eid,
      dstTokenAddress: Array.from(PublicKey.default.toBytes()),
      srcAmountLd: new anchor.BN(Amounts.SOL),
      exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
    };

    const peerAccount = otc.deriver.peer(params.dstEid);
    const enforcedOptions = otc.deriver.enforcedOptions(params.dstEid);

    const srcSellerAddress = Array.from(wallet.publicKey.toBytes());

    const ix = await program.methods
      .quoteCreateOffer(srcSellerAddress, params, false)
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

    const offer = await OtcTools.getOfferFromParams(
      program,
      srcSellerAddress,
      EndpointId.SOLANA_V2_TESTNET,
      params.dstEid,
      Array.from(PublicKey.default.toBytes()),
      params.dstTokenAddress,
      params.exchangeRateSd,
    );

    assert(
      parsed[0].offerId.toString() == offer[1].toString(),
      "src seller address",
    );
    assert(
      parsed[0].srcAmountLd.toNumber() == params.srcAmountLd.toNumber(),
      "src amount ld",
    );
    assert(parsed[1].nativeFee.toNumber() > 0, "native fee");
    assert(parsed[1].lzTokenFee.toNumber() == 0, "lz token fee");
  });
});
