/**
 * api.publish.ts
 * POST /api/publish
 *
 * Publishes a Shopify product to the Online Store channel using the
 * publishablePublish GraphQL mutation. Requires write_publications scope
 * (superset of read — covers both querying publications and publishing to them)
 * plus write_products to manage product status.
 *
 * Required scopes in shopify.app.toml:
 *   scopes = "write_products,write_publications"
 *
 * Body (JSON): { productId: "gid://shopify/Product/123" }
 * Response:    { ok: true, productId } | { ok: false, errors: [...] }
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// ── GraphQL: Get the Online Store publication ID ──────────────────────────────
const GET_PUBLICATIONS_QUERY = `#graphql
  query GetPublications {
    publications(first: 10) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

// ── GraphQL: Publish product to a publication ─────────────────────────────────
const PUBLISHABLE_PUBLISH_MUTATION = `#graphql
  mutation PublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          id
          title
          status
        }
      }
      shop {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only allow POST
  if (request.method !== "POST") {
    return Response.json({ ok: false, errors: ["Method not allowed"] }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);

  let productId: string;
  try {
    const body = await request.json();
    productId = body.productId;
    if (!productId || !productId.startsWith("gid://shopify/Product/")) {
      throw new Error("Invalid productId");
    }
  } catch {
    return Response.json(
      { ok: false, errors: ["Body must be JSON with a valid productId (GID)"] },
      { status: 400 }
    );
  }

  // ── Step 1: Find the Online Store publication ────────────────────────────────
  const pubResponse = await admin.graphql(GET_PUBLICATIONS_QUERY);
  const pubData = await pubResponse.json();

  const publications: Array<{ id: string; name: string }> =
    pubData?.data?.publications?.edges?.map(
      (e: { node: { id: string; name: string } }) => e.node
    ) ?? [];

  const onlineStore = publications.find(
    (p) =>
      p.name === "Online Store" ||
      p.name.toLowerCase().includes("online store")
  );

  if (!onlineStore) {
    return Response.json(
      {
        ok: false,
        errors: [
          "Could not find Online Store publication. Ensure write_publications scope is active.",
        ],
        availablePublications: publications.map((p) => p.name),
      },
      { status: 422 }
    );
  }

  // ── Step 2: Publish product to the Online Store ──────────────────────────────
  const publishResponse = await admin.graphql(PUBLISHABLE_PUBLISH_MUTATION, {
    variables: {
      id: productId,
      input: [{ publicationId: onlineStore.id }],
    },
  });

  const publishData = await publishResponse.json();
  const result = publishData?.data?.publishablePublish;

  if (!result) {
    return Response.json(
      { ok: false, errors: ["Unexpected empty response from publishablePublish"] },
      { status: 500 }
    );
  }

  const userErrors: Array<{ field: string; message: string }> =
    result.userErrors ?? [];

  if (userErrors.length > 0) {
    return Response.json({ ok: false, errors: userErrors }, { status: 422 });
  }

  return Response.json({
    ok: true,
    productId,
    publicationId: onlineStore.id,
    publicationName: onlineStore.name,
    product: result.publishable,
  });
};

// GET not supported — this is a mutation-only endpoint
export const loader = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return Response.json(
    { error: "Use POST with { productId: 'gid://shopify/Product/...' }" },
    { status: 405 }
  );
};
