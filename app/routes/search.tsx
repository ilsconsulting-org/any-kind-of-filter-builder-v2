import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { validateFilter } from "../lib/filterValidator";
import { generateHandle } from "../lib/handleGenerator";
import { calculatePrice } from "../pricing/pricingEngine";
import {
  findOrCreateShopifyProduct,
  type AdminGraphqlClient,
} from "../services/shopifyProductCreator";

function num(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function int(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function formatErr(err: unknown) {
  const e = err as Error & { stack?: string };
  return {
    name: e?.name ?? null,
    message: e?.message ?? String(err),
    stack: e?.stack?.split("\n").slice(0, 8).join("\n") ?? null,
  };
}

/**
 * Fallback admin client using a stored access token.
 * Used when authenticate.public.appProxy returns admin: null
 * (i.e., no offline session exists in the database).
 */
function createFallbackAdmin(
  accessToken: string,
  shopDomain: string,
): AdminGraphqlClient {
  return {
    graphql: async (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => {
      return fetch(
        `https://${shopDomain}/admin/api/2025-10/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query,
            variables: options?.variables,
          }),
        },
      );
    },
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin: proxyAdmin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const params = url.searchParams;

    const rawCategory = params.get("category");
    const category =
      rawCategory === "deeppleat" ? "practical_pleat" : rawCategory;

    const validation = validateFilter({
      category,
      length: num(params.get("length")),
      width: num(params.get("width")),
      depth: num(params.get("depth")) ?? 1,
      quality: int(params.get("quality")),
    });

    if (!validation.ok) {
      return Response.json({
        ok: false,
        stage: "validation",
        errors: validation.errors,
      });
    }

    const filter = validation.data;
    const handle = generateHandle(filter);

    const price = await calculatePrice({
      category: filter.category,
      length: filter.length,
      width: filter.width,
      depth: filter.depth,
      quality: filter.quality,
      packSize: 12,
      isSubscription: false,
    });

    // 4-pack price: 1/3 of the 12-pack price, rounded to 2 decimal places.
    // Only applicable to MERV filters; all other categories have a single variant.
    const price_4pack =
      filter.category === "merv" && price != null
        ? parseFloat(((price / 12) * 4).toFixed(2))
        : null;

    let product = null;
    let productError = null;

    // Use proxy admin if available; fall back to stored access token when
    // no offline session exists (token exchange not yet completed).
    let admin: AdminGraphqlClient | null =
      proxyAdmin as AdminGraphqlClient | null;

    if (!admin && process.env.SHOPIFY_ACCESS_TOKEN) {
      const shopDomain =
        params.get("shop") ?? "any-kinf-of-filter-v2-dev.myshopify.com";
      console.log(
        `[search] proxy admin null — using fallback token for ${shopDomain}`,
      );
      admin = createFallbackAdmin(
        process.env.SHOPIFY_ACCESS_TOKEN,
        shopDomain,
      );
    }

    if (price != null && admin) {
      try {
        product = await findOrCreateShopifyProduct(admin, filter, price);
      } catch (err) {
        productError = formatErr(err);
      }
    }

    return Response.json({
      ok: true,
      width: filter.width,
      length: filter.length,
      depth: filter.depth,
      merv_code: filter.mervCode ?? null,
      price,
      price_4pack,
      handle,
      product,
      productError,
    });
  } catch (err) {
    return Response.json({
      ok: false,
      stage: "loader",
      ...formatErr(err),
    });
  }
}
