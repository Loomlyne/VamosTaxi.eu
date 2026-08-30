"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaqCard, type FaqItem } from "./FaqCard";

const SKELETON_ITEMS: FaqItem[] = [
  { id: "skel-1", questionKey: "answers", answerKeys: [] },
  { id: "skel-2", questionKey: "answers", answerKeys: [] },
  { id: "skel-3", questionKey: "answers", answerKeys: [] },
];

export function FaqGrid({
  items,
  mode = "multi",
  emptyLabelKey,
  state = "default",
}: {
  items: FaqItem[];
  mode?: "single" | "multi";
  emptyLabelKey?: string;
  state?: "default" | "loading" | "empty";
}) {
  const tFaq = useTranslations("faq");
  const tCommon = useTranslations("common");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const isLoading = state === "loading";
  const isEmpty = state === "empty" || items.length === 0;

  function onToggle(id: string) {
    setOpenIds((prev) => {
      if (mode === "single") {
        if (prev.has(id)) return new Set();
        return new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div data-faq-grid="1" data-state="loading" aria-busy="true">
        {SKELETON_ITEMS.map((item) => (
          <FaqCard key={item.id} item={item} open={false} onToggle={onToggle} state="loading" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div data-faq-grid="1" data-state="empty">
        <p data-faq-empty="1">{emptyLabelKey ? tFaq(emptyLabelKey) : tCommon("empty")}</p>
      </div>
    );
  }

  return (
    <div data-faq-grid="1">
      {items.map((item) => (
        <FaqCard key={item.id} item={item} open={openIds.has(item.id)} onToggle={onToggle} />
      ))}
    </div>
  );
}
