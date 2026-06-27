// app/services/shopifyProductCreator.ts — UPDATED
//
// Creates or links Shopify products on demand for a given filter spec.
//
// Aligned to the new website's catalog conventions (see categoryContent.ts):
//   - Product type matches the smart-collection conditions
//   - Vendor is uniformly "Any Kind of Filter"
//   - Description, tags, SEO are populated per-category
//   - Hero image is quality-aware for MERV
//   - For MERV: 12-pack and 4-pack variants (4-pack at 1/3 of 12-pack price)
//
// Changes in this version:
//   - ProductResult now includes a `variants` map with IDs and prices
//   - findProductByHandle fetches variant data including price
//   - Existing MERV products that lack a "4-pack" variant get one added
//     automatically (lazy migration of legacy catalog products)
//   - Both new and existing product paths return variant data
//   - For static categories: a single Default variant
//
// Uses three sequential mutations for reliability:
//   1. productCreate (with media, description, tags, SEO, productOptions)
//   2. productVariantsBulkCreate to add the additional 4-pack variant
//      (productCreate auto-creates only one default variant)
//   3. productVariantsBulkUpdate to set price and SKU on all variants
//
// Publication (Step 4) tries two approaches to support both channel apps
// and regular apps across Shopify API versions:
//   a) Root-level `publications` query (works for channel apps & older APIs)
//   b) Product `resourcePublications` query (works for non-channel apps)

import type { ValidatedFilter } from "../lib/filterValidator";
import { generateHandle, generateSku, generateTitle } from "../lib/handleGenerator";
import { getCategoryContent } from "../lib/categoryContent";
import { getCategoryImageUrl } from "../lib/categoryImages";

export interface AdminGraphqlClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

export interface VariantResult {
  id: string;
  price: string;
}

export interface ProductResult {
  id: string;
  handle: string;
  created: boolean;
  variants?: {
    twelve?: VariantResult;
    four?: VariantResult;
    single?: VariantResult;
  };
}

interface VariantNode {
  id: string;
  price?: string;
  selectedOptions: Array<{ name: string; value: string }>;
}

interface ProductWithVariants {
  id: string;
  handle: string;
  variants: { edges: Array<{ node: VariantNode }> };
}

async function findProductByHandle(
  admin: AdminGraphqlClient,
  handle: string,
): Promise<ProductWithVariants | null> {
  const response = await admin.graphql(
    `#graphql
      query findByHandle($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              handle
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    selectedOptions { name value }
                  }
                }
              }
            }
          }
        }
      }`,
    { variables: { query: `handle:${handle}` } },
  );
  const json = (await response.json()) as {
    data?: {
      products?: { edges: Array<{ node: ProductWithVariants }> };
    };
  };
  return json.data?.products?.edges?.[0]?.node ?? null;
}

/**
 * Publishes a product to Online Store using two strategies:
 *   A) Root-level `publications` query (channel apps / older API versions)
 *   B) Product `resourcePublications` fallback (non-channel apps in 2026-04+)
 * Called for both newly created products and existing unpublished products.
 */
