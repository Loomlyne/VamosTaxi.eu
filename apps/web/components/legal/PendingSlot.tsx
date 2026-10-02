// apps/web/components/legal/PendingSlot.tsx
//
// Law 04 / ADR-011: data-tok pill. English in every language. laws.css appends " TBC".

export function PendingSlot({ label }: { label: string }) {
  return (
    <span data-tok="1" data-vt-no-i18n title="Awaiting a confirmed value from Vamos Taxi">
      {label}
    </span>
  );
}
