import * as anchor from "@coral-xyz/anchor";

import {
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram,
  OftTools
} from '@layerzerolabs/lz-solana-sdk-v2'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { addressToBytes32, Options } from '@layerzerolabs/lz-v2-utilities'

import { Accounts, genAccounts } from "../helpers/helper";


describe("Initialize", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const cluster = 'testnet';

  let accounts: Accounts;

  before(async () => {
    // create & register oapp

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

    // await program.methods
    //   .initialize({
    //     endpointProgram: accounts.endpoint,
    //     treasury: accounts.treasury,
    //   })
    //   .accounts({
    //     payer: wallet.publicKey,
    //     otcConfig: accounts.otcConfig,
    //     escrow: accounts.escrow,
    //   })
    //   .remainingAccounts(ixAccounts)
    //   .signers([wallet.payer])
    //   .rpc();

    // create a peer account
    let peer = {
      to: {
        eid: EndpointId.ARBITRUM_V2_TESTNET,
      },
      peerAddress: addressToBytes32('0x010425EC6E7beC3A92c8220cE2237497AD762E63')
    }

    let transaction = new Transaction().add(
      await OftTools.createInitNonceIx(wallet.publicKey, peer.to.eid, accounts.otcConfig, peer.peerAddress)
    )
    let signature = await sendAndConfirmTransaction(connection, transaction, [wallet.payer], {
      commitment: `finalized`,
    })
    console.log(
      `✅ You initialized the peer account for dstEid ${peer.to.eid
      }! View the transaction here: ${signature}`
    )
  });

  it("should init otc market", async () => { });

});
