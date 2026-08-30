"use client";

import { Icon } from "@/components/core";

export function LegalPrintButton({ label }: { label: string }) {
  return (
    <button
      data-lg-noprint="1"
      type="button"
      className="vt-legal-print"
      onClick={() => window.print()}
    >
      <Icon name="printer" size={16} color="var(--vt-accent)" />
      {label}
    </button>
  );
}
