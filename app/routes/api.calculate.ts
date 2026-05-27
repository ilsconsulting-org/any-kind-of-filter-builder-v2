import type { ActionFunctionArgs } from "react-router";
import { calculatePrice } from "../pricing/pricingEngine";

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();

  const {
    category,
    length,
    width,
    depth,
    quality,
    packSize,
    isSubscription
  } = body;

  const price = await calculatePrice({
    category,
    length: Number(length),
    width: Number(width),
    depth: Number(depth),
    quality: Number(quality),
    packSize: Number(packSize),
    isSubscription
  });

  return new Response(JSON.stringify({ price }), {
    headers: { "Content-Type": "application/json" },
  });
}