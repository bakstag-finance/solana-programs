import {
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  Mint,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  Connection,
} from "@solana/web3.js";
import {
  ENDPOINT_PROGRAM_ID,
  LD_SPL,
  TOP_UP_AMOUNT,
  TREASURY_SECRET_KEY,
} from "./constants";

export class Accounts {
  otcConfig: PublicKey;
  escrow: PublicKey;
  treasury: PublicKey;
  srcToken: PublicKey;
  dstToken: PublicKey;
  srcSeller: Keypair;
  srcBuyer: Keypair;
  dstSeller: Keypair;
  dstBuyer: Keypair;
  srcEscrowAta: PublicKey;
  dstEscrowAta: PublicKey;
  srcTreasuryAta: PublicKey;
  dstTreasuryAta: PublicKey;
  srcSellerAta: PublicKey;
  srcBuyerAta: PublicKey;
  dstSellerAta: PublicKey;
  dstBuyerAta: PublicKey;
  endpoint: PublicKey;
  oappRegistry: PublicKey;
  eventAuthority: PublicKey;
  endpointSetting: PublicKey;
}

export async function generateAccounts(
  connection: Connection,
  programId: PublicKey,
  payer: Keypair,
): Promise<
  Omit<
    Accounts,
    "endpoint" | "oappRegistry" | "eventAuthority" | "endpointSetting"
  >
> {
  const treasury = Keypair.fromSecretKey(TREASURY_SECRET_KEY).publicKey;
  const srcSeller = Keypair.generate();
  const dstSeller = Keypair.generate();
  const srcBuyer = Keypair.generate();
  const dstBuyer = Keypair.generate();

  const [otcConfig, ____] = PublicKey.findProgramAddressSync(
    [Buffer.from("Otc", "utf8")],
    programId,
  );

  const [escrow, ___] = PublicKey.findProgramAddressSync(
    [Buffer.from("Escrow", "utf8")],
    programId,
  );

  const srcToken = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    LD_SPL,
  );
  const dstToken = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    LD_SPL,
  );

  const srcSellerAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      srcToken,
      srcSeller.publicKey,
    )
  ).address;

  const srcBuyerAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      srcToken,
      dstBuyer.publicKey,
    )
  ).address;

  const dstSellerAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      dstToken,
      dstSeller.publicKey,
    )
  ).address;

  const dstBuyerAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      dstToken,
      dstBuyer.publicKey,
    )
  ).address;

  const srcEscrowAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      srcToken,
      escrow,
      true,
    )
  ).address;
  const dstEscrowAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      dstToken,
      escrow,
      true,
    )
  ).address;
  const srcTreasuryAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      srcToken,
      treasury,
    )
  ).address;
  const dstTreasuryAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      dstToken,
      treasury,
    )
  ).address;

  return {
    otcConfig,
    escrow,
    treasury,
    srcToken,
    dstToken,
    srcSeller,
    srcBuyer,
    dstSeller,
    dstBuyer,
    srcEscrowAta,
    dstEscrowAta,
    srcTreasuryAta,
    dstTreasuryAta,
    srcSellerAta,
    srcBuyerAta,
    dstSellerAta,
    dstBuyerAta,
  };
}

export async function topUp(
  accounts: Accounts,
  connection: Connection,
  payer: Keypair,
) {
  await transferSol(
    connection,
    payer,
    accounts.srcSeller.publicKey,
    TOP_UP_AMOUNT,
  );
  await transferSol(
    connection,
    payer,
    accounts.dstSeller.publicKey,
    TOP_UP_AMOUNT,
  );
  await transferSol(
    connection,
    payer,
    accounts.dstBuyer.publicKey,
    TOP_UP_AMOUNT,
  );
}

export async function transferSol(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  lamports: Number,
) {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: BigInt(lamports.valueOf()),
    }),
  );
  await sendAndConfirmTransaction(connection, transaction, [from]);
}
