"use client";

// Fetch GET /api/fx once per tab. Switch currency does not refetch.

import { useEffect, useSyncExternalStore } from "react";
import type { FxPayload } from "./fetchRates";

type FxStatus = "idle" | "loading" | "ok" | "down";

let payload: FxPayload | null = null;
let status: FxStatus = "idle";
let gen = 0;
const listeners = new Set<() => void>();

function emit(): void {
  gen += 1;
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): number {
  return gen;
}

function getServerSnapshot(): number {
  return 0;
}

export function ensureFx(): void {
  if (typeof window === "undefined") return;
  if (status !== "idle") return;
  status = "loading";
  emit();
  void fetch("/api/fx", { credentials: "same-origin" })
    .then(async (res) => {
      const json: unknown = await res.json();
      if (!json || typeof json !== "object") {
        status = payload ? "ok" : "down";
        emit();
        return;
      }
      const row = json as {
        ok?: unknown;
        rates?: { EUR?: unknown; USD?: unknown; AED?: unknown };
        as_of?: unknown;
        source?: unknown;
      };
      const eur = row.rates?.EUR;
      const usd = row.rates?.USD;
      const aed = row.rates?.AED;
      if (
        row.ok === true &&
        typeof eur === "number" &&
        eur > 0 &&
        typeof usd === "number" &&
        usd > 0 &&
        typeof aed === "number" &&
        aed > 0
      ) {
        payload = {
          base: "CHF",
          rates: { CHF: 1, EUR: eur, USD: usd, AED: aed },
          as_of: typeof row.as_of === "string" ? row.as_of : "",
          source: typeof row.source === "string" ? row.source : "",
        };
        status = "ok";
      } else {
        status = payload ? "ok" : "down";
      }
      emit();
    })
    .catch(() => {
      status = payload ? "ok" : "down";
      emit();
    });
}

export function useFx(): { rates: FxPayload | null; status: FxStatus } {
  useEffect(() => {
    ensureFx();
  }, []);
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { rates: payload, status };
}
