// apps/web/lib/ops/mapbox-zone.ts
//
// D-20 / D-26: a Mapbox From/To is a real place. Ops does not wait for a
// pre-seeded service_zones row. Slug + tags are derived here; the staff
// INSERT lives with the rate-book write.

export function mapboxIdFromPin(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const rec = value as Record<string, unknown>;
  if (typeof rec.mapbox_id === "string" && rec.mapbox_id.trim() !== "") {
    return rec.mapbox_id.trim();
  }
  if (typeof rec.mapboxId === "string" && rec.mapboxId.trim() !== "") {
    return rec.mapboxId.trim();
  }
  return "";
}

export function placeLabelFromPin(value: unknown, fallback: unknown): string {
  if (typeof fallback === "string" && fallback.trim() !== "") return fallback.trim();
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const rec = value as Record<string, unknown>;
  if (typeof rec.text === "string" && rec.text.trim() !== "") return rec.text.trim();
  if (typeof rec.name === "string" && rec.name.trim() !== "") return rec.name.trim();
  return "";
}

export function zoneSlugFromPlace(label: string, mapboxId: string): string {
  const fromName = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (fromName.length >= 2) return fromName;
  const id = mapboxId.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);
  return id ? `mbx-${id}` : "place";
}

export function skiZoneType(label: string): "ski" | "other" {
  return /zermatt|verbier|st\.?\s*moritz|chamonix|davos|klosters/i.test(label)
    ? "ski"
    : "other";
}

export function pgTextArrayLiteral(values: string[]): string {
  if (values.length === 0) return "{}";
  return `{${values
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}
