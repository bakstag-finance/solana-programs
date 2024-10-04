import * as anchor from "@coral-xyz/anchor";
import { expect, assert } from "chai";

import { Program, AnchorError, Wallet } from "@coral-xyz/anchor";

// import { BorshCoder, EventParser, web3 } from "@project-serum/anchor";

import { OtcMarket } from "../target/types/otc_market";

import { generateAccounts } from "./helpers/helper";
import { initOtc } from "./helpers/init";

describe("Initialization", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  it("should init otc market", async () => {
    const { otcConfig, escrow, treasury } = await generateAccounts(
      connection,
      program.programId,
      wallet.payer,
    );
    await initOtc(program, otcConfig, escrow, treasury, wallet.payer);
  });
});
