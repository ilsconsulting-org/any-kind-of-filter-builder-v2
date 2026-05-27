// app/lib/categoryContent.ts
//
// Per-category content bundles: product type, vendor, description HTML,
// tags, and SEO copy. Templates are derived from the canonical product
// listings already imported in the new website's Shopify catalog
// (products_export_1-2.csv) so dynamically-created products match the
// hand-curated catalog conventions.

import type { ValidatedFilter } from "./filterValidator";

export interface CategoryContent {
  productType: string;
  vendor: string;
  descriptionHtml: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

const VENDOR = "Any Kind of Filter";

function formatDim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(8)));
}

/** Lowercase x-separated dimensions for display: "20x20x1". */
function dimsDisplay(filter: ValidatedFilter): string {
  return `${formatDim(filter.length)}x${formatDim(filter.width)}x${formatDim(filter.depth)}`;
}

/** Uppercase X-separated dimensions for tags: "20X20X1". */
function dimsTag(filter: ValidatedFilter): string {
  return dimsDisplay(filter).toUpperCase();
}

export function getCategoryContent(filter: ValidatedFilter): CategoryContent {
  const dims = dimsDisplay(filter);
  const dimsT = dimsTag(filter);

  if (filter.category === "merv") {
    const merv = filter.quality;
    return {
      productType: "Standard Pleated Air Filters",
      vendor: VENDOR,
      descriptionHtml: `<p>Designed for dependable everyday HVAC filtration, MERV ${merv} Standard Pleated Air Filters help capture airborne particles such as dust, pollen, lint, pet dander, and household debris while supporting proper airflow and HVAC system performance.</p>
<p>These disposable pleated air filters are built for residential and light commercial HVAC systems requiring reliable filtration without restricting airflow. The pleated media design increases surface area compared to basic fiberglass filters, helping improve particle capture efficiency while maintaining consistent system operation.</p>
<p>Ideal for routine HVAC maintenance and indoor air quality support, these filters help protect heating and cooling equipment from unnecessary dust buildup and airborne contaminants.</p>
<p>Features:<br>• MERV ${merv} pleated filtration media<br>• Helps capture dust, pollen, lint, and airborne particles<br>• Supports HVAC airflow efficiency<br>• Disposable replacement design<br>• Durable frame construction<br>• Residential and light commercial HVAC applications<br>• Helps protect HVAC equipment from airborne debris<br>• Designed for dependable everyday filtration performance</p>`,
      tags: [
        dimsT,
        "Air Filter",
        "Central Air Filter",
        "Disposable",
        "HVAC Filter",
        `MERV ${merv}`,
        "Pleated",
        "Replacement",
        "Residential",
        "Standard Filtration",
        "Standard Pleated",
      ],
      seoTitle: `${dims} MERV ${merv} Standard Pleated Air Filters | AKF`,
      seoDescription: `Shop ${dims} MERV ${merv} standard pleated air filters for dependable HVAC filtration and system protection.`,
    };
  }

  if (filter.category === "padframe") {
    return {
      productType: "Pad and Frame Air Filters",
      vendor: VENDOR,
      descriptionHtml: `<p>Pad and Frame Air Filters provide a reusable filtration solution for residential and light commercial HVAC systems. The frame holds replaceable filter pads that capture dust and airborne particles while supporting consistent airflow performance.</p>
<p>This system offers an economical and environmentally conscious filtration option since the frame is reused and only the pads require replacement. Ideal for HVAC applications where ongoing filtration maintenance is preferred over disposable filter replacement cycles.</p>
<p>Features:<br>• Reusable frame with replaceable filter pads<br>• Helps capture dust and airborne particles<br>• Supports HVAC airflow efficiency<br>• Economical long-term filtration solution<br>• Residential and light commercial applications<br>• Easy pad replacement<br>• Durable frame construction</p>`,
      tags: [
        dimsT,
        "Air Filter",
        "Commercial",
        "HVAC Filter",
        "Pad and Frame",
        "Reusable",
        "Residential",
      ],
      seoTitle: `${dims} Pad and Frame Air Filter | AKF`,
      seoDescription: `Shop ${dims} pad and frame air filters designed for reusable HVAC filtration with replaceable pad media for dependable airflow performance.`,
    };
  }

  if (filter.category === "pad") {
    return {
      productType: "Pad and Frame Air Filters",
      vendor: VENDOR,
      descriptionHtml: `<p>Replacement pad refills designed for pad and frame HVAC filtration systems.</p>
<p>These replacement pads help maintain airflow performance and airborne particle capture while extending the usability of reusable pad and frame filter assemblies.</p>
<p>Ideal for residential and light commercial HVAC maintenance applications requiring economical replacement filtration media.</p>
<p>Features:<br>• Replacement media for pad and frame systems<br>• Helps maintain HVAC airflow performance<br>• Economical replacement solution<br>• Easy to install<br>• Designed for residential and light commercial use<br>• Helps capture dust and airborne particles<br>• Compatible with reusable frame systems</p>`,
      tags: [
        dimsT,
        "Commercial",
        "HVAC Filter",
        "Pad and Frame",
        "Pad Refill",
        "Replacement",
        "Residential",
      ],
      seoTitle: `${dims} Pad Refills for HVAC Air Filters | AKF`,
      seoDescription: `Shop ${dims} replacement pad refills for pad and frame HVAC filtration systems designed to support airflow performance and economical filter maintenance.`,
    };
  }

  if (filter.category === "electro_perm_washable") {
    return {
      productType: "Electrostatic Washable Air Filters",
      vendor: VENDOR,
      descriptionHtml: `<p>The A+2000 Washable Electrostatic Permanent Air Filter is designed for long-term HVAC filtration performance with reusable electrostatic filtration technology.</p>
<p>Built for residential and light commercial HVAC systems, these permanent washable filters help capture airborne dust, lint, pollen, and larger airborne particles while supporting dependable airflow throughout your system.</p>
<p>Unlike disposable filters, the A+2000 filter is washable and reusable, helping reduce replacement frequency while providing long-term filtration performance.</p>
<p>Ideal for customers looking for reusable HVAC filtration solutions and custom sizing flexibility.</p>
<p>Features:<br>• Washable and reusable electrostatic filtration<br>• Permanent filter design<br>• Supports HVAC airflow performance<br>• Durable aluminum frame construction<br>• Helps capture airborne dust and particles<br>• Residential and light commercial applications<br>• Custom sizing available<br>• Long-term reusable filtration solution</p>`,
      tags: [
        dimsT,
        "Commercial",
        "Custom Size",
        "Electrostatic",
        "HVAC Filter",
        "Permanent",
        "Residential",
        "Washable",
      ],
      seoTitle: `${dims} A+2000 Washable Electrostatic Permanent Air Filter | AKF`,
      seoDescription: `Shop ${dims} A+2000 washable electrostatic permanent air filters designed for reusable HVAC filtration, dependable airflow performance, and custom sizing applications.`,
    };
  }

  if (filter.category === "practical_pleat") {
    return {
      productType: "Practical Pleated Air Filters",
      vendor: VENDOR,
      descriptionHtml: `<p>High-capacity practical pleated air filters designed to support improved airflow, extended service life, and dependable HVAC system performance.</p>
<p>These deeper pleated filters provide increased media surface area compared to standard 1-inch filters, helping capture airborne particles while supporting efficient airflow throughout residential and light commercial HVAC systems.</p>
<p>Ideal for systems requiring 5-inch filtration.</p>
<p>Features:<br>• High-capacity pleated media<br>• Extended filter life<br>• Improved airflow support<br>• Durable frame construction<br>• Helps reduce airborne dust and particles<br>• Designed for residential and light commercial HVAC systems<br>• Sold as a 2-pack</p>`,
      tags: [
        "2-Pack",
        dimsT,
        "5-inch",
        "Commercial",
        "HVAC Filter",
        "Pleated",
        "Practical Pleated",
        "Residential",
      ],
      seoTitle: `${dims} Practical Pleated Air Filter (2-Pack) | AKF`,
      seoDescription: `Shop ${dims} practical pleated air filters designed for improved airflow, extended filter life, and dependable HVAC performance for residential and commercial systems.`,
    };
  }

  // Validation should catch unknown categories before we get here.
  throw new Error(`Unknown category: ${filter.category}`);
}
