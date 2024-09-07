import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OtcMarket } from "../../../target/types/otc_market";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import transferSol from "./transfer";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { OtcPdaDeriver } from "./otc-pda-deriver";
import { OtcTools } from "./otc-tools";
import { EndpointId } from "@layerzerolabs/lz-definitions";

export class Otc {
  program: Program<OtcMarket>;
  connection: Connection;
  payer: Keypair;

  deriver: OtcPdaDeriver;

  constructor(
    program: Program<OtcMarket>,
    connection: Connection,
    payer: Keypair,
  ) {
    this.program = program;
    this.connection = connection;
    this.payer = payer;

    this.deriver = new OtcPdaDeriver(program.programId);
  }

  async createOffer(
    params: anchor.IdlTypes<OtcMarket>["CreateOfferParams"],
    seller: Keypair,
    srcTokenMint: PublicKey | null = null, // required for src spl token
  ): Promise<[PublicKey, number[]]> {
    const otcConfig = this.deriver.config();

    const escrow = this.deriver.escrow();

    const offerPromise = OtcTools.getOfferFromParams(
      this.program,
      Array.from(seller.publicKey.toBytes()),
      EndpointId.SOLANA_V2_TESTNET,
      params.dstEid,
      srcTokenMint
        ? Array.from(srcTokenMint.toBytes())
        : Array.from(PublicKey.default.toBytes()),
      params.dstTokenAddress,
      params.exchangeRateSd,
    );

    const srcEscrowAtaPromise = srcTokenMint
      ? getOrCreateAssociatedTokenAccount(
          this.connection,
          seller,
          srcTokenMint,
          seller.publicKey,
          true,
        ).then((account) => account.address)
      : Promise.resolve(null);

    const srcSellerAtaPromise = srcTokenMint
      ? getOrCreateAssociatedTokenAccount(
          this.connection,
          seller,
          srcTokenMint,
          seller.publicKey,
        ).then((account) => account.address)
      : Promise.resolve(null);

    const [offer, srcEscrowAta, srcSellerAta] = await Promise.all([
      offerPromise,
      srcEscrowAtaPromise,
      srcSellerAtaPromise,
    ]);

    await this.program.methods
      .createOffer(params)
      .accounts({
        seller: seller.publicKey,
        offer: offer[0],
        otcConfig,
        escrow,
        srcTokenMint, // required for src spl token
        srcSellerAta, // required for src spl token
        srcEscrowAta, // required for src spl token
      })
      .signers([seller])
      .rpc();

    return offer;
  }
}
