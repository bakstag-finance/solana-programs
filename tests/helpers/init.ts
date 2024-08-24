import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";

import { ENDPOINT_PROGRAM_ID } from "./constants";
import { OtcMarket } from "../../target/types/otc_market";

export async function initOtc(
  program: Program<OtcMarket>,
  config: PublicKey,
  escrow: PublicKey,
  treasury: PublicKey,
  payer: Keypair
) {
  await program.methods
    .initialize({
      endpointProgram: new PublicKey(ENDPOINT_PROGRAM_ID),
      treasury: treasury,
    })
    .accounts({
      payer: payer.publicKey,
      otcConfig: config,
      escrow: escrow,
    })
    .signers([payer])
    .rpc();
}
