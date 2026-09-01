"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/forms/Checkbox";
import { SPOKEN_LANGUAGES } from "@/lib/ops/chauffeurs-model";

export function LanguageChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("ops.spoken");

  return (
    <div
      role="group"
      data-testid="chauffeurs-languages"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {SPOKEN_LANGUAGES.map((entry) => {
        const selected = value.includes(entry.code);
        return (
          <label
            key={entry.code}
            data-selected={selected ? "1" : "0"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minBlockSize: 44,
              paddingBlock: 6,
              paddingInline: 12,
              borderRadius: "var(--vt-radius-sm)",
              border: selected
                ? "1px solid var(--vt-charcoal-800)"
                : "1px solid var(--vt-border-subtle)",
              background: selected ? "var(--vt-charcoal-800)" : "var(--vt-bg-surface)",
              color: selected ? "#fff" : "var(--vt-text-primary)",
              cursor: "pointer",
            }}
          >
            <Checkbox
              checked={selected}
              onChange={() => {
                onChange(
                  selected
                    ? value.filter((code) => code !== entry.code)
                    : [...value, entry.code],
                );
              }}
              data-testid={`chauffeurs-lang-${entry.code}`}
              label={
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                  <span>{t(entry.code)}</span>
                  <span
                    className="vt-dir-keep"
                    dir="ltr"
                    style={{
                      fontSize: "var(--vt-body-xs)",
                      opacity: 0.72,
                      fontFamily: "var(--vt-font-mono, var(--vt-font-body))",
                    }}
                  >
                    {entry.code}
                  </span>
                </span>
              }
            />
          </label>
        );
      })}
    </div>
  );
}
