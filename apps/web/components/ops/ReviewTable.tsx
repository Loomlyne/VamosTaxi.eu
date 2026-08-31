"use client";

import "./ReviewTable.css";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteReview,
  moveReview,
  setReviewPublished,
} from "@/app/[locale]/(ops)/ops/reviews/actions";
import { Avatar, Button, Icon, IconButton } from "@/components/core";
import { Dialog } from "@/components/feedback/Dialog";
import { photoUrl } from "@/lib/ops/photos";
import type { ReviewRow, ReviewSource } from "@/lib/ops/reviews";
import { ReviewForm } from "./ReviewForm";
import { ReviewOrderControls } from "./ReviewOrderControls";

export type ReviewClassOption = { id: string; slug: string };

const PLATFORM: Record<Exclude<ReviewSource, "manual">, string> = {
  google: "Google",
  tripadvisor: "Tripadvisor",
  trustpilot: "Trustpilot",
};

function sourceLabel(source: ReviewSource, manual: string): string {
  if (source === "manual") return manual;
  return PLATFORM[source];
}

export function ReviewTable({
  rows,
  classOptions,
}: {
  rows: ReviewRow[];
  classOptions: ReviewClassOption[];
}) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [deleting, setDeleting] = useState<ReviewRow | null>(null);

  return (
    <div className="ops-reviews" data-testid="reviews-table">
      <div className="ops-reviews__toolbar">
        <Button
          data-testid="reviews-add"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t("reviews-add")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="ops-reviews__empty" data-testid="reviews-empty">
          <strong>{t("reviews-empty")}</strong>
          <p>{t("reviews-empty-body")}</p>
        </div>
      ) : (
        <div className="ops-reviews__list">
          {rows.map((row, index) => {
            const src = photoUrl(row.avatarPath);
            const classLabel = row.vehicleClassSlug ?? t("reviews-class-none");
            return (
              <article
                key={row.id}
                className="ops-reviews__row"
                data-review-id={row.id}
                data-review-source={row.source}
                data-review-published={row.published ? "1" : "0"}
                data-review-locked={row.locked ? "1" : "0"}
                data-off={row.published ? "0" : "1"}
              >
                <Avatar
                  name={row.authorName}
                  src={src ?? undefined}
                  size="md"
                  shape="circle"
                  data-testid="reviews-avatar"
                />
                <div className="ops-reviews__body">
                  <div className="ops-reviews__head">
                    <strong className="ops-reviews__name">{row.authorName}</strong>
                    <span className="ops-reviews__chip">
                      {sourceLabel(row.source, t("reviews-source-manual"))}
                    </span>
                    {row.locked ? (
                      <span className="ops-reviews__chip">
                        {t("reviews-from", {
                          platform: sourceLabel(row.source, t("reviews-source-manual")),
                        })}
                      </span>
                    ) : null}
                    {row.published ? null : (
                      <span className="ops-reviews__chip ops-reviews__chip--hairline">
                        {t("reviews-hidden")}
                      </span>
                    )}
                    {row.verified ? null : (
                      <span className="ops-reviews__chip ops-reviews__chip--hairline">
                        {t("reviews-unverified")}
                      </span>
                    )}
                  </div>
                  {row.body ? <p className="ops-reviews__quote">“{row.body}”</p> : null}
                  <div className="ops-reviews__meta">
                    <span
                      className="ops-reviews__stars"
                      role="img"
                      aria-label={`${row.rating}/5`}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Icon
                          key={n}
                          name="star"
                          size={12}
                          color={n <= row.rating ? "var(--vt-yellow)" : "var(--vt-grey-300)"}
                        />
                      ))}
                    </span>
                    <span>{row.authorRole}</span>
                    {row.routeLabel ? <span>{row.routeLabel}</span> : null}
                    <span>{classLabel}</span>
                  </div>
                </div>
                <div className="ops-reviews__actions" data-act="1">
                  <ReviewOrderControls
                    canUp={index > 0}
                    canDown={index < rows.length - 1}
                    upLabel={t("reviews-move-up")}
                    downLabel={t("reviews-move-down")}
                    onUp={() => {
                      startTransition(async () => {
                        await moveReview(row.id, "up");
                        router.refresh();
                      });
                    }}
                    onDown={() => {
                      startTransition(async () => {
                        await moveReview(row.id, "down");
                        router.refresh();
                      });
                    }}
                  />
                  <IconButton
                    icon={row.published ? "eye" : "eye-off"}
                    label={row.published ? t("reviews-unpublish") : t("reviews-publish")}
                    size="sm"
                    variant="outline"
                    data-testid="reviews-publish"
                    aria-pressed={row.published}
                    onClick={() => {
                      startTransition(async () => {
                        await setReviewPublished(row.id, !row.published);
                        router.refresh();
                      });
                    }}
                  />
                  <IconButton
                    icon="pencil"
                    label={t("reviews-edit")}
                    size="sm"
                    variant="outline"
                    data-testid="reviews-edit"
                    onClick={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  />
                  <IconButton
                    icon="trash-2"
                    label={t("reviews-remove")}
                    size="sm"
                    variant="outline"
                    data-testid="reviews-delete"
                    onClick={() => setDeleting(row)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen ? (
        <ReviewForm
          key={editing?.id ?? "new"}
          open={formOpen}
          row={editing}
          classOptions={classOptions}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      <Dialog
        open={deleting != null}
        title={t("reviews-delete")}
        closeLabel={t("reviews-close")}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t("reviews-cancel")}
            </Button>
            <Button
              variant="danger"
              data-testid="reviews-delete-confirm"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                startTransition(async () => {
                  await deleteReview(id);
                  setDeleting(null);
                  router.refresh();
                });
              }}
            >
              {t("reviews-delete")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("reviews-delete-body")}</p>
      </Dialog>
    </div>
  );
}