async function publishProductToOnlineStore(
  admin: AdminGraphqlClient,
  productId: string,
  handle: string,
): Promise<void> {
  // Strategy A: root-level publications query
  const pubResponse = await admin.graphql(
    `#graphql
      query GetPublications {
        publications(first: 20) {
          edges { node { id name } }
        }
      }`,
  );
  const pubJson = (await pubResponse.json()) as {
    data?: {
      publications?: { edges: Array<{ node: { id: string; name: string } }> };
    };
  };
  let publications =
    pubJson.data?.publications?.edges?.map((e) => e.node) ?? [];

  console.log(
    `[publish] Strategy A: publications query returned ${publications.length} result(s):`,
    JSON.stringify(publications.map((p) => p.name)),
  );

  // Strategy B: fallback via product's resourcePublications
  if (publications.length === 0) {
    const resPubResponse = await admin.graphql(
      `#graphql
        query GetProductPublications($id: ID!) {
          product(id: $id) {
            resourcePublications(first: 20, onlyPublished: false) {
              edges {
                node {
                  isPublished
                  publication { id name }
                }
              }
            }
          }
        }`,
      { variables: { id: productId } },
    );
    const resPubJson = (await resPubResponse.json()) as {
      data?: {
        product?: {
          resourcePublications?: {
            edges: Array<{
              node: {
                isPublished: boolean;
                publication: { id: string; name: string };
              };
            }>;
          };
        };
      };
    };
    publications =
      resPubJson.data?.product?.resourcePublications?.edges?.map(
        (e) => e.node.publication,
      ) ?? [];
    console.log(
      `[publish] Strategy B: resourcePublications returned ${publications.length} result(s):`,
      JSON.stringify(publications.map((p) => p.name)),
    );
  }

  const onlineStore = publications.find(
    (p) =>
      p.name === "Online Store" ||
      p.name.toLowerCase().includes("online store"),
  );

  if (onlineStore) {
    const publishResult = await admin.graphql(
      `#graphql
        mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable {
              ... on Product { id handle }
            }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          id: productId,
          input: [{ publicationId: onlineStore.id }],
        },
      },
    );
    const publishJson = (await publishResult.json()) as {
      data?: {
        publishablePublish?: {
          publishable?: { id: string; handle: string };
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };
    };
    const publishErrors =
      publishJson.data?.publishablePublish?.userErrors ?? [];
    if (publishErrors.length > 0) {
      console.error(
        `[publish] publishablePublish errors for ${handle}:`,
        JSON.stringify(publishErrors),
      );
    } else {
      console.log(
        `[publish] Successfully published ${handle} to "${onlineStore.name}"`,
      );
    }
  } else {
    console.error(
      `[publish] "Online Store" not found among ${publications.length} available publication(s). ` +
        `Product ${handle} is NOT published to Online Store.`,
    );
  }
}

function buildProductOptions(filter: ValidatedFilter) {
  if (filter.category === "merv") {
    return [
      {
        name: "Quantity",
        values: [{ name: "12-pack" }, { name: "4-pack" }],
      },
    ];
  }
  if (filter.category === "practical_pleat") {
    return [
      {
        name: "Quantity",
        values: [{ name: "2-Pack" }],
      },
    ];
  }
  return [
    {
      name: "Quantity",
      values: [{ name: "Default" }],
    },
  ];
}

export async function findOrCreateShopifyProduct(
  admin: AdminGraphqlClient,
  filter: ValidatedFilter,
  price: number,
): Promise<ProductResult> {
  const handle = generateHandle(filter);

  const existing = await findProductByHandle(admin, handle);
  if (existing) {
    // Ensure the existing product is published.
    try {
      await publishProductToOnlineStore(admin, existing.id, handle);
    } catch (err) {
      console.error(`[publish] Publish-on-find failed for ${handle}:`, err);
    }

    // Normalise variant structure and build the variants map for the API response.
    // Legacy catalog products may have "6-pack" or other pack sizes instead of
    // "4-pack". When a 12-pack exists but no 4-pack, we add one at 1/3 of the
    // 12-pack price. This lazily migrates existing products without touching
    // any other variants or disrupting the rest of the product listing.
    let existingVariants = existing.variants.edges.map((e) => e.node);
    const variantsResult: ProductResult["variants"] = {};

    if (filter.category === "merv") {
      // Match by value only — existing catalog products may use a different
      // option name than "Quantity" (e.g. "Pack Size", "Size", etc.).
      // We detect the actual option name from the first variant so the
      // productVariantsBulkCreate mutation uses the correct optionName.
      const packOptionName =
        existingVariants[0]?.selectedOptions[0]?.name ?? "Quantity";
      console.log(
        `[existing] Pack option name for ${handle}: "${packOptionName}"`,
        `| variants:`,
        JSON.stringify(
          existingVariants.map((v) => v.selectedOptions.map((o) => `${o.name}=${o.value}`)),
        ),
      );

      const twelve = existingVariants.find((v) =>
        v.selectedOptions.some((o) => o.value === "12-pack"),
      );
      let four = existingVariants.find((v) =>
        v.selectedOptions.some((o) => o.value === "4-pack"),
      );

      if (twelve && !four) {
        const basePriceNum = parseFloat(twelve.price ?? String(price));
        const fourPrice = ((basePriceNum / 12) * 4).toFixed(2);
        console.log(
          `[existing] Adding 4-pack variant to ${handle} at $${fourPrice} using optionName="${packOptionName}"`,
        );
        const addResp = await admin.graphql(
          `#graphql
            mutation addFourPack($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkCreate(productId: $productId, variants: $variants) {
                productVariants {
                  id
                  price
                  selectedOptions { name value }
                }
                userErrors { field message }
              }
            }`,
          {
            variables: {
              productId: existing.id,
              variants: [
                {
                  optionValues: [{ optionName: packOptionName, name: "4-pack" }],
                  price: fourPrice,
                  inventoryPolicy: "CONTINUE",
                },
              ],
            },
          },
        );
        const addJson = (await addResp.json()) as {
          data?: {
            productVariantsBulkCreate?: {
              productVariants: VariantNode[];
              userErrors: Array<{ field: string[]; message: string }>;
            };
          };
        };
        const addResult = addJson.data?.productVariantsBulkCreate;
        const addErrs = addResult?.userErrors ?? [];
        if (addErrs.length > 0) {
          console.error(
            `[existing] Add 4-pack errors for ${handle}:`,
            JSON.stringify(addErrs),
          );
        } else if (addResult?.productVariants?.length) {
          existingVariants = [...existingVariants, ...addResult.productVariants];
          four = addResult.productVariants.find((v) =>
            v.selectedOptions.some((o) => o.value === "4-pack"),
          );
        }
      }

      const finalTwelve = existingVariants.find((v) =>
        v.selectedOptions.some((o) => o.value === "12-pack"),
      );
      const finalFour = existingVariants.find((v) =>
        v.selectedOptions.some((o) => o.value === "4-pack"),
      );
      if (finalTwelve) {
        variantsResult.twelve = {
          id: finalTwelve.id,
          price: finalTwelve.price ?? "0",
        };
      }
      if (finalFour) {
        variantsResult.four = {
          id: finalFour.id,
          price: finalFour.price ?? "0",
        };
      }
    } else {
      const single = existingVariants[0];
      if (single) {
        variantsResult.single = { id: single.id, price: single.price ?? "0" };
      }
    }

    return {
      id: existing.id,
      handle: existing.handle,
      created: false,
      variants: variantsResult,
    };
  }

  const title = generateTitle(filter);
  const sku = generateSku(filter);
  const content = getCategoryContent(filter);
  const imageUrl = getCategoryImageUrl(filter);

  // Step 1: Create the product with all top-level metadata.
  const productInput: Record<string, unknown> = {
    title,
    handle,
    descriptionHtml: content.descriptionHtml,
    productType: content.productType,
    vendor: content.vendor,
    status: "ACTIVE",
    tags: content.tags,
    seo: {
      title: content.seoTitle,
      description: content.seoDescription,
    },
    productOptions: buildProductOptions(filter),
  };

  const mediaInput = imageUrl
    ? [
        {
          mediaContentType: "IMAGE",
          originalSource: imageUrl,
          alt: title,
        },
      ]
    : undefined;

  const createResponse = await admin.graphql(
    `#graphql
      mutation createFilterProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product {
            id
            handle
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  selectedOptions { name value }
                }
              }
            }
          }
          userErrors { field message }
        }
      }`,
    { variables: { product: productInput, media: mediaInput } },
  );

  const createJson = (await createResponse.json()) as {
    data?: {
      productCreate?: {
        product?: {
          id: string;
          handle: string;
          variants: { edges: Array<{ node: VariantNode }> };
        };
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const created = createJson.data?.productCreate;
  if (!created?.product) {
    const errs = created?.userErrors ?? [];
    console.error(
      `[create] productCreate failed for ${handle}:`,
      JSON.stringify(errs),
    );
    throw new Error(
      `productCreate failed for ${handle}: ${JSON.stringify(errs)}`,
    );
  }

  const product = created.product;
  let variants: VariantNode[] = product.variants.edges.map((e) => e.node);

  // Step 2: For MERV, add the missing 4-pack variant.
  // productCreate auto-creates only one default variant from the first
  // option value, so we need a separate call to add the second.
  if (filter.category === "merv") {
    const has4Pack = variants.some((v) =>
      v.selectedOptions.some(
        (o) => o.name === "Quantity" && o.value === "4-pack",
      ),
    );
    if (!has4Pack) {
      const addResponse = await admin.graphql(
        `#graphql
          mutation addSecondVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkCreate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
                selectedOptions { name value }
              }
              userErrors { field message }
            }
          }`,
        {
          variables: {
            productId: product.id,
            variants: [
              {
                optionValues: [{ optionName: "Quantity", name: "4-pack" }],
              },
            ],
          },
        },
      );
      const addJson = (await addResponse.json()) as {
        data?: {
          productVariantsBulkCreate?: {
            productVariants: VariantNode[];
            userErrors: Array<{ field: string[]; message: string }>;
          };
        };
      };
      const addResult = addJson.data?.productVariantsBulkCreate;
      const addErrs = addResult?.userErrors ?? [];
      if (addErrs.length > 0) {
        console.error(
          `[create] Second variant errors for ${handle}:`,
          JSON.stringify(addErrs),
        );
      }
      const newVariants = addResult?.productVariants ?? [];
      variants = [...variants, ...newVariants];
    }
  }

  // Step 3: Set price and SKU on each variant.
  const updates: Array<Record<string, unknown>> = [];
  if (filter.category === "merv") {
    const twelve = variants.find((v) =>
      v.selectedOptions.some(
        (o) => o.name === "Quantity" && o.value === "12-pack",
      ),
    );
    const four = variants.find((v) =>
      v.selectedOptions.some(
        (o) => o.name === "Quantity" && o.value === "4-pack",
      ),
    );
    if (twelve) {
      updates.push({
        id: twelve.id,
        price: price.toFixed(2),
        inventoryPolicy: "CONTINUE",
        inventoryItem: { sku, tracked: false },
      });
    }
    if (four) {
      updates.push({
        id: four.id,
        price: ((price / 12) * 4).toFixed(2),
        inventoryPolicy: "CONTINUE",
        inventoryItem: { sku: `${sku}-4pack`, tracked: false },
      });
    }
  } else {
    const def = variants.find((v) =>
      v.selectedOptions.some(
        (o) => o.name === "Quantity" && (o.value === "Default" || o.value === "2-Pack"),
      ),
    );
    if (def) {
      updates.push({
        id: def.id,
        price: price.toFixed(2),
        inventoryPolicy: "CONTINUE",
        inventoryItem: { sku, tracked: false },
      });
    }
  }

  if (updates.length > 0) {
    const updateResponse = await admin.graphql(
      `#graphql
        mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }`,
      { variables: { productId: product.id, variants: updates } },
    );
    const updateJson = (await updateResponse.json()) as {
      data?: {
        productVariantsBulkUpdate?: {
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };
    };
    const updateErrs =
      updateJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (updateErrs.length > 0) {
      console.error(
        `[create] Variant update errors for ${handle}:`,
        JSON.stringify(updateErrs),
      );
    }
  }

  // Step 4: Publish to Online Store channel.
  try {
    await publishProductToOnlineStore(admin, product.id, handle);
  } catch (err) {
    console.error(`[publish] Step 4 threw for ${handle}:`, err);
  }

  // Build variant map for the API response.
  const createdVariants: ProductResult["variants"] = {};
  if (filter.category === "merv") {
    const finalTwelve = variants.find((v) =>
      v.selectedOptions.some(
        (o) => o.name === "Quantity" && o.value === "12-pack",
      ),
    );
    const finalFour = variants.find((v) =>
      v.selectedOptions.some(
        (o) => o.name === "Quantity" && o.value === "4-pack",
      ),
    );
    if (finalTwelve) {
      createdVariants.twelve = { id: finalTwelve.id, price: price.toFixed(2) };
    }
    if (finalFour) {
      createdVariants.four = {
        id: finalFour.id,
        price: ((price / 12) * 4).toFixed(2),
      };
    }
  } else {
    const single = variants[0];
    if (single) {
      createdVariants.single = { id: single.id, price: price.toFixed(2) };
    }
  }

  return {
    id: product.id,
    handle: product.handle,
    created: true,
    variants: createdVariants,
  };
}
