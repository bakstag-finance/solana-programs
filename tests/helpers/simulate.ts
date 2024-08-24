import { SimulatedTransactionResponse } from "@solana/web3.js";

export class SimulateError extends Error {
  constructor(
    readonly simulationResponse: SimulatedTransactionResponse,
    message?: string,
  ) {
    super(message);
  }
}
