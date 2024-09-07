export const ENDPOINT_PROGRAM_ID =
  "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";

export const TREASURY_SECRET_KEY = Uint8Array.from([
  128, 26, 222, 230, 130, 216, 47, 240, 172, 56, 213, 131, 52, 132, 39, 203,
  102, 172, 50, 92, 57, 198, 248, 132, 75, 166, 96, 17, 100, 35, 62, 255, 223,
  43, 227, 160, 84, 14, 214, 66, 8, 189, 75, 172, 108, 50, 236, 247, 173, 147,
  243, 60, 212, 163, 223, 37, 234, 162, 211, 245, 61, 253, 139, 80,
]);

export const PEER = "0x8b15355c1BFA15eB0c2D2FB4C7AfD7bA8AE548Cd";

export const COMMITMENT = "confirmed";

enum Token {
  SOL,
  SPL,
  ERC20,
  ETH,
}

const Decimals = {
  SOL: 9,
  SPL: 6,
  ERC20: 18,
  ETH: 18,
  SD: 6,
} as const;

const ExchangeRates = {
  OneToOne: 1 * 10 ** Decimals.SD,
  OneToTwo: 0.5 * 10 ** Decimals.SD,
} as const;

const AmountsLD = {
  // 0.123
  SOL: 123000,
  SPL: 123,
  ERC20: 123_000_000_000_000,
  ETH: 123_000_000_000_000,
} as const;

export { Decimals, ExchangeRates, AmountsLD, Token };
