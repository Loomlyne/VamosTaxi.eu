"use client";

import "../data/Table.css";
import "./ContentStringTable.css";
import { useTranslations } from "next-intl";
import { ContentStringRow } from "./ContentStringRow";
import type { ContentStringRow as ContentStringRowData } from "@/lib/ops/content";

export function ContentStringTable({
  rows,
}: {
  rows: ContentStringRowData[];
}) {
  const t = useTranslations("ops");

  return (
    <div className="vt-tablewrap" data-lenis-prevent data-ops-content-table="1">
      <table className="vt-table">
        <thead>
          <tr>
            <th>{t("content-key")}</th>
            <th>{t("content-en")}</th>
            <th>{t("content-de")}</th>
            <th>{t("content-fr")}</th>
            <th>{t("content-ar")}</th>
            <th>{t("content-flags")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="vt-table__state" colSpan={6}>
                {t("content-empty")}
              </td>
            </tr>
          ) : (
            rows.map((row) => <ContentStringRow key={row.key} row={row} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
