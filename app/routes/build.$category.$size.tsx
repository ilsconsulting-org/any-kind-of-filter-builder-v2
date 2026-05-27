import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { authenticate } from "../shopify.server";
import { validateFilter } from "../lib/filterValidator";
import { generateHandle } from "../lib/handleGenerator";
import { calculatePrice } from "../pricing/pricingEngine";

import {
  findOrCreateShopifyProduct,
  type AdminGraphqlClient,
} from "../services/shopifyProductCreator";

function parseDimension(raw: string): number {
  const s = raw.trim();

  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);

  if (mixed) {
    return (
      parseFloat(mixed[1]) +
      parseFloat(mixed[2]) / parseFloat(mixed[3])
    );
  }

  const fraction = s.match(/^(\d+)\/(\d+)$/);

  if (fraction) {
    return parseFloat(fraction[1]) / parseFloat(fraction[2]);
  }

  const n = parseFloat(s);

  if (!Number.isFinite(n)) {
    throw new Error(`Could not parse dimension: "${raw}"`);
  }

  return n;
}

function parseSize(size: string): {
  width: number;
  length: number;
  depth: number;
} {
  const parts = decodeURIComponent(size)
    .toLowerCase()
    .split(/[x\-]/);

  if (parts.length !== 3) {
    throw new Error("Bad size format. Use WxLxD");
  }

  return {
    width: parseDimension(parts[0]),
    length: parseDimension(parts[1]),
    depth: parseDimension(parts[2]),
  };
}

export async function loader({
  request,
  params,
}: LoaderFunctionArgs) {
  const { admin, session } =
    await authenticate.public.appProxy(request);

  const category = params.category;
  const size = params.size;

  if (!category || !size) {
    throw new Response("Missing category or size", {
      status: 400,
    });
  }

  let dims;

  try {
    dims = parseSize(size);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid size";

    throw new Response(`Error: ${message}`, {
      status: 400,
    });
  }

  const url = new URL(request.url);

  const qualityParam = url.searchParams.get("quality");

  const quality = qualityParam
    ? parseInt(qualityParam, 10)
    : category === "merv"
      ? 8
      : null;

   const normalizedCategory = category === "deeppleat" ? "practical_pleat" : category;

  const validation = validateFilter({
    category: normalizedCategory,
    length: dims.length,
    width: dims.width,
    depth: dims.depth,
    quality,
  });

  if (!validation.ok) {
    throw new Response(
      `Validation failed: ${JSON.stringify(validation.errors)}`,
      {
        status: 400,
      },
    );
  }

  const filter = validation.data;

  const price = await calculatePrice({
    category: filter.category,
    length: filter.length,
    width: filter.width,
    depth: filter.depth,
    quality: filter.quality,
    packSize: 12,
    isSubscription: false,
  });

  if (price == null) {
    throw new Response(
      "Price calculation failed for this size",
      {
        status: 500,
      },
    );
  }

  const handle = generateHandle(filter);

  if (admin) {
    try {
      await findOrCreateShopifyProduct(
        admin as AdminGraphqlClient,
        filter,
        price,
      );
    } catch (err) {
      console.error(
        `[build] Product creation failed for handle=${handle}:`,
        err,
      );
    }
  }

  const shopDomain =
    session?.shop ||
    process.env.SHOPIFY_SHOP ||
    "any-kind-of-filter-5.myshopify.com";

  return redirect(
    `https://${shopDomain}/products/${handle}`,
  );
}