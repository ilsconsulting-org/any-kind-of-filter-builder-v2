import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");

  if (!code || !shop) {
    return Response.json({ error: "Missing code or shop" });
  }

  const clientId = process.env.AKF_TOKEN_CLIENT_ID ?? "";
  const clientSecret = process.env.AKF_TOKEN_CLIENT_SECRET ?? "";

  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  const result = await tokenResponse.json() as Record<string, unknown>;
  console.log("CAPTURED TOKEN RESULT:", JSON.stringify(result));
  return Response.json(result);
}
