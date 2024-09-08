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
  OftTools,
  SetConfigType,
} from "@layerzerolabs/lz-solana-sdk-v2";

import { hexlify } from "ethers/lib/utils";

import { solanaToArbSepConfig as peer } from "./config/peer";
import { OtcPdaDeriver } from "./utils/otc-pda-deriver";
import {
  COMMITMENT,
  ENDPOINT_PROGRAM_ID,
  TREASURY_SECRET_KEY,
} from "./config/constants";

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
  };
  let endpoint: EndpointProgram.Endpoint;
  const otcPdaDeriver = new OtcPdaDeriver(programId);

  before(async () => {
    accounts = {
      otcConfig: otcPdaDeriver.config(),
      endpoint: new PublicKey(ENDPOINT_PROGRAM_ID),
      treasury: Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey,
      escrow: otcPdaDeriver.escrow(),
    };

    endpoint = new EndpointProgram.Endpoint(accounts.endpoint);
  });

  it("should log solana peer", async () => {
    console.log(hexlify(accounts.otcConfig.toBytes()));
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
