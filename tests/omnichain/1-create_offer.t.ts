import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import { solanaToArbSepConfig as peer } from "./config/peer";
import { CreateOfferParams } from "../helpers/create_offer";
import { assert } from "chai";
import { OtcTools } from "./utils/otc-tools";
import { Otc } from "./utils/otc";
import { hexlify } from "ethers/lib/utils";

import {
  AmountsLD,
  ExchangeRates,
  SOLANA_EID,
  Token,
} from "./config/constants";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { AccountTools } from "./utils/account-tools";
import { addressToBytes32, Options } from "@layerzerolabs/lz-v2-utilities";

describe("Create Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  let accounts: {
    seller: Keypair;
    otcConfig: PublicKey;
  };

  const otc = new Otc(program, connection, wallet.payer);

  before(async () => {
    const sth = await AccountTools.generateAccounts(otc, Token.SOL);
    const seller = sth.seller;
    await AccountTools.topUpAccounts(otc, seller);
    accounts = {
      seller,
      otcConfig: otc.deriver.config(),
    };
  });
  after(async () => {
    await AccountTools.getRemainings(
      connection,
      [accounts.seller],
      wallet.publicKey,
    );
  });

  // it("should quote create offer", async () => {
  //   const params: CreateOfferParams = {
  //     dstSellerAddress: Array.from(accounts.seller.publicKey.toBytes()),
  //     dstEid: peer.to.eid,
  //     dstTokenAddress: Array.from(PublicKey.default.toBytes()),
  //     srcAmountLd: new anchor.BN(AmountsLD.SOL),
  //     exchangeRateSd: new anchor.BN(ExchangeRates.OneToOne),
  //   };

  //   const sth = await otc.quoteCreateOffer(params, accounts.seller);
  //   const receipt = sth[0];
  //   const fee = sth[1];
  //   const offer = await OtcTools.getOfferFromParams(
  //     program,
  //     Array.from(accounts.seller.publicKey.toBytes()),
  //     EndpointId.SOLANA_V2_TESTNET,
  //     params.dstEid,
  //     Array.from(PublicKey.default.toBytes()),
  //     params.dstTokenAddress,
  //     params.exchangeRateSd,
  //   );

  //   assert(
  //     receipt.offerId.toString() == offer[1].toString(),
  //     "src seller address",
  //   );
  //   assert(
  //     receipt.srcAmountLd.toNumber() == params.srcAmountLd.toNumber(),
  //     "src amount ld",
  //   );
  //   assert(fee.nativeFee.toNumber() > 0, "native fee");
  //   assert(fee.lzTokenFee.toNumber() == 0, "lz token fee");
  // });

  it("should create offer", async function () {
    console.log(hexlify(addressToBytes32(wallet.publicKey.toBase58())));

    const dstSellerAddress = Array.from(
      addressToBytes32("0xC37713ef41Aff1A7ac1c3D02f6f0B3a57F8A3091"),
    );
    const offer = await OtcTools.createOffer(
      otc,
      accounts.seller,
      dstSellerAddress,
    );
    const fetchedOffer = await program.account.offer.fetch(offer[0]);
    assert(
      fetchedOffer.srcSellerAddress.toString() ==
        Array.from(accounts.seller.publicKey.toBytes()).toString(),
      "src seller address",
    );
    assert(
      fetchedOffer.dstSellerAddress.toString() == dstSellerAddress.toString(),
      "dst seller address",
    );
    assert(fetchedOffer.dstEid == peer.to.eid, "dst eid");
    assert(fetchedOffer.srcEid == SOLANA_EID, "src eid");
  });
});
