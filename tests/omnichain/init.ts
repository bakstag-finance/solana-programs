import * as anchor from "@coral-xyz/anchor";

import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import { OftTools } from '@layerzerolabs/lz-solana-sdk-v2'

import { Accounts, generateAccounts, topUp } from "../helpers/helper";
import { ENDPOINT_PROGRAM_ID } from "../helpers/constants";

function createRegisterOappInstructionAccounts(accounts) {
  const keys = [
    {
      pubkey: accounts.payer,
      isWritable: true,
      isSigner: true
    },
    {
      pubkey: accounts.oapp,
      isWritable: false,
      isSigner: true
    },
    {
      pubkey: accounts.oappRegistry,
      isWritable: true,
      isSigner: false
    },
    {
      pubkey: accounts.systemProgram ?? SystemProgram.programId,
      isWritable: false,
      isSigner: false
    },
    {
      pubkey: accounts.eventAuthority,
      isWritable: false,
      isSigner: false
    },
    {
      pubkey: accounts.program,
      isWritable: false,
      isSigner: false
    }
  ];

  return keys;
}

function getRegisterOappIxAccountMetaForCPI(payer: PublicKey, oapp: PublicKey) {
  const [oappRegistry, _] = PublicKey.findProgramAddressSync(
    [Buffer.from("OApp", "utf8"), oapp.toBytes()],
    new PublicKey(ENDPOINT_PROGRAM_ID)
  );

  const [eventAuthority, __] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority", "utf8"), oapp.toBytes()],
    new PublicKey(ENDPOINT_PROGRAM_ID)
  );

  const keys = createRegisterOappInstructionAccounts(
    {
      payer,
      oapp,
      oappRegistry,
      eventAuthority,
      program: new PublicKey(ENDPOINT_PROGRAM_ID)
    }
  );
  keys.forEach((key) => {
    key.isSigner = false;
  });
  return [
    {
      pubkey: new PublicKey(ENDPOINT_PROGRAM_ID),
      isSigner: false,
      isWritable: false
    }
  ].concat(keys);
}


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

    console.log(accounts.otcConfig.toBase58())

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
      .remainingAccounts(getRegisterOappIxAccountMetaForCPI(wallet.publicKey, accounts.otcConfig))
      .signers([wallet.payer])
      .rpc();

    await topUp(accounts, connection, wallet.payer);
  });

  it("should init otc market", async () => { });
});
