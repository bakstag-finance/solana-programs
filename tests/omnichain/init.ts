import * as anchor from "@coral-xyz/anchor";

import { Keypair } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram
} from '@layerzerolabs/lz-solana-sdk-v2'

import { Accounts, genAccounts, topUp } from "../helpers/helper";


describe("Initialize", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  let accounts: Accounts;

  before(async () => {
    // init otc

    accounts = await genAccounts(
      connection,
      program.programId,
      wallet.payer
    );

    const ixAccounts = [
      {
        pubkey: accounts.endpoint,
        isSigner: false,
        isWritable: false
      }
    ].concat(EndpointProgram.instructions.createRegisterOappInstructionAccounts(
      {
        payer: wallet.publicKey,
        oapp: accounts.otcConfig,
        oappRegistry: accounts.oappRegistry,
        eventAuthority: accounts.eventAuthority,
        program: accounts.endpoint,
      },
      accounts.endpoint
    ))
    ixAccounts.forEach((ixAccount) => {
      ixAccount.isSigner = false;
    });


    await program.methods
      .initialize({
        endpointProgram: accounts.endpoint,
        treasury: accounts.treasury,
      })
      .accounts({
        payer: wallet.publicKey,
        otcConfig: accounts.otcConfig,
        escrow: accounts.escrow,
      })
      .remainingAccounts(ixAccounts)
      .signers([wallet.payer])
      .rpc();

    // await topUp(accounts, connection, wallet.payer);
  });

  it("should init otc market", async () => { });
});
