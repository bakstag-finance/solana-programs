import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import { Otc } from "./utils/otc";
import { OtcTools } from "./utils/otc-tools";
import { TREASURY_SECRET_KEY } from "./config/constants";
import { AccountTools } from "./utils/account-tools";
import { addressToBytes32, Options } from "@layerzerolabs/lz-v2-utilities";

describe("Cancel offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  let accounts: {
    //treasury: PublicKey;
    otcConfig: PublicKey;
    seller: Keypair;
    //buyer: Keypair;
    offer: [PublicKey, number[]];
  };

  const otc = new Otc(program, connection, wallet.payer);
  before(async () => {
    const seller = Keypair.generate();
    await AccountTools.topUpAccounts(otc, seller);
    const dstSeller = Array.from(
      addressToBytes32("0xC37713ef41Aff1A7ac1c3D02f6f0B3a57F8A3091"),
    );

    const offer = await OtcTools.createOffer(otc, seller, dstSeller);

    accounts = {
      otcConfig: otc.deriver.config(),
      seller,
      offer,
    };
  });

  it("should cancel", async () => {
    const extraOptions = Options.newOptions()
      //1728787755972227
      .addExecutorLzReceiveOption(1 * 10 ** 6, 2_000_000)
      .toBytes();

    const parsed = await otc.quoteCancelOfferOrder(
      accounts.offer[1],
      Buffer.from(extraOptions),
    );

    console.log(parsed);
  });
});
