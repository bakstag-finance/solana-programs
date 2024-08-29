import * as anchor from "@coral-xyz/anchor";

import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram,
  OftTools,
  SetConfigType,
} from "@layerzerolabs/lz-solana-sdk-v2";

import { solanaToArbSepConfig as peer } from './config';
import { Accounts, genAccounts } from "../helpers/helper";


describe("Create OTC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = "confirmed";

  let accounts: Accounts;

  before(async () => {
    accounts = await genAccounts(connection, program.programId, wallet.payer);
  });

  describe("Initialize", () => {
    it("1. should init otc", async () => {
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
        .rpc({
          commitment,
        });
    });

    it("2. should init peer account", async () => {
      const tx = new Transaction().add(
        await OftTools.createInitNonceIx(
          wallet.publicKey,
          peer.to.eid,
          accounts.otcConfig,
          peer.peerAddress
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    });

    it("3. should init send library", async () => {
      const tx = new Transaction().add(
        await OftTools.createInitSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    });

    it("4. should init receive library", async () => {
      const tx = new Transaction().add(
        await OftTools.createInitReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    });

    it("5. should init oapp config", async () => {
      const tx = new Transaction().add(
        await OftTools.createInitConfigIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          peer.sendLibrary
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    });
  })


  describe("Set Peer, Enforced Options", () => {
    it("6. should set peer", async () => {
      const tx = new Transaction().add(
        await OftTools.createSetPeerIx(
          programId, // Your OFT Program ID
          wallet.publicKey, // admin
          accounts.otcConfig, // oft config account
          peer.to.eid, // destination endpoint id
          peer.peerAddress // peer address
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    });

    it("7. should set enforced options", async () => {
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

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    })
  });

  describe("Set Libraries", () => {
    it("8. should set send library", async () => {
      const tx = new Transaction().add(
        await OftTools.createSetSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.sendLibrary,
          peer.to.eid
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    })

    it("9. should set receive library", async () => {
      const tx = new Transaction().add(
        await OftTools.createSetReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.receiveLibraryConfig.receiveLibrary,
          peer.to.eid,
          peer.receiveLibraryConfig.gracePeriod
        )
      );

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    })
  });

  describe("Set Options", () => {
    it("10. should set executor options", async () => {
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

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    })

    it("11. should set send options", async () => {
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

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    })

    it("12. should set receive options", async () => {
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

      await sendAndConfirmTransaction(
        connection,
        tx,
        [wallet.payer],
        {
          commitment,
        }
      );
    })
  });
});
