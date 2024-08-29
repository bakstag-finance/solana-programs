import * as anchor from "@coral-xyz/anchor";

import { Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram,
  OftTools,
  SetConfigType,
} from "@layerzerolabs/lz-solana-sdk-v2";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { addressToBytes32, Options } from "@layerzerolabs/lz-v2-utilities";

import type { OmniPointHardhat } from "@layerzerolabs/toolbox-hardhat";
import { PublicKey } from "@solana/web3.js";

import { solanaToArbSepConfig as peer } from './config';


import {
  DVN_CONFIG_SEED,
  EXECUTOR_CONFIG_SEED,
} from "@layerzerolabs/lz-solana-sdk-v2";
import { Accounts, genAccounts } from "../helpers/helper";


describe("Initialize", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection as unknown as Connection;
  const wallet = provider.wallet as Wallet;

  let accounts: Accounts;

  before(async () => {
    accounts = await genAccounts(connection, program.programId, wallet.payer);
  });

  it("should init otc", async () => {
    {
      console.log("0) init otc");
      const ixAccounts = [
        {
          pubkey: accounts.endpoint,
          isSigner: false,
          isWritable: false,
        },
      ].concat(
        EndpointProgram.instructions.createRegisterOappInstructionAccounts(
          {
            payer: wallet.publicKey,
            oapp: accounts.otcConfig,
            oappRegistry: accounts.oappRegistry,
            eventAuthority: accounts.eventAuthority,
            program: accounts.endpoint,
          },
          accounts.endpoint
        )
      );
      ixAccounts.forEach((ixAccount) => {
        ixAccount.isSigner = false;
      });
      const sgn = await program.methods
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
      console.log(
        `✅ You initialized otc market! View the transaction here: ${sgn}`
      );
    }
    // /*
    // if create peer fails, just comment otc init and run the tests one more time)))
    // transaction doesnt have time to be confirmed
    // TODO: fix this shit
    {
      console.log("a) create peer account");

      const tx = new Transaction().add(
        await OftTools.createInitNonceIx(
          wallet.publicKey,
          peer.to.eid,
          accounts.otcConfig,
          peer.peerAddress
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the peer account for dstEid ${peer.to.eid
        }! View the transaction here: ${sgn}`
      );
    }

    {
      console.log("b) init send library");
      const tx = new Transaction().add(
        await OftTools.createInitSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the send library for dstEid ${peer.to.eid
        }! View the transaction here: ${sgn}`
      );
    }

    {
      console.log("c) initialize receive library for the pathway");
      const tx = new Transaction().add(
        await OftTools.createInitReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the receive library for dstEid ${peer.to.eid
        }! View the transaction here: ${sgn}`
      );
    }

    {
      console.log("d) initialize OFT Config for the pathway");
      const tx = new Transaction().add(
        await OftTools.createInitConfigIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          peer.sendLibrary
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the config for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }

    {
      console.log("e) set peer");

      // const peerAddress = Array.from(peer.peerAddress);
      // console.log(peerAddress.length);
      const tx = new Transaction().add(
        await OftTools.createSetPeerIx(
          programId, // Your OFT Program ID
          wallet.publicKey, // admin
          accounts.otcConfig, // oft config account
          peer.to.eid, // destination endpoint id
          peer.peerAddress // peer address
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set the peer for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }

    {
      console.log("f) set enforced options");
      const tx = new Transaction().add(
        await OftTools.createSetEnforcedOptionsIx(
          programId,
          wallet.publicKey, // your admin address
          accounts.otcConfig, // your OFT Config
          peer.to.eid, // destination endpoint id for the options to apply to
          peer.sendOptions, // send options
          peer.sendAndCallOptions
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set enforced options for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }

    {
      console.log("g) set send library");
      const tx = new Transaction().add(
        await OftTools.createSetSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.sendLibrary,
          peer.to.eid
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set the send library for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }

    {
      console.log("h) set receive library");
      const tx = new Transaction().add(
        await OftTools.createSetReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.receiveLibraryConfig.receiveLibrary,
          peer.to.eid,
          peer.receiveLibraryConfig.gracePeriod
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set the receive library for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }
    // */

    {
      console.log("i) set executor options");
      const tx = new Transaction().add(
        await OftTools.createSetConfigIx(
          connection,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          SetConfigType.EXECUTOR,
          peer.executorConfig,
          peer.sendLibrary
        )
      );

      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );

      console.log(
        `✅ Set executor configuration for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }

    {
      console.log("j) set send options");
      const tx = new Transaction().add(
        await OftTools.createSetConfigIx(
          connection,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          SetConfigType.SEND_ULN,
          peer.sendUlnConfig,
          peer.sendLibrary
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ Set send configuration for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }

    {
      console.log("k) set receive options");
      const tx = new Transaction().add(
        await OftTools.createSetConfigIx(
          connection,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          SetConfigType.RECEIVE_ULN,
          peer.receiveUlnConfig,
          peer.receiveLibraryConfig.receiveLibrary
        )
      );
      const sgn = await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ Set receive configuration for dstEid ${peer.to.eid}! View the transaction here: ${sgn
        }`
      );
    }
  });
});
