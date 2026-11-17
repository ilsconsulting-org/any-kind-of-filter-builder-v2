/**
 * One-time admin route: bulk reprice existing Any Kind of Filter products.
 *
 * Why: findOrCreateShopifyProduct now corrects stale prices, but only when a
 * product is looked up. Products that were created before a cost change keep
 * their old price until someone requests them, and a customer who reorders
 * from their account can buy at that old price. This route sweeps the catalog
 * once so every product matches the current pricing engine.
 *
 * Access via the embedded app: /app/bulk-reprice
 *
 * SAFE BY DEFAULT: with no parameters this is a DRY RUN and writes nothing.
 *
 * Query parameters:
 *   apply=1          Write price changes. Without it, nothing is written.
 *   decreases=1      Also apply price decreases. Default is increases only,
 *                    so a bulk pass can never undercut a price you set on purpose.
 *   maxChangePct=N   Skip (and flag) any change larger than N percent.
 *                    Default 60. Raise it only after reviewing the dry run.
 *   limit=N          Approximate products to examine per request (default 100,
 *                    max 250). Whole pages of 50 are processed, so a request may
 *                    examine slightly more than N.
 *   cursor=...       Pass the nextCursor from the previous response to continue.
 *
 * Suggested run order: dry run every page, review the "changes" and "flagged"
 * lists, then repeat with apply=1 using the same limit.
 *
 * DELETE THIS FILE after running once.
 */

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { calculatePrice } from "../pricing/pricingEngine";
import { validateFilter } from "../lib/filterValidator";
import { generateHandle } from "../lib/handleGenerator";

type Category =
  | "merv"
  | "padframe"
  | "pad"
  | "electro_perm_washable"
  | "practical_pleat";

interface VariantNode {
  id: string;
  price: string;
  selectedOptions: Array<{ name: string; value: string }>;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  variants: { edges: Array<{ node: VariantNode }> };
}

interface Change {
  handle: string;
  title: string;
  variant: string;
  from: string;
  to: string;
  changePct: number;
  applied?: boolean;
}

interface Flag {
  handle: string;
  title: string;
  reason: string;
}

const DIMS_RE = /([\d.]+)"\s*x\s*([\d.]+)"\s*x\s*([\d.]+)"/i;

function parseTitle(title: string): {
  category: Category;
  length: number;
  width: number;
  depth: number;
  quality?: number;
} | null {
  const dims = title.match(DIMS_RE);
  if (!dims) return null;
  const length = parseFloat(dims[1]);
  const width = parseFloat(dims[2]);
  const depth = parseFloat(dims[3]);

  const merv = title.match(/^Merv\s+(\d+)\s+Pleated Air Filter/i);
  if (merv) {
    return { category: "merv", length, width, depth, quality: parseInt(merv[1], 10) };
  }
  if (/^Pad and Frame Air Filter/i.test(title)) return { category: "padframe", length, width, depth };
  if (/^Pad Refills/i.test(title)) return { category: "pad", length, width, depth };
  if (/^A\+2000 Washable/i.test(title)) return { category: "electro_perm_washable", length, width, depth };
  if (/^Practical Pleated Air Filter/i.test(title)) return { category: "practical_pleat", length, width, depth };
  return null;
}

