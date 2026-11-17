/**
 * Dealer cost lookups from the FMI January 2026 price sheet (column "A").
 *
 * Used only as a FLOOR in pricingEngine: retail is never below
 * (this cost / 0.7), and never below the flat retail already charged. See
 * calculatePrice. Update these tables when FMI issues a new sheet.
 *
 * Pad lines: orange/white 6-pad series (11OW) for 3/4" and 1". The sheet has
 * no orange/white 6-pad 2" item, so 2" uses the 1114 blue/white 6-pad items.
 *
 * Practical pleat: MERV 11, 5" (PP11). Standard sizes match by exact size in
 * either orientation; every other size uses the non-standard (NS5) area tier.
 * The sheet also lists "DBL N/S" tiers whose meaning is unconfirmed; they are
 * NOT used, so very large non-standard sizes may cost more than this assumes.
 * Practical pleat is sold as a 2-pack, so cost is 2 x the per-filter cost.
 */

// Area tiers (square inches): up to 249, up to 499, up to 720, above 720.
function areaTier(length, width) {
  const area = Math.round(length * width);
  if (area <= 249) return 0;
  if (area <= 499) return 1;
  if (area <= 720) return 2;
  return 3;
}

const PADFRAME_COST = {
  "0.75": [28.58, 42.47, 48.56, 54.39],
  "1": [29.86, 45.14, 50.97, 57.09],
  "2": [44.79, 55.06, 57.16, 64.02],
};

const PAD_REFILL_COST = {
  "0.75": [15.52, 17.63, 19.72, 22.09],
  "1": [15.52, 17.63, 19.72, 22.09],
  "2": [15.55, 17.09, 25.85, 28.96],
};

const PRACTICAL_PLEAT_STANDARD = {
  "12x12": 30.31,
  "12x20": 42.86,
  "12x24": 31.56,
  "12x30": 45.07,
  "12x36": 60.17,
  "14x14": 41.21,
  "14x20": 42.86,
  "14x24": 45.06,
  "14x25": 32.95,
  "14x30": 33.81,
  "14x36": 60.17,
  "16x16": 42.86,
  "16x20": 34.88,
  "16x24": 45.06,
  "16x25": 36.38,
  "16x30": 45.43,
  "16x36": 60.17,
  "18x18": 45.06,
  "18x24": 36.38,
  "18x30": 46.68,
  "18x36": 66.87,
  "20x20": 36.38,
  "20x24": 37.90,
  "20x25": 37.90,
  "20x30": 40.75,
  "20x36": 66.87,
  "24x24": 40.75,
  "24x30": 41.71,
  "24x36": 73.88,
  "25x25": 66.87,
  "25x32": 45.03,
  "30x30": 73.88,
};

// Non-standard tiers by area: 36-199, 200-299, 300-399, 400-499, 500-599, 600-699, 700+
const PRACTICAL_PLEAT_NS = [41.21, 42.86, 45.06, 45.43, 46.68, 60.28, 68.21];

const PRACTICAL_PLEAT_PACK = 2;

export function padframeSheetCost({ length, width, depth }) {
  const row = PADFRAME_COST[String(depth)];
  return row ? row[areaTier(length, width)] : null;
}

export function padRefillSheetCost({ length, width, depth }) {
  const row = PAD_REFILL_COST[String(depth)];
  return row ? row[areaTier(length, width)] : null;
}

export function practicalPleatSheetCost({ length, width }) {
  const [short, long] = length <= width ? [length, width] : [width, length];
  const standard = PRACTICAL_PLEAT_STANDARD[`${short}x${long}`];
  let perFilter = standard;
  if (perFilter == null) {
    const area = Math.round(length * width);
    const bounds = [199, 299, 399, 499, 599, 699];
    let i = bounds.findIndex((b) => area <= b);
    if (i === -1) i = 6;
    perFilter = PRACTICAL_PLEAT_NS[i];
  }
  return Number((perFilter * PRACTICAL_PLEAT_PACK).toFixed(2));
}

export function sheetCostFor(category, spec) {
  switch (category) {
    case "padframe":
      return padframeSheetCost(spec);
    case "pad":
      return padRefillSheetCost(spec);
    case "practical_pleat":
      return practicalPleatSheetCost(spec);
    default:
      return null;
  }
}
