import * as anchor from "@coral-xyz/anchor";
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

  peer(dstEid: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("Peer", "utf8"),
        this.config().toBytes(),
        new anchor.BN(dstEid).toArrayLike(Buffer, "be", 4),
      ],
      this.programId,
    )[0];
  }

  enforcedOptions(dstEid: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("EnforcedOptions", "utf8"),
        this.config().toBytes(),
        new anchor.BN(dstEid).toArrayLike(Buffer, "be", 4),
      ],
      this.programId,
    )[0];
  }
}
