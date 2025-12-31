export interface DynamicConstants {
  DYN_DISCOUNT_BASE_PRICE: number;
  DYN_DISCOUNT_MIN_PERCENT: number; // 0.03
  DYN_DISCOUNT_MAX_PERCENT: number; // 0.10
}

export function calculateDynamicRequiredPercent(
  refPriceUsd: number,
  constants: DynamicConstants
): number {
  const {
    DYN_DISCOUNT_BASE_PRICE,
    DYN_DISCOUNT_MIN_PERCENT,
    DYN_DISCOUNT_MAX_PERCENT,
  } = constants;
  const MAX_PRICE_FLOAT = 100000.0;

  const lowLog = Math.log(Math.max(1.0, DYN_DISCOUNT_BASE_PRICE));
  const highLog = Math.log(
    Math.max(DYN_DISCOUNT_BASE_PRICE + 1.0, MAX_PRICE_FLOAT)
  );
  const curLog = Math.log(Math.max(DYN_DISCOUNT_BASE_PRICE, refPriceUsd));

  let t = 0.0;
  if (highLog !== lowLog) {
    t = (curLog - lowLog) / (highLog - lowLog);
  }
  t = Math.max(0.0, Math.min(1.0, t));

  const reqPercent =
    DYN_DISCOUNT_MAX_PERCENT -
    (DYN_DISCOUNT_MAX_PERCENT - DYN_DISCOUNT_MIN_PERCENT) * t;
  return reqPercent;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
