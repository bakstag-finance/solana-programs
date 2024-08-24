import { PublicKey } from "@solana/web3.js";
import { BN, Program, IdlTypes } from "@coral-xyz/anchor";
import { OtcMarket } from "../../target/types/otc_market";

export type AcceptOfferParams = IdlTypes<OtcMarket>["AcceptOfferParams"];
