import { PublicKey } from "@solana/web3.js";

const NATIVE_ADDRESS = Array.from(PublicKey.default.toBytes());

export function isNativeToken(tokenAddress: number[] | Uint8Array): boolean {
  return tokenAddress.toString() === NATIVE_ADDRESS.toString();
}
