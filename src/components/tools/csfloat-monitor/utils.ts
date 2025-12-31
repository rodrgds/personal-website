export interface DynamicConstants {
  DYN_DISCOUNT_BASE_PRICE: number;
  DYN_DISCOUNT_MIN_PERCENT: number; // 0.03
  DYN_DISCOUNT_MAX_PERCENT: number; // 0.10
  DYN_MAX_PRICE?: number;
}

export function calculateDynamicRequiredPercent(
  refPriceUsd: number,
  constants: DynamicConstants
): number {
  const {
    DYN_DISCOUNT_BASE_PRICE,
    DYN_DISCOUNT_MIN_PERCENT,
    DYN_DISCOUNT_MAX_PERCENT,
    DYN_MAX_PRICE = 100000.0,
  } = constants;
  
  const lowLog = Math.log(Math.max(1.0, DYN_DISCOUNT_BASE_PRICE));
  const highLog = Math.log(
    Math.max(DYN_DISCOUNT_BASE_PRICE + 1.0, DYN_MAX_PRICE)
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
