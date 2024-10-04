export function getDecimalsConversionRate(
  localDecimals,
  sharedDecimals,
): Number {
  return 10 ** (localDecimals - sharedDecimals);
}

export function ld2sd(
  amountLd: Number,
  decimalsConversionrate: Number,
): Number {
  return amountLd.valueOf() / decimalsConversionrate.valueOf();
}
