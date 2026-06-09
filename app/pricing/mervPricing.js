import prisma from "../lib/prisma.server";

/**
 * Normalize dimensions so width >= length
 */

function normalizeDimensions(length, width) {
  if (width < length) {
    return { length: width, width: length };
  }
  return { length, width };
}

/**
 * Calculate base unit cost (pre-pack, pre-discount)
 *
 * Cost matrix updated January 2026 from FMI price sheet "A" column (dealer cost).
 * Small = max(width, length) <= 23.5". Large = any dimension > 23.5".
 * Buckets with no FMI catalog data (custom large cuts ≥800 sq in) retain
 * prior cost estimates.
 */

function getCostMerv({ length, width, depth, quality }) {
  const area = Math.round(length * width);

  let mervCode;
  if (quality === 8) mervCode = "DQPA40";
  if (quality === 11) mervCode = "MQPA";
  if (quality === 13) mervCode = "GQPA";

  let price = 0;

  if (mervCode === "DQPA40") {
    // Small: both dimensions <= 23.5" (width = larger dim after normalization)
    if (length <= 29.5 && width <= 23.5) {
      if (area >= 36 && area <= 199)
        price = { 1: 3.51, 2: 4.11, 4: 6.09 }[depth];
      else if (area <= 299)
        price = { 1: 3.89, 2: 4.61, 4: 7.33 }[depth];
      else if (area <= 399)
        price = { 1: 4.06, 2: 4.69, 4: 7.02 }[depth];
      else if (area <= 499)
        price = { 1: 3.89, 2: 4.13, 4: 7.32 }[depth];
      else if (area <= 599)
        price = { 1: 4.71, 2: 5.94, 4: 10.19 }[depth];
      else if (area <= 699)
        price = { 1: 4.95, 2: 6.29, 4: 10.77 }[depth];
      else
        price = { 1: 5.23, 2: 6.64, 4: 11.38 }[depth];
    } else {
      // Large: any dimension > 23.5"
      if (area <= 399)
        price = { 1: 4.66, 2: 5.62, 4: 6.47 }[depth];
      else if (area <= 599)
        price = { 1: 4.36, 2: 4.81, 4: 8.43 }[depth];
      else if (area <= 799)
        price = { 1: 5.49, 2: 7.73, 4: 17.45 }[depth];
      else if (area <= 999)
        price = { 1: 8.78, 2: 10.91, 4: 19.25 }[depth];
      else if (area <= 1199)
        price = { 1: 9.42, 2: 11.90, 4: 20.39 }[depth];
      else if (area <= 1399)
        price = { 1: 9.91, 2: 12.58, 4: 21.55 }[depth];
      else
        price = { 1: 10.88, 2: 13.73, 4: 22.63 }[depth];
    }
  }

  if (mervCode === "MQPA") {
    if (length <= 29.5 && width <= 23.5) {
      if (area <= 199)
        price = { 1: 5.20, 2: 6.22, 4: 9.31 }[depth];
      else if (area <= 299)
        price = { 1: 5.97, 2: 7.32, 4: 11.19 }[depth];
      else if (area <= 399)
        price = { 1: 5.74, 2: 6.49, 4: 11.36 }[depth];
      else if (area <= 499)
        price = { 1: 6.00, 2: 6.67, 4: 12.97 }[depth];
      else if (area <= 599)
        price = { 1: 7.20, 2: 9.08, 4: 15.57 }[depth];
      else if (area <= 699)
        price = { 1: 7.57, 2: 9.61, 4: 16.46 }[depth];
      else
        price = { 1: 8.00, 2: 10.15, 4: 17.38 }[depth];
    } else {
      if (area <= 399)
        price = { 1: 7.35, 2: 7.40, 4: 18.60 }[depth];
      else if (area <= 599)
        price = { 1: 6.72, 2: 7.87, 4: 14.88 }[depth];
      else if (area <= 799)
        price = { 1: 9.67, 2: 11.70, 4: 26.65 }[depth];
      else if (area <= 999)
        price = { 1: 13.42, 2: 16.67, 4: 29.41 }[depth];
      else if (area <= 1199)
        price = { 1: 14.40, 2: 18.17, 4: 31.15 }[depth];
      else if (area <= 1399)
        price = { 1: 15.14, 2: 19.22, 4: 32.93 }[depth];
      else
        price = { 1: 16.62, 2: 20.95, 4: 34.59 }[depth];
    }
  }

  if (mervCode === "GQPA") {
    if (length <= 29.5 && width <= 23.5) {
      if (area <= 199)
        price = { 1: 6.93, 2: 8.29, 4: 11.79 }[depth];
      else if (area <= 299)
        price = { 1: 7.96, 2: 9.76, 4: 14.04 }[depth];
      else if (area <= 399)
        price = { 1: 7.66, 2: 9.51, 4: 13.36 }[depth];
      else if (area <= 499)
        price = { 1: 8.00, 2: 8.89, 4: 15.26 }[depth];
      else if (area <= 599)
        price = { 1: 8.64, 2: 11.50, 4: 0 }[depth];
      else if (area <= 699)
        price = { 1: 9.08, 2: 12.15, 4: 0 }[depth];
      else
        price = { 1: 9.60, 2: 12.79, 4: 0 }[depth];
    } else {
      if (area <= 399)
        price = { 1: 8.83, 2: 9.87, 4: 23.57 }[depth];
      else if (area <= 599)
        price = { 1: 8.96, 2: 10.49, 4: 17.29 }[depth];
      else if (area <= 799)
        price = { 1: 12.90, 2: 14.69, 4: 33.22 }[depth];
      else if (area <= 999)
        price = { 1: 16.10, 2: 21.23, 4: 36.53 }[depth];
      else if (area <= 1199)
        price = { 1: 17.28, 2: 23.01, 4: 38.59 }[depth];
      else if (area <= 1399)
        price = { 1: 18.17, 2: 24.29, 4: 0 }[depth];
      else
        price = { 1: 19.95, 2: 25.58, 4: 0 }[depth];
    }
  }

  return price || 0;
}

export async function calculateMervPrice({
  length,
  width,
  depth,
  quality,
  packSize = 12
}) {
  const normalized = normalizeDimensions(length, width);
  const cost = getCostMerv({ ...normalized, depth, quality });

  if (!cost || cost === 0) return null;

  const settings = await prisma.pricingSettings.findUnique({
    where: { id: 1 }
  });

  const discountFactor = settings?.discountFactor ?? 0.61;

  const retail12 = (cost * 12) / discountFactor;

  let finalPrice;

  if (packSize === 12) {
    finalPrice = retail12;
  } else if (packSize === 4) {
    finalPrice = (retail12 / 12) * 4;
  } else {
    finalPrice = (retail12 / 12) * packSize;
  }

  return Number(finalPrice.toFixed(2));
}