/**
 * One-time admin route: bulk update MERV filter products.
 *
 * Access via: Shopify admin → Apps → AKF Filter Builder → (this route loads in the iframe)
 * URL: https://{your-railway-app}/app/bulk-update-merv
 *
 * What it does for each MERV product:
 *   1. Replaces the product image with the correct MERV-rating image
 *   2. Removes the 6-pack variant
 *
 * DELETE THIS FILE after running once.
 */

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const MERV_IMAGES: Record<number, string> = {
  8: "https://drive.google.com/uc?export=view&id=1av2dTiwDbLz-eYJ2erW2F4WyikY6Q4BS",
  11: "https://drive.google.com/uc?export=view&id=1jLLb9zl6_dn8wUTcgEpGt4VdBEiqMd9F",
  13: "https://drive.google.com/uc?export=view&id=1cHxs-dj5LijbLV03owDa3eotgZqD_GCh",
};

function extractMervRating(title: string): number | null {
  const match = title.match(/merv\s*(\d+)/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return MERV_IMAGES[n] ? n : null;
}

async function gql(
  admin: { graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response> },
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await admin.graphql(query, { variables });
  const json = await res.json() as { data?: Record<string, unknown>; errors?: unknown[] };
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data ?? {};
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const results: Array<{ handle: string; mervRating: number | null; imageReplaced: boolean; sixPackRemoved: boolean; error?: string }> = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const data = await gql(admin, `
      query($cursor: String) {
        products(first: 50, after: $cursor, query: "title:merv") {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id title handle
              images(first: 10) { edges { node { id } } }
              variants(first: 20) {
                edges { node { id selectedOptions { name value } } }
              }
            }
          }
        }
      }
    `, { cursor });

    const page = data.products as {
      pageInfo: { hasNextPage: boolean; endCursor: string };
      edges: Array<{ node: {
        id: string; title: string; handle: string;
        images: { edges: Array<{ node: { id: string } }> };
        variants: { edges: Array<{ node: { id: string; selectedOptions: Array<{ name: string; value: string }> } }> };
      } }>;
    };

    for (const edge of page.edges) {
      const product = edge.node;
      const mervRating = extractMervRating(product.title);
      const result = { handle: product.handle, mervRating, imageReplaced: false, sixPackRemoved: false };

      if (!mervRating) {
        results.push(result);
        continue;
      }

      try {
        // 1. Delete old images
        const imageIds = product.images.edges.map((e) => e.node.id);
        if (imageIds.length > 0) {
          await gql(admin, `
            mutation($id: ID!, $imageIds: [ID!]!) {
              productDeleteImages(id: $id, imageIds: $imageIds) {
                userErrors { field message }
              }
            }
          `, { id: product.id, imageIds });
        }

        // 2. Add new image
        const imgData = await gql(admin, `
          mutation($productId: ID!, $media: [CreateMediaInput!]!) {
            productCreateMedia(productId: $productId, media: $media) {
              mediaUserErrors { field message }
            }
          }
        `, {
          productId: product.id,
          media: [{ originalSource: MERV_IMAGES[mervRating], mediaContentType: "IMAGE" }],
        });

        const imgErrors = (imgData.productCreateMedia as { mediaUserErrors: Array<{ message: string }> })?.mediaUserErrors ?? [];
        if (imgErrors.length === 0) result.imageReplaced = true;

        // 3. Remove 6-pack variant
        const variants = product.variants.edges.map((e) => e.node);
        const sixPack = variants.find((v) => v.selectedOptions.some((o) => o.value === "6-pack"));
        if (sixPack) {
          await gql(admin, `
            mutation($productId: ID!, $variantsIds: [ID!]!) {
              productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
                userErrors { field message }
              }
            }
          `, { productId: product.id, variantsIds: [sixPack.id] });
          result.sixPackRemoved = true;
        }
      } catch (err) {
        (result as typeof result & { error?: string }).error = (err as Error).message;
      }

      results.push(result);

      // Stay under rate limits
      await new Promise((r) => setTimeout(r, 600));
    }

    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return Response.json({ ok: true, processed: results.length, results });
}