async function gql(
  admin: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> },
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await admin.graphql(query, { variables });
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data ?? {};
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";
  const allowDecreases = url.searchParams.get("decreases") === "1";
  const maxChangePct = Number(url.searchParams.get("maxChangePct") ?? 60);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 250);
  let cursor: string | null = url.searchParams.get("cursor");

  const changes: Change[] = [];
  const flagged: Flag[] = [];
  const errors: Array<{ handle: string; error: string }> = [];
  let examined = 0;
  let alreadyCorrect = 0;
  let hasMore = true;

  while (hasMore && examined < limit) {
    const data = await gql(
      admin,
      `#graphql
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "vendor:'Any Kind of Filter'") {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id title handle
              variants(first: 20) {
                edges { node { id price selectedOptions { name value } } }
              }
            }
          }
        }
      }`,
      { cursor },
    );

    const page = data.products as {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: Array<{ node: ProductNode }>;
    };

    for (const edge of page.edges) {
      const product = edge.node;
      examined++;

      const spec = parseTitle(product.title);
      if (!spec) {
        flagged.push({ handle: product.handle, title: product.title, reason: "Title not recognized; skipped" });
        continue;
      }

      const validation = validateFilter(spec);
      if (!validation.ok) {
        flagged.push({
          handle: product.handle,
          title: product.title,
          reason: `Spec failed validation: ${JSON.stringify(validation.errors)}`,
        });
        continue;
      }
      const filter = validation.data;

      if (generateHandle(filter) !== product.handle) {
        flagged.push({
          handle: product.handle,
          title: product.title,
          reason: `Handle does not match the spec (expected ${generateHandle(filter)}); skipped`,
        });
        continue;
      }

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
        flagged.push({ handle: product.handle, title: product.title, reason: "Pricing engine returned no price; skipped" });
        continue;
      }

      const variants = product.variants.edges.map((e) => e.node);
      const targets: Array<{ variant: VariantNode; label: string; expected: string }> = [];

      if (filter.category === "merv") {
        const twelve = variants.find((v) => v.selectedOptions.some((o) => o.value === "12-pack"));
        const four = variants.find((v) => v.selectedOptions.some((o) => o.value === "4-pack"));
        if (twelve) targets.push({ variant: twelve, label: "12-pack", expected: price.toFixed(2) });
        if (four) targets.push({ variant: four, label: "4-pack", expected: ((price / 12) * 4).toFixed(2) });
        const others = variants.filter((v) => v !== twelve && v !== four);
        if (others.length > 0) {
          flagged.push({
            handle: product.handle,
            title: product.title,
            reason: `Unrecognized variants left untouched: ${others
              .map((v) => v.selectedOptions.map((o) => o.value).join("/"))
              .join(", ")}`,
          });
        }
        if (!twelve && !four) {
          flagged.push({ handle: product.handle, title: product.title, reason: "No 12-pack or 4-pack variant found; skipped" });
          continue;
        }
      } else {
        if (variants.length !== 1) {
          flagged.push({
            handle: product.handle,
            title: product.title,
            reason: `Expected 1 variant, found ${variants.length}; skipped`,
          });
          continue;
        }
        targets.push({ variant: variants[0], label: "single", expected: price.toFixed(2) });
      }

      const updates: Array<{ id: string; price: string }> = [];
      const pending: Change[] = [];

      for (const t of targets) {
        const current = Number(t.variant.price);
        const expected = Number(t.expected);
        if (current.toFixed(2) === t.expected) continue;

        const changePct = current > 0 ? ((expected - current) / current) * 100 : 100;
        const change: Change = {
          handle: product.handle,
          title: product.title,
          variant: t.label,
          from: current.toFixed(2),
          to: t.expected,
          changePct: Number(changePct.toFixed(1)),
        };

        if (Math.abs(changePct) > maxChangePct) {
          flagged.push({
            handle: product.handle,
            title: product.title,
            reason: `${t.label}: ${change.from} -> ${change.to} (${change.changePct}%) exceeds maxChangePct ${maxChangePct}; needs manual review`,
          });
          continue;
        }
        if (expected < current && !allowDecreases) {
          flagged.push({
            handle: product.handle,
            title: product.title,
            reason: `${t.label}: calculated price ${change.to} is below current ${change.from}; left unchanged (pass decreases=1 to apply)`,
          });
          continue;
        }

        pending.push(change);
        updates.push({ id: t.variant.id, price: t.expected });
      }

      if (pending.length === 0) {
        if (!flagged.some((f) => f.handle === product.handle)) alreadyCorrect++;
        continue;
      }

      if (apply) {
        try {
          const result = await gql(
            admin,
            `#graphql
            mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                productVariants { id price }
                userErrors { field message }
              }
            }`,
            { productId: product.id, variants: updates },
          );
          const userErrors =
            (result.productVariantsBulkUpdate as { userErrors?: Array<{ message: string }> } | undefined)
              ?.userErrors ?? [];
          if (userErrors.length > 0) {
            errors.push({ handle: product.handle, error: JSON.stringify(userErrors) });
            pending.forEach((c) => (c.applied = false));
          } else {
            pending.forEach((c) => (c.applied = true));
          }
        } catch (err) {
          errors.push({ handle: product.handle, error: (err as Error).message });
          pending.forEach((c) => (c.applied = false));
        }
        // Stay under Shopify rate limits
        await new Promise((r) => setTimeout(r, 600));
      }

      changes.push(...pending);
    }

    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
    if (examined >= limit) break;
  }

  const increases = changes.filter((c) => c.changePct > 0);
  const decreases = changes.filter((c) => c.changePct < 0);

  return Response.json({
    ok: true,
    mode: apply ? "APPLY" : "DRY RUN (nothing written)",
    settings: { allowDecreases, maxChangePct, limit },
    summary: {
      examined,
      alreadyCorrect,
      variantChanges: changes.length,
      increases: increases.length,
      decreases: decreases.length,
      flagged: flagged.length,
      errors: errors.length,
    },
    nextCursor: hasMore ? cursor : null,
    changes,
    flagged,
    errors,
  });
}
