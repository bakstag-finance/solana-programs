import * as anchor from "@coral-xyz/anchor";
import * as dotenv from "dotenv";
dotenv.config();

import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";
import { hexlify } from "ethers/lib/utils";

import { OtcPdaDeriver } from "./utils/otc-pda-deriver";
import { PEER, SOLANA_EID } from "./config/constants";

import { ethers } from "ethers";
import abi from "./evm/abi.json";

export type LzReceiveParams = anchor.IdlTypes<OtcMarket>["LzReceiveParams"];

describe("evm", () => {
  let wallet: ethers.Wallet;
  let contract: ethers.Contract;
  let peerAddress: string;
  let fee;
  let params;

  const seller =
    "0x000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a3091";

  before(async () => {
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.PROVIDER_URL!,
    );
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    contract = new ethers.Contract(PEER, abi, wallet);

    const program = anchor.workspace.OtcMarket as Program<OtcMarket>;

    const otcPdaDeriver = new OtcPdaDeriver(program.programId);
    const otcConfig = otcPdaDeriver.config();
    peerAddress = hexlify(otcConfig.toBytes());
    const exchangeRateSD = 1.5 * 10 ** 6;
    // Math.floor(Math.random() * (10 * 10 ** 6 - 0.001 * 10 ** 6 + 1)) +
    // 0.001 * 10 ** 6;
    params = {
      dstSellerAddress:
        "0x000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a3091",
      dstEid: "40168",
      srcTokenAddress:
        "0x000000000000000000000000BBd6fb513C5e0b6E0Ce0d88135c765776C878aF0",
      dstTokenAddress:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      srcAmountLD: "5000000000000000000",
      exchangeRateSD: exchangeRateSD.toString(),
    };
  });

  it("should set peer", async () => {
    const tx = await contract.setPeer(SOLANA_EID, peerAddress);
    await tx.wait();
  });

  it("should quote", async () => {
    const result = await contract.quoteCreateOffer(seller, params, false);
    fee = {
      nativeFee: result.fee.nativeFee,
      lzTokenFee: result.fee.lzTokenFee,
    };
  });

  it("should create offer", async () => {
    const tx = await contract.createOffer(params, fee, {
      value: fee.nativeFee,
      gasLimit: 700_000,
    });

    const receipt = await tx.wait();
    const transaction = receipt.transactionHash;

    console.log({ transaction });
  });
});
