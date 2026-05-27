import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../lib/prisma.server";
import { authenticate } from "../shopify.server";

/**
 * Type for incoming request body
 */
type FilterRequestBody = {
  id?: string;

  name?: string;

  width?: number;
  height?: number;
  depth?: number;
  systemType?: string;
  mervRating?: number | null;

  isActive?: boolean;

  rules?: {
    type: string;
    value: string;
  }[];
};

/**
 * GET /api/filters
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const filters = await prisma.filter.findMany({
    include: { rules: true },
    orderBy: { createdAt: "desc" },
  });

  return new Response(JSON.stringify(filters), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST / PUT / DELETE
 */
export async function action({ request }: ActionFunctionArgs) {
  await authenticate.admin(request);

  const body = (await request.json()) as FilterRequestBody;

  const method = request.method.toUpperCase();

  /**
   * CREATE FILTER
   */
  if (method === "POST") {
  const {
    name,
    width,
    height,
    depth,
    systemType,
    mervRating,
    isActive,
    rules,
  } = body;

  if (!name || width == null || height == null || depth == null || !systemType) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  const newFilter = await prisma.filter.create({
    data: {
      name,
      width,
      height,
      depth,
      systemType,
      mervRating: mervRating ?? null,
      isActive: isActive ?? true,
      rules: Array.isArray(rules)
        ? {
            create: rules.map((rule) => ({
              type: rule.type,
              value: rule.value,
            })),
          }
        : undefined,
    },
    include: { rules: true },
  });

  return new Response(JSON.stringify(newFilter), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

  /**
   * UPDATE FILTER
   */
  if (method === "PUT") {
  const {
    id,
    name,
    width,
    height,
    depth,
    systemType,
    mervRating,
    isActive,
  } = body;

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Filter ID required" }),
      { status: 400 }
    );
  }

  const updated = await prisma.filter.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(width !== undefined && { width }),
      ...(height !== undefined && { height }),
      ...(depth !== undefined && { depth }),
      ...(systemType !== undefined && { systemType }),
      ...(mervRating !== undefined && { mervRating }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return new Response(JSON.stringify(updated), {
    headers: { "Content-Type": "application/json" },
  });
}
  /**
   * DELETE FILTER
   */
  if (method === "DELETE") {
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Filter ID required" }),
        { status: 400 }
      );
    }

    await prisma.filter.delete({
      where: { id },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * FALLBACK
   */
  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405 }
  );
}