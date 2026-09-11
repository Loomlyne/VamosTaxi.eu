// apps/web/app/api/dev/db-smoke/route.ts
//
// Public leak. Hyperdrive proof is not a customer URL. Always 404.

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(null, { status: 404 });
}
