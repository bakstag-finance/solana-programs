import * as anchor from "@coral-xyz/anchor";

import {
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

import {
  EndpointProgram,
  lzReceive,
  OftTools,
  SetConfigType,
  simulateTransaction,
} from "@layerzerolabs/lz-solana-sdk-v2";

import { hexlify } from "ethers/lib/utils";

import { solanaToArbSepConfig as peer } from "./config/peer";
import { OtcPdaDeriver } from "./utils/otc-pda-deriver";
import {
  COMMITMENT,
  ENDPOINT_PROGRAM_ID,
  TREASURY_SECRET_KEY,
} from "./config/constants";
import { Options, Packet } from "@layerzerolabs/lz-v2-utilities";

export type LzReceiveParams = anchor.IdlTypes<OtcMarket>["LzReceiveParams"];

describe("Omnichain", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.OtcMarket as Program<OtcMarket>;
  const programId = program.programId;
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  const commitment = COMMITMENT;

  let accounts: {
    otcConfig: PublicKey;
    endpoint: PublicKey;
    treasury: PublicKey;
    escrow: PublicKey;
    lzReceiveTypesAccounts: PublicKey;
  };
  let endpoint: EndpointProgram.Endpoint;
  const otcPdaDeriver = new OtcPdaDeriver(programId);

  before(async () => {
    accounts = {
      otcConfig: otcPdaDeriver.config(),
      endpoint: new PublicKey(ENDPOINT_PROGRAM_ID),
      treasury: Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey,
      escrow: otcPdaDeriver.escrow(),
      lzReceiveTypesAccounts: otcPdaDeriver.lzReceiveTypesAccounts(),
    };

    endpoint = new EndpointProgram.Endpoint(accounts.endpoint);
  });

  it("should log solana peer", async () => {
    console.log(hexlify(accounts.otcConfig.toBytes()));
    // console.log(
    //   hexlify(
    //     Options.newOptions()
    //       .addExecutorLzReceiveOption(1 * 10 ** 6, 1500_000)
    //       .toBytes(),
    //   ),
    // );
  });

  describe("Initialize", () => {
    it("should init otc", async () => {
      await program.methods
        .initialize({
          endpointProgram: accounts.endpoint,
          treasury: accounts.treasury,
        })
        .accounts({
          payer: wallet.publicKey,
          lzReceiveTypesAccounts: accounts.lzReceiveTypesAccounts,
          otcConfig: accounts.otcConfig,
          escrow: accounts.escrow,
        })
        .remainingAccounts(
          endpoint.getRegisterOappIxAccountMetaForCPI(
            wallet.publicKey,
            accounts.otcConfig,
          ),
        )
        .signers([wallet.payer])
        .rpc({
          commitment,
        });
    });

    it("should configure crosschain", async () => {
      const [
        initNonceIx,
        initSendLibraryIx,
        initReceiveLibraryIx,
        initConfigIx,
        setPeerIx,
        setEnforcedOptionsIx,
        setSendLibraryIx,
        setReceiveLibraryIx,
        setConfigExecutorIx,
        setConfigSendUlnIx,
        setConfigReceiveUlnIx,
      ] = await Promise.all([
        OftTools.createInitNonceIx(
          wallet.publicKey,
          peer.to.eid,
          accounts.otcConfig,
          peer.peerAddress,
        ),
        OftTools.createInitSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
        ),
        OftTools.createInitReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
        ),
        OftTools.createInitConfigIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          peer.sendLibrary,
        ),
        OftTools.createSetPeerIx(
          programId,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          peer.peerAddress,
        ),
        OftTools.createSetEnforcedOptionsIx(
          programId,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          peer.sendOptions,
          peer.sendAndCallOptions,
        ),
        OftTools.createSetSendLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.sendLibrary,
          peer.to.eid,
        ),
        OftTools.createSetReceiveLibraryIx(
          wallet.publicKey,
          accounts.otcConfig,
          peer.receiveLibraryConfig.receiveLibrary,
          peer.to.eid,
          peer.receiveLibraryConfig.gracePeriod,
        ),
        OftTools.createSetConfigIx(
          connection,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          SetConfigType.EXECUTOR,
          peer.executorConfig,
          peer.sendLibrary,
        ),
        OftTools.createSetConfigIx(
          connection,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          SetConfigType.SEND_ULN,
          peer.sendUlnConfig,
          peer.sendLibrary,
        ),
        OftTools.createSetConfigIx(
          connection,
          wallet.publicKey,
          accounts.otcConfig,
          peer.to.eid,
          SetConfigType.RECEIVE_ULN,
          peer.receiveUlnConfig,
          peer.receiveLibraryConfig.receiveLibrary,
        ),
      ]);

      let tx = new Transaction().add(
        initNonceIx,
        initSendLibraryIx,
        initReceiveLibraryIx,
        initConfigIx,
        setPeerIx,
        setEnforcedOptionsIx,
      );

      await sendAndConfirmTransaction(connection, tx, [wallet.payer], {
        commitment,
      });

      tx = new Transaction().add(
        setSendLibraryIx,
        setReceiveLibraryIx,
        setConfigExecutorIx,
        setConfigSendUlnIx,
        setConfigReceiveUlnIx,
      );

      await sendAndConfirmTransaction(connection, tx, [wallet.payer], {
        commitment,
      });
    });

    // it("shold return account from LzReceiveTypes", async () => {
    //   const payload =
    //     "0x008a1fb0c58e4e62fcea2bc8cad453adee904e7e55ad9524f27e7ceeaaca47652a000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a3091000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a309100009d2700009ce8000000000000000000000000bbd6fb513c5e0b6e0ce0d88135c765776c878af00000000000000000000000008b3bcfa4680e8a16215e587dfccd1730a453cead00000000004c4b40000000000016e364";

    //   const payloadBytes = Buffer.from(payload.slice(2), "hex");
    //   const params: LzReceiveParams = {
    //     srcEid: 40168,
    //     sender: Array.from(wallet.publicKey.toBytes()),
    //     nonce: new anchor.BN(1),
    //     guid: Array.from(wallet.publicKey.toBytes()),
    //     message: payloadBytes,
    //     extraData: Buffer.from(""),
    //   };

    //   const ix = await program.methods
    //     .lzReceiveTypes(params)
    //     .accounts({
    //       otcConfig: accounts.otcConfig,
    //     })
    //     .instruction();

    //   const response = await simulateTransaction(
    //     connection,
    //     [ix],
    //     program.programId,
    //     wallet.publicKey,
    //     COMMITMENT,
    //   );

    //   console.log(response);
    // });
    // it("should add offer lz receive create offer", async () => {
    //   const payload =
    //     "0x008a1fb0c58e4e62fcea2bc8cad453adee904e7e55ad9524f27e7ceeaaca47652a000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a3091000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a309100009d2700009ce8000000000000000000000000bbd6fb513c5e0b6e0ce0d88135c765776c878af00000000000000000000000008b3bcfa4680e8a16215e587dfccd1730a453cead00000000004c4b40000000000016e364";

    //   const payloadBytes = Buffer.from(payload.slice(2), "hex");
    //   const params: LzReceiveParams = {
    //     srcEid: 40168,
    //     sender: Array.from(wallet.publicKey.toBytes()),
    //     nonce: new anchor.BN(1),
    //     guid: Array.from(wallet.publicKey.toBytes()),
    //     message: payloadBytes,
    //     extraData: Buffer.from(""),
    //   };
    //   program.methods
    //     .lzReceive(params)
    //     .accounts({
    //       payer: wallet.publicKey,
    //       offer: new PublicKey(
    //         Buffer.from(
    //           "008a1fb0c58e4e62fcea2bc8cad453adee904e7e55ad9524f27e7ceeaaca47652a",
    //           "hex",
    //         ),
    //       ),
    //     })
    //     .signers([wallet.payer])
    //     .rpc();
    // });

    // it("lz receive", async () => {
    //   const payload =
    //     "0x008a1fb0c58e4e62fcea2bc8cad453adee904e7e55ad9524f27e7ceeaaca47652a000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a3091000000000000000000000000c37713ef41aff1a7ac1c3d02f6f0b3a57f8a309100009d2700009ce8000000000000000000000000bbd6fb513c5e0b6e0ce0d88135c765776c878af00000000000000000000000008b3bcfa4680e8a16215e587dfccd1730a453cead00000000004c4b40000000000016e364";

    //   //   const { message: message_, sender, srcEid, guid, receiver: receiver_ } = packet;
    //   const packet: Packet = {
    //     version: 302,
    //     nonce: "1",
    //     guid: "0x0000000000000000000000000000000000000000000000000000000000000000",
    //     message: payload,
    //     payload: "",
    //     srcEid: 40231,
    //     dstEid: 40168,
    //     sender:
    //       "0x000000000000000000000000bca736bdf0711b46e5c98cd626f7c6a45f56ba88",
    //     receiver: accounts.otcConfig.toString(),
    //     //"5ZGsuHpwHURk5EagJFW8BTSzG5HVo1Joa2QfGYHMFFA",
    //   };
    //   console.log(program.programId.toString());
    //   console.log(accounts.otcConfig.toString());
    //   const ix = await lzReceive(connection, wallet.publicKey, packet);

    //   const hui = await simulateTransaction(
    //     connection,
    //     [ix],
    //     program.programId,
    //     wallet.publicKey,
    //   );
    //   console.log(hui);
    // });
  });

  // describe("Crosschain msg", () => {
  //   it("should quote and send msg", async () => {
  //     const path: PacketPath = {
  //       dstEid: peer.to.eid,
  //       srcEid: 40168,
  //       sender: hexlify(accounts.otcConfig.toBytes()),
  //       receiver: bytes32ToEthAddress(peer.peerAddress),
  //     };

  //     const sendLib = new UlnProgram.Uln(
  //       (
  //         await endpoint.getSendLibrary(
  //           connection,
  //           accounts.otcConfig,
  //           peer.to.eid,
  //         )
  //       ).programId,
  //     );

  //     const quoteParams: anchor.IdlTypes<OtcMarket>["QuoteParams"] = {
  //       dstEid: peer.to.eid,
  //       options: Buffer.from(
  //         Options.newOptions().addExecutorLzReceiveOption(0, 0).toBytes(),
  //       ),
  //       to: Array.from(peer.peerAddress),
  //       composeMsg: null,
  //       payInLzToken: false,
  //     };

  //     const peerAccount = otcPdaDeriver.peer(quoteParams.dstEid);
  //     const enforcedOptions = otcPdaDeriver.enforcedOptions(quoteParams.dstEid);

  //     const ix = await program.methods
  //       .quote(quoteParams)
  //       .accounts({
  //         otcConfig: accounts.otcConfig,
  //         peer: peerAccount,
  //         enforcedOptions,
  //       })
  //       .remainingAccounts(
  //         await endpoint.getQuoteIXAccountMetaForCPI(
  //           connection,
  //           wallet.publicKey,
  //           path,
  //           sendLib,
  //         ),
  //       )
  //       .instruction();

  //     const response = await simulateTransaction(
  //       connection,
  //       [ix],
  //       programId,
  //       wallet.publicKey,
  //       commitment,
  //     );

  //     const { nativeFee, lzTokenFee } = messagingFeeBeet.read(response, 0);

  //     const sendParams: anchor.IdlTypes<OtcMarket>["SendParams"] = {
  //       ...quoteParams,
  //       nativeFee,
  //       lzTokenFee,
  //     };

  //     const send = await program.methods
  //       .send(sendParams)
  //       .accounts({
  //         otcConfig: accounts.otcConfig,
  //         peer: peerAccount,
  //         enforcedOptions,
  //       })
  //       .remainingAccounts(
  //         await endpoint.getSendIXAccountMetaForCPI(
  //           connection,
  //           wallet.publicKey,
  //           path,
  //           sendLib,
  //         ),
  //       )
  //       .signers([wallet.payer])
  //       .transaction();

  //     const tx = new Transaction().add(
  //       ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
  //       send,
  //     );

  //     console.log(
  //       await sendAndConfirmTransaction(connection, tx, [wallet.payer], {
  //         commitment,
  //       }),
  //     );
  //   });
  // });
});
