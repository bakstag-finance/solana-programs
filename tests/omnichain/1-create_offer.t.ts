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
import { quoteCreateOfferBeet } from "./utils/beet-decoder";
import { assert } from "chai";
import { OtcTools } from "./utils/otc-tools";
import { Otc } from "./utils/otc";
import {
  AmountsLD,
  ENDPOINT_PROGRAM_ID,
  ExchangeRates,
  SOLANA_EID,
  Token,
} from "./config/constants";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { SRC_EID } from "../helpers/constants";
import { transfer } from "@solana/spl-token";
import { generateAccounts, transferSol } from "../helpers/helper";
import { getRemainings } from "./utils/transfer";

describe("Create Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = "confirmed";

  let accounts: {
    seller: Keypair;
    otcConfig: PublicKey;
  };

  const endpoint = new EndpointProgram.Endpoint(
    new PublicKey(ENDPOINT_PROGRAM_ID),
  );
  const otc = new Otc(program, connection, wallet.payer);

  before(async () => {
    const sth = await OtcTools.generateAccounts(otc, Token.SOL);
    const seller = sth.seller;
    await OtcTools.topUpAccounts(otc, seller);
    accounts = {
      seller,
      otcConfig: otc.deriver.config(),
    };
  });
  after(async () => {
    await getRemainings(connection, [accounts.seller], wallet.publicKey);
  });

  it("should quote create offer", async () => {
    const params: CreateOfferParams = {
      dstSellerAddress: Array.from(accounts.seller.publicKey.toBytes()),
      dstEid: peer.to.eid,
      dstTokenAddress: Array.from(PublicKey.default.toBytes()),
      srcAmountLd: new anchor.BN(AmountsLD.SOL),
      exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
    };

    const sth = await otc.quoteCreateOffer(params, accounts.seller);
    const receipt = sth[0];
    const fee = sth[1];
    const offer = await OtcTools.getOfferFromParams(
      program,
      Array.from(accounts.seller.publicKey.toBytes()),
      EndpointId.SOLANA_V2_TESTNET,
      params.dstEid,
      Array.from(PublicKey.default.toBytes()),
      params.dstTokenAddress,
      params.exchangeRateSd,
    );

    assert(
      receipt.offerId.toString() == offer[1].toString(),
      "src seller address",
    );
    assert(
      receipt.srcAmountLd.toNumber() == params.srcAmountLd.toNumber(),
      "src amount ld",
    );
    assert(fee.nativeFee.toNumber() > 0, "native fee");
    assert(fee.lzTokenFee.toNumber() == 0, "lz token fee");
  });

  it("should create offer", async function () {
    const offer = await OtcTools.createOffer(otc, accounts.seller, {
      dstSeller: Array.from(accounts.seller.publicKey.toBytes()),
    });

    const fethched_offer = await program.account.offer.fetch(offer[0]);
    assert(
      fethched_offer.srcSellerAddress.toString() ==
        Array.from(accounts.seller.publicKey.toBytes()).toString(),
      "src seller address",
    );
    assert(
      fethched_offer.dstSellerAddress.toString() ==
        Array.from(accounts.seller.publicKey.toBytes()).toString(),
      "Dst buyer address",
    );
    //console.log(fethched_offer.dstEid);
    assert(fethched_offer.dstEid == 40231, "dst eid");
    assert(fethched_offer.srcEid == SOLANA_EID, "srcE eid");
  });
});
