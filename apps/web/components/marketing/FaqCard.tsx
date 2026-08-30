"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import "./FaqCard.css";

export type FaqItem = {
  id: string;
  questionKey: string;
  answerKeys: string[];
  /** Resolved copy from content_strings (home). When set, the JSON catalogue is not used. */
  question?: string;
  answers?: string[];
};

export function FaqCard({
  item,
  open,
  onToggle,
  state = "default",
}: {
  item: FaqItem;
  open: boolean;
  onToggle: (id: string) => void;
  state?: "default" | "loading";
}) {
  const tFaq = useTranslations("faq");
  const reactId = useId();
  const toggleId = `faq-q-${item.id}-${reactId}`;
  const panelId = `faq-a-${item.id}-${reactId}`;

  if (state === "loading") {
    return (
      <article data-faq-card="1" data-state="loading" aria-busy="true">
        <div data-faq-skel="title" />
        <div data-faq-skel="line" />
        <div data-faq-skel="line" />
      </article>
    );
  }

  return (
    <article data-faq-card="1" data-open={open ? "1" : "0"}>
      <h3>
        <button
          type="button"
          data-faq-toggle="1"
          id={toggleId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(item.id)}
        >
          {item.question ?? tFaq(item.questionKey)}
          <span data-faq-circle="1" aria-hidden="true">
            <span data-faq-chev="1">
              <Icon name="chevron-down" size={22} color="currentColor" />
            </span>
          </span>
        </button>
      </h3>
      <div data-faq-panel="1" id={panelId} role="region" aria-labelledby={toggleId}>
        <div data-faq-inner="1">
          {(item.answers ?? item.answerKeys).map((keyOrText, i) => (
            <p key={item.answerKeys[i] ?? `a-${i}`} data-faq-a="1">
              {item.answers ? keyOrText : tFaq(keyOrText)}
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}
