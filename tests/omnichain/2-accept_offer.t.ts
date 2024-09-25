import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import { Otc } from "./utils/otc";
import { OtcTools } from "./utils/otc-tools";
import { TREASURY_SECRET_KEY } from "./config/constants";
import { AccountTools } from "./utils/account-tools";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";

describe("Accept Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

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
    await AccountTools.getRemainings(
      connection,
      [accounts.seller, accounts.buyer],
      wallet.publicKey,
    );
  });

  // describe("Quote Accept Offer", () => {
  // it("should quote accept monochain sol-sol offer", async () => {
  //   const offer = await program.account.offer.fetch(accounts.offer[0]);
  //   const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
  //     offerId: accounts.offer[1],
  //     srcAmountSd: offer.srcAmountSd,
  //     srcBuyerAddress: Array.from(accounts.buyer.publicKey.toBytes()),
  //   };
  //   const parsed = await otc.quoteAcceptOffer(params, accounts.buyer);
  //   assert(parsed[0].dstAmountLd.toNumber() == AmountsLD.SOL, "dst amount");
  //   assert(
  //     parsed[0].feeLd.toNumber() == AmountsLD.SOL / 100,
  //     "protocol fee amount",
  //   );
  //   assert(parsed[1].nativeFee.toNumber() == 0, "native fee");
  //   assert(parsed[1].lzTokenFee.toNumber() == 0, "lz token fee");
  // });
  // it("should quote accept cross chain offer", async () => {
  //   const offerId =
  //     "3962734256b3538786b5a3c52377acdf005bd0930dbc98ddb3abd192321185d4";
  //   const srcBuyerAddress = "C37713ef41Aff1A7ac1c3D02f6f0B3a57F8A3091";
  //   const { account: offerAccount } = await OtcTools.getOfferFromId(
  //     otc.program,
  //     offerId,
  //   );
  //   const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
  //     offerId: Array.from(Buffer.from(offerId, "hex")),
  //     srcAmountSd: offerAccount.srcAmountSd,
  //     srcBuyerAddress: Array.from(Buffer.from(srcBuyerAddress, "hex")),
  //   };
  //   const receipt = await otc.quoteAcceptOffer(params, accounts.buyer);
  //   const dstAmount = receipt[0].dstAmountLd.toNumber();
  //   assert(
  //     receipt[0].feeLd.toNumber() == dstAmount / 100,
  //     "protocol fee amount",
  //   );
  //   assert(receipt[1].nativeFee.toNumber() > 0, "native fee");
  //   assert(receipt[1].lzTokenFee.toNumber() == 0, "lz token fee");
  // });
  // it("should create lookup table ", async () => {
  //   console.log(await connection.getBalance(wallet.publicKey));
  //   const addrs = [
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //     Keypair.generate().publicKey,
  //   ];
  //   const tableAddr = await V0TransactionTools.createLookUpTable(
  //     connection,
  //     wallet.payer,
  //     addrs,
  //   );
  //   console.log(await connection.getBalance(wallet.publicKey));
  //   await V0TransactionTools.waitForNewBlock(connection, 2);
  //   await V0TransactionTools.deactivateLookUpTable(
  //     connection,
  //     tableAddr,
  //     wallet.payer,
  //   );
  //   console.log(await connection.getBalance(wallet.publicKey));
  //   await V0TransactionTools.waitForNewBlock(connection, 2);
  //   await V0TransactionTools.closeLookUpTable(
  //     connection,
  //     tableAddr,
  //     wallet.payer,
  //   );
  //   console.log(await connection.getBalance(wallet.publicKey));
  // });
  // });

  describe("Accept Offer", () => {
    it("should accept crosschain offer", async () => {
      const offerId =
        "5edc5f207ac3c5b60473ca13d272d2e9d082d1098e90fb1284c012ae0d7a9ee9";

      const srcBuyerAddress = "0xC37713ef41Aff1A7ac1c3D02f6f0B3a57F8A3091";

      const params: anchor.IdlTypes<OtcMarket>["AcceptOfferParams"] = {
        offerId: Array.from(Buffer.from(offerId, "hex")),
        srcAmountSd: new anchor.BN(123),
        srcBuyerAddress: Array.from(addressToBytes32(srcBuyerAddress)),
      };

      const quote = await otc.quoteAcceptOffer(params, accounts.buyer);
      const fee = quote[1];

      const signature = await otc.acceptOffer(params, accounts.buyer, fee);
      console.log(signature);
    });
  });
});
