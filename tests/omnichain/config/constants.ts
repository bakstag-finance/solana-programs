export const SD = 6;
export const LD_SPL = 6;
export const LD_NATIVE = 9;
export const EXCHANGE_RATE_SD = 1 * 10 ** SD;

export const SRC_EID = 40168;
export const DST_EID = 40168;

export class MINT_AMOUNTS {}

export class CREATE_OFFER_AMOUNTS {
  public static readonly srcAmountLdNative = 1 * 10 ** LD_NATIVE;
  public static readonly srcAmountLdSpl = 1 * 10 ** LD_SPL;
  public static readonly srcAmountSd = 1 * 10 ** SD;
}
export class ACCEPT_OFFER_AMOUNTS {
  public static readonly srcAmountSd = 0.5 * 10 ** SD;
  public static readonly srcAmountLdNative = 0.5 * 10 ** LD_NATIVE;
  public static readonly srcAmountLdSpl = 0.5 * 10 ** LD_SPL;

  public static readonly dstAmountSd = 0.5 * 10 ** SD;
  public static readonly dstAmountLdNative = 0.5 * 10 ** LD_NATIVE;
  public static readonly dstAmountLdSpl = 0.5 * 10 ** LD_SPL;

  public static readonly dstFeeAmountLdNative = this.dstAmountLdNative / 100;
  public static readonly dstFeeAmountLdSpl = this.dstAmountLdSpl / 100;
}

export const TOP_UP_AMOUNT = 10 ** LD_NATIVE;
export const ENDPOINT_PROGRAM_ID =
  "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";

export const TREASURY_SECRET_KEY = Uint8Array.from([
  128, 26, 222, 230, 130, 216, 47, 240, 172, 56, 213, 131, 52, 132, 39, 203,
  102, 172, 50, 92, 57, 198, 248, 132, 75, 166, 96, 17, 100, 35, 62, 255, 223,
  43, 227, 160, 84, 14, 214, 66, 8, 189, 75, 172, 108, 50, 236, 247, 173, 147,
  243, 60, 212, 163, 223, 37, 234, 162, 211, 245, 61, 253, 139, 80,
]);
