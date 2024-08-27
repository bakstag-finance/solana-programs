import * as anchor from "@coral-xyz/anchor";

import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  BaseOApp,
  EndpointProgram,
  EventPDADeriver,
  SimpleMessageLibProgram,
  UlnProgram,
  oappIDPDA,
} from '@layerzerolabs/lz-solana-sdk-v2'

import { Accounts, generateAccounts, topUp } from "../helpers/helper";


describe("Initialize", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;

  const ENDPOINT_PROGRAM_ID =
    "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";
  const treasury = Keypair.generate().publicKey;

  let accounts: Accounts;

  before(async () => {
    // init otc

    accounts = await generateAccounts(
      connection,
      program.programId,
      wallet.payer
    );

    const ixAccounts = EndpointProgram.instructions.createRegisterOappInstructionAccounts(
      {
        payer: wallet.publicKey,
        oapp: accounts.otcConfig,
        oappRegistry: accounts.oappRegistry,
        eventAuthority: accounts.eventAuthority,
        program: accounts.endpoint,
      },
      accounts.endpoint
    )

    await program.methods
      .initialize({
        endpointProgram: new PublicKey(ENDPOINT_PROGRAM_ID),
        treasury: treasury,
      })
      .accounts({
        payer: wallet.publicKey,
        otcConfig: accounts.otcConfig,
        escrow: accounts.escrow,
      })
      .remainingAccounts(ixAccounts)
      .signers([wallet.payer])
      .rpc();

    await topUp(accounts, connection, wallet.payer);
  });

  it("should init otc market", async () => { });
});
