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

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const params = url.searchParams;

    const rawCategory = params.get("category");
    const category = rawCategory === "deeppleat" ? "practical_pleat" : rawCategory;

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

    let product = null;
    let productError = null;

    if (price != null && admin) {
      try {
        product = await findOrCreateShopifyProduct(
          admin as AdminGraphqlClient,
          filter,
          price,
        );
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