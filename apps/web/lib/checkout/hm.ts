function pad(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

export function parseHm(raw: string): { h: number; m: number; hm: string } {
  const p = String(raw || "").split(":");
  let h = Number(p[0]);
  let m = Number(p[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    h = 8;
    m = 0;
  }
  h = Math.max(0, Math.min(23, h));
  m = Math.max(0, Math.min(55, Math.round(m / 5) * 5));
  return { h, m, hm: `${pad(h)}:${pad(m)}` };
}

export function bumpHm(raw: string, deltaMin: number): string {
  const cur = parseHm(raw);
  let total = cur.h * 60 + cur.m + deltaMin;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 55) total = 23 * 60 + 55;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
