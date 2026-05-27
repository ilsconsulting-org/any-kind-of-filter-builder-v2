import prisma from "../lib/prisma.server";
import { calculateMervPrice } from "./mervPricing.js";

/* -----------------------------
   STATIC COST ENGINE
----------------------------- */

function getStaticCost(category) {
  switch (category) {
    case "padframe":
      return 59;
    case "pad":
      return 32;
    case "electro_perm_washable":
      return 69;
    case "practical_pleat":
      return 130;
    default:
      return 0;
  }
}

/* -----------------------------
   UNIVERSAL PRICING ENGINE
-----------------------------

   Returns the final retail price for a given filter spec.

   - For MERV filters, delegates to calculateMervPrice in mervPricing.js,
     which holds the full cost matrix and the (cost * 12 / discountFactor)
     margin formula. Matches Rails Product#get_price_merv.

   - For static categories, uses the hardcoded prices that match
     Rails Product#get_price.

   - Subscription discount is applied uniformly as a final-price multiplier
     when isSubscription is true and a discount has been configured.
*/

export async function calculatePrice({
  category,
  length,
  width,
  depth,
  quality,
  packSize = 12,
  isSubscription = false,
}) {
  let finalPrice;

  if (category === "merv") {
    finalPrice = await calculateMervPrice({
      length,
      width,
      depth,
      quality,
      packSize,
    });
    if (finalPrice == null) return null;
  } else {
    const staticCost = getStaticCost(category);
    if (!staticCost) return null;
    finalPrice = staticCost;
  }

  if (isSubscription) {
    const settings = await prisma.pricingSettings.findUnique({
      where: { id: 1 },
    });
    const subscriptionDiscount = settings?.subscriptionDiscount ?? 0;
    if (subscriptionDiscount > 0) {
      finalPrice = finalPrice * (1 - subscriptionDiscount);
    }
  }

  return Number(finalPrice.toFixed(2));
}
