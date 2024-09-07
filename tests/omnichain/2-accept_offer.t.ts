import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import { simulateTransaction } from "@layerzerolabs/lz-solana-sdk-v2";
import { quoteAcceptOfferBeet } from "./utils/beet-decoder";
import { Otc } from "./utils/otc";
import { OtcTools } from "./utils/otc-tools";
import { Token } from "./config/constants";

describe("Accept Offer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = "confirmed";

  let accounts: {
    otcConfig: PublicKey;
    seller: Keypair;
    offer: [PublicKey, number[]];
  };
  const otc = new Otc(program, connection, wallet.payer);

  before(async () => {
    const { seller, offer } = await OtcTools.createOffer(otc, {
      srcToken: Token.SOL,
      dstToken: Token.SOL,
    });
    accounts = {
      otcConfig: otc.deriver.config(),
      seller,
      offer,
    };
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
      console.log("dst amount ld", parsed[0].dstAmountLd);
      console.log("fee ld", parsed[0].feeLd);
      console.log("native fee", parsed[1].nativeFee);
      console.log("lz token fee", parsed[1].lzTokenFee);
    });
  });
});
