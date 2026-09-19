// GET /.well-known/security.txt — RFC 9116. Public contact only.

export const dynamic = "force-static";

const BODY = [
  "Contact: mailto:info@vamostaxi.site",
  "Expires: 2027-12-31T00:00:00.000Z",
  "Preferred-Languages: en, fr",
  "Canonical: https://vamostaxi.site/.well-known/security.txt",
  "",
].join("\n");

export function GET(): Response {
  return new Response(BODY, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
