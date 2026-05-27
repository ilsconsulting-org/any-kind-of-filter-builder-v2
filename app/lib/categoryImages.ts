// app/lib/categoryImages.ts
//
// Maps each filter category (and MERV quality) to its hero product image
// hosted on the v2 dev store's Shopify CDN. Used by shopifyProductCreator
// to attach the correct image when a filter is dynamically created.
//
// Replaces the Rails Category model's `images` text field. Adding images
// to Shopify Files is a one-click admin action, so updating any of these
// URLs only requires re-uploading and editing this file.

import type { ValidatedFilter } from "./filterValidator";

const IMAGE_URLS = {
  pad: "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Pad_Refills_Product.png?v=1778310091",
  padframe:
    "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Pad_and_Frame_Product.png?v=1778310090",
  practical_pleat:
    "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Practical_Pleated_Product.png?v=1778310607",
  electro_perm_washable:
    "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Washable_Permanent_Filter_Product.png?v=1778310091",
  "merv-8":
    "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Standard_Pleated_Filter_MERV_8.png?v=1778313168",
  "merv-11":
    "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Standard_Pleated_Filter_MERV_11.png?v=1778313168",
  "merv-13":
    "https://cdn.shopify.com/s/files/1/0755/1510/1356/files/Standard_Pleated_Filter_MERV_13.png?v=1778313168",
} as const;

/**
 * Resolve the hero image URL for a validated filter spec.
 * For MERV products, returns the quality-specific image so the
 * box rating shown in the product photo matches the filter sold.
 */
export function getCategoryImageUrl(filter: ValidatedFilter): string | null {
  if (filter.category === "merv") {
    if (!filter.quality) return null;
    const key = `merv-${filter.quality}` as keyof typeof IMAGE_URLS;
    return IMAGE_URLS[key] ?? null;
  }
  return IMAGE_URLS[filter.category as keyof typeof IMAGE_URLS] ?? null;
}
