// app/lib/handleGenerator.ts
//
// Generates canonical Shopify product handles and SKUs for Any Kind of Filter.
// Mirrors the Rails Product#set_handle and Product#sku logic so v2 can
// resolve the same handles that already exist in production Shopify.

import type { ValidatedFilter } from "./filterValidator";

/**
 * Format a dimension number for use in handles and SKUs.
 *
 * Mirrors the Ruby `Numeric#simplify` extension used in the Rails app:
 *   - Whole numbers render as integers ("20", not "20.0")
 *   - Non-whole numbers render as decimals ("20.5")
 *
 * Dots are replaced with hyphens later by the handle/sku composer.
 */
function formatDimension(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }
  // Strip insignificant trailing zeros while keeping the decimal portion.
  return String(parseFloat(n.toFixed(8)));
}

/**
 * Generate the SKU for a filter (matches Rails Product#sku).
 */
export function generateSku(filter: ValidatedFilter): string {
  const { category, mervCode, length, width, depth } = filter;
  const dims = `${formatDimension(length)}${formatDimension(width)}${formatDimension(depth)}`;
  if (category === "merv") {
    return `${mervCode}${dims}`;
  }
  return `${category}-${dims}`;
}

/**
 * Generate the canonical Shopify handle for a filter.
 * Matches Rails Product#set_handle:
 *   merv:   "merv-{quality}-pleated-air-filter-{sku}"
 *   others: "akf-{sku}"
 * Then replaces dots and underscores with hyphens.
 */
export function generateHandle(filter: ValidatedFilter): string {
  const sku = generateSku(filter);
  const raw =
    filter.category === "merv"
      ? `merv-${filter.quality}-pleated-air-filter-${sku}`
      : `akf-${sku}`;
  return raw.replace(/\./g, "-").replace(/_/g, "-");
}

/**
 * Generate the human-readable title (matches Rails Product#set_title).
 */
export function generateTitle(filter: ValidatedFilter): string {
  const dims = `${formatDimension(filter.length)}" x ${formatDimension(filter.width)}" x ${formatDimension(filter.depth)}"`;
  switch (filter.category) {
    case "merv":
      return `Merv ${filter.quality} Pleated Air Filter - ${dims}`;
    case "padframe":
      return `Pad and Frame Air Filter (1 Frame and 6 Pads) - ${dims}`;
    case "pad":
      return `Pad Refills (Pack of 6 Pads) - ${dims}`;
    case "electro_perm_washable":
      return `A+2000 Washable Electrostatic Permanent Custom Air Filter - ${dims}`;
    case "practical_pleat":
      return `Practical Pleated Air Filter (2-Pack) - ${dims}`;
  }
}

// Product type and vendor are now sourced from app/lib/categoryContent.ts
// so they stay aligned with the new website's catalog conventions and
// the smart-collection conditions (e.g., "Standard Pleated Air Filters").
