import * as anchor from "@coral-xyz/anchor";

import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
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

import {
  DVN_CONFIG_SEED,
  EXECUTOR_CONFIG_SEED,
} from "@layerzerolabs/lz-solana-sdk-v2";
import { Accounts, genAccounts } from "../helpers/helper";

type SolanaPeerConfig = {
  to: OmniPointHardhat;
  peerAddress: Uint8Array;
  // Based on token decimals, e.g., 6 decimal tokens will set 10000000000 for a capacity of 10000 tokens (6 decimals)
  sendLibrary: PublicKey;
  receiveLibraryConfig: {
    receiveLibrary: PublicKey;
    gracePeriod: bigint;
  };
  sendUlnConfig: {
    confirmations: number;
    requiredDvnCount: number;
    optionalDvnCount: number;
    optionalDvnThreshold: number;
    requiredDvns: Array<PublicKey>;
    optionalDvns: Array<PublicKey>;
  };
  receiveUlnConfig: {
    confirmations: number;
    requiredDvnCount: number;
    optionalDvnCount: number;
    optionalDvnThreshold: number;
    requiredDvns: Array<PublicKey>;
    optionalDvns: Array<PublicKey>;
  };
  executorConfig: {
    executor: PublicKey;
    maxMessageSize: number;
  };
  sendOptions: Uint8Array;
  sendAndCallOptions: Uint8Array;
};
describe("Initialize", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const cluster = "testnet";

  let accounts: Accounts;
  let peer: SolanaPeerConfig;

  before(async () => {
    accounts = await genAccounts(connection, program.programId, wallet.payer);
    const uln = new PublicKey("7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH");
    const executor = new PublicKey(
      "6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn"
    );
    const lzDVN = new PublicKey("HtEYV4xB4wvsj5fgTkcfuChYpvGYzgzwvNhgDZQNh7wW");
    const lzDVNConfigAccount = PublicKey.findProgramAddressSync(
      [Buffer.from(DVN_CONFIG_SEED, "utf8")],
      lzDVN
    )[0];
    peer = {
      to: {
        eid: EndpointId.ARBITRUM_V2_TESTNET,
      },
      peerAddress: addressToBytes32(
        "0x010425EC6E7beC3A92c8220cE2237497AD762E63"
      ),
      sendLibrary: uln,
      receiveLibraryConfig: {
        receiveLibrary: uln,
        gracePeriod: BigInt(0),
      },
      // Based on token decimals, e.g., 6 decimal tokens will set 10000000000 for a capacity of 10000 tokens (6 decimals)
      sendUlnConfig: {
        confirmations: 100,
        requiredDvnCount: 1,
        optionalDvnCount: 0,
        optionalDvnThreshold: 0,
        requiredDvns: [lzDVNConfigAccount],
        optionalDvns: [],
      },
      receiveUlnConfig: {
        confirmations: 100,
        requiredDvnCount: 1,
        optionalDvnCount: 0,
        optionalDvnThreshold: 0,
        requiredDvns: [lzDVNConfigAccount],
        optionalDvns: [],
      },
      executorConfig: {
        executor: PublicKey.findProgramAddressSync(
          [Buffer.from(EXECUTOR_CONFIG_SEED, "utf8")],
          executor
        )[0],
        maxMessageSize: 10000,
      },
      sendOptions: Options.newOptions()
        .addExecutorLzReceiveOption(65000, 0)
        .toBytes(),
      sendAndCallOptions: Options.newOptions()
        .addExecutorLzReceiveOption(65000, 0)
        .addExecutorComposeOption(0, 50000, 0)
        .toBytes(),
    };
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
      const signature = await program.methods
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
        `✅ You initialized otc market! View the transaction here: ${signature}`
      );
    }
    // /*
    // if create peer fails, just comment otc init and run the tests one more time)))
    // transaction doesnt have time to be confirmed
    // TODO: fix this shit
    {
      console.log("a) create peer account");

      let transaction = new Transaction().add(
        await OftTools.createInitNonceIx(
          wallet.publicKey,
          peer.to.eid,
          accounts.otcConfig,
          peer.peerAddress
        )
      );
      let signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the peer account for dstEid ${
          peer.to.eid
        }! View the transaction here: ${signature}`
      );
    }

    {
      console.log("b) init send library");
      const transaction = new Transaction().add(
        await OftTools.createInitSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the send library for dstEid ${
          peer.to.eid
        }! View the transaction here: ${signature}`
      );
    }

    {
      console.log("c) initialize receive library for the pathway");
      const transaction = new Transaction().add(
        await OftTools.createInitReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the receive library for dstEid ${
          peer.to.eid
        }! View the transaction here: ${signature}`
      );
    }

    {
      console.log("d) initialize OFT Config for the pathway");
      const transaction = new Transaction().add(
        await OftTools.createInitConfigIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          peer.sendLibrary
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You initialized the config for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }

    {
      console.log("e) set peer");

      // const peerAddress = Array.from(peer.peerAddress);
      // console.log(peerAddress.length);
      const transaction = new Transaction().add(
        await OftTools.createSetPeerIx(
          programId, // Your OFT Program ID
          wallet.publicKey, // admin
          accounts.otcConfig, // oft config account
          peer.to.eid, // destination endpoint id
          peer.peerAddress // peer address
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set the peer for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }

    {
      console.log("f) set enforced options");
      const transaction = new Transaction().add(
        await OftTools.createSetEnforcedOptionsIx(
          programId,
          wallet.publicKey, // your admin address
          accounts.otcConfig, // your OFT Config
          peer.to.eid, // destination endpoint id for the options to apply to
          peer.sendOptions, // send options
          peer.sendAndCallOptions
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set enforced options for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }

    {
      console.log("g) set send library");
      const transaction = new Transaction().add(
        await OftTools.createSetSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.sendLibrary,
          peer.to.eid
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set the send library for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }

    {
      console.log("h) set receive library");
      const transaction = new Transaction().add(
        await OftTools.createSetReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.receiveLibraryConfig.receiveLibrary,
          peer.to.eid,
          peer.receiveLibraryConfig.gracePeriod
        )
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ You set the receive library for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }
    // */

    {
      console.log("i) set executor options");
      const transaction = new Transaction().add(
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

      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );

      console.log(
        `✅ Set executor configuration for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }

    {
      console.log("j) set send options");
      const transaction = new Transaction().add(
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
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ Set send configuration for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }

    {
      console.log("k) set receive options");
      const transaction = new Transaction().add(
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
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        {
          commitment: `finalized`,
        }
      );
      console.log(
        `✅ Set receive configuration for dstEid ${peer.to.eid}! View the transaction here: ${
          signature
        }`
      );
    }
  });
});
