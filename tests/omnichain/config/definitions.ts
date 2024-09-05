export const ENDPOINT_PROGRAM_ID =
  "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";

export const TREASURY_SECRET_KEY = Uint8Array.from([
  128, 26, 222, 230, 130, 216, 47, 240, 172, 56, 213, 131, 52, 132, 39, 203,
  102, 172, 50, 92, 57, 198, 248, 132, 75, 166, 96, 17, 100, 35, 62, 255, 223,
  43, 227, 160, 84, 14, 214, 66, 8, 189, 75, 172, 108, 50, 236, 247, 173, 147,
  243, 60, 212, 163, 223, 37, 234, 162, 211, 245, 61, 253, 139, 80,
]);

const Decimals = {
  SOL: 9,
  SPL: 6,
  ERC20: 18,
  ETH: 18,
  SD: 6,
} as const;

// Define constants for exchange rates
const ExchangeRates = {
  OneToOne: 1 * 10 ** Decimals.SD,
  OneToTwo: 0.5 * 10 ** Decimals.SD,
} as const;

// Define constants for amounts
const Amounts = {
  SOL: 1 * 10 ** Decimals.SOL,
} as const;

export { Decimals, ExchangeRates, Amounts };
