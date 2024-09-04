import { PublicKey } from "@solana/web3.js";

export class OtcPdaDeriver {
  programId: PublicKey;

  constructor(programId: PublicKey) {
    this.programId = programId;
  }

  config(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("Otc", "utf8")],
      this.programId,
    )[0];
  }

  escrow(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("Escrow", "utf8")],
      this.programId,
    )[0];
  }
}

// export function deriveOtcAccounts(programId: PublicKey): {} {
//   const treasury = Keypair.generate().publicKey;

//   const [escrow, ___] = PublicKey.findProgramAddressSync(
//     [Buffer.from("Escrow", "utf8")],
//     programId,
//   );

//   const endpoint = new PublicKey(ENDPOINT_PROGRAM_ID);

//   return {
//     otcConfig,
//     escrow,
//     treasury,
//     endpoint,
//   };
// }
