// app/services/shopifyProductCreator.ts
//
// Creates or links Shopify products on demand for a given filter spec.
//
// Aligned to the new website's catalog conventions (see categoryContent.ts):
//   - Product type matches the smart-collection conditions
//   - Vendor is uniformly "Any Kind of Filter"
//   - Description, tags, SEO are populated per-category
//   - Hero image is quality-aware for MERV
//   - For MERV: 12-pack and 4-pack variants (4-pack at 1/3 of 12-pack price)
//   - For static categories: a single Default variant
//
// Uses three sequential mutations for reliability:
//   1. productCreate (with media, description, tags, SEO, productOptions)
//   2. productVariantsBulkCreate to add the additional 4-pack variant
//      (productCreate auto-creates only one default variant)
//   3. productVariantsBulkUpdate to set price and SKU on all variants
//
// Sales channel publication is deferred until the app has the
// read_publications scope. Newly-created products will be ACTIVE and
// visible in admin, then a separate publication step before launch.

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

export interface ProductResult {
  id: string;
  handle: string;
  created: boolean;
}

interface VariantNode {
  id: string;
  selectedOptions: Array<{ name: string; value: string }>;
}

async function findProductByHandle(
  admin: AdminGraphqlClient,
  handle: string,
): Promise<{ id: string; handle: string } | null> {
  const response = await admin.graphql(
    `#graphql
      query findByHandle($query: String!) {
        products(first: 1, query: $query) {
          edges { node { id handle } }
        }
      }`,
    { variables: { query: `handle:${handle}` } },
  );
  const json = (await response.json()) as {
    data?: {
      products?: { edges: Array<{ node: { id: string; handle: string } }> };
    };
  };
  return json.data?.products?.edges?.[0]?.node ?? null;
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
    return { id: existing.id, handle: existing.handle, created: false };
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
    const pubResponse = await admin.graphql(
      `#graphql
        query GetPublications {
          publications(first: 10) {
            edges { node { id name } }
          }
        }`,
    );
    const pubJson = (await pubResponse.json()) as {
      data?: {
        publications?: {
          edges: Array<{ node: { id: string; name: string } }>;
        };
      };
    };
    const publications =
      pubJson.data?.publications?.edges?.map((e) => e.node) ?? [];
    const onlineStore = publications.find(
      (p) =>
        p.name === "Online Store" ||
        p.name.toLowerCase().includes("online store"),
    );
    if (onlineStore) {
      await admin.graphql(
        `#graphql
          mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { field message }
            }
          }`,
        {
          variables: {
            id: product.id,
            input: [{ publicationId: onlineStore.id }],
          },
        },
      );
    }
  } catch (err) {
    console.error(`[create] Publish failed for ${handle}:`, err);
  }

  return {
    id: product.id,
    handle: product.handle,
    created: true,
  };
}
