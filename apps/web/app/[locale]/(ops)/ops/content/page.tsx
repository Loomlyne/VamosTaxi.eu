import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createNavigation } from "next-intl/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/core";
import { Input, Select } from "@/components/forms";
import { ContentStringTable } from "@/components/ops";
import { routing } from "@/i18n/routing";
import {
  CONTENT_FILTERS,
  loadContentStrings,
  loadNamespaces,
  parseContentFilter,
  type ContentFilter,
} from "@/lib/ops/content";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const { Link } = createNavigation(routing);

const PAGE_SIZE = 50;

type Query = {
  namespace?: string;
  q?: string;
  filter?: string;
  page?: string;
};

function contentHref(opts: {
  namespace?: string;
  q?: string;
  filter?: ContentFilter;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (opts.namespace) sp.set("namespace", opts.namespace);
  if (opts.q) sp.set("q", opts.q);
  if (opts.filter && opts.filter !== "all") sp.set("filter", opts.filter);
  if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
  const qs = sp.toString();
  return qs ? `/ops/content?${qs}` : "/ops/content";
}

export default async function OpsContentPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const claims = await requireStaffClaims(supabase as StaffAuthClient);
  const { env } = getCloudflareContext();
  const t = await getTranslations("ops");

  const namespace = query.namespace?.trim() || undefined;
  const search = query.q?.trim() || undefined;
  const filter = parseContentFilter(query.filter);
  const page = Math.max(Number.parseInt(query.page ?? "1", 10) || 1, 1);

  const [namespaces, list] = await Promise.all([
    loadNamespaces(env, claims),
    loadContentStrings(env, claims, {
      namespace,
      search,
      filter,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(Math.ceil(list.total / PAGE_SIZE), 1);
  const filterLabels: Record<ContentFilter, string> = {
    all: t("content-filter-all"),
    untranslated: t("content-filter-untranslated"),
    pending: t("content-filter-pending"),
    nonTranslatable: t("content-filter-non-translatable"),
    noParamOptOut: t("content-filter-no-param"),
    recentlyEdited: t("content-filter-recent"),
  };
  const filterOptions = CONTENT_FILTERS.map((value) => ({
    value,
    label: filterLabels[value],
  }));

  return (
    <section data-ops-content="1">
      <header className="ops-content__header">
        <div>
          <h1>{t("content-title")}</h1>
          <p>{t("content-subtitle")}</p>
        </div>
        <div className="ops-content__header-actions">
          <Button href="/ops/content/legal" variant="secondary" size="md">
            {t("content-open-legal")}
          </Button>
        </div>
      </header>

      <div data-set-grid="1">
        <nav data-set-rail="1" aria-label={t("content-title")}>
          <Link
            href={contentHref({ q: search, filter })}
            data-set-item="1"
            data-on={!namespace ? "1" : "0"}
          >
            <span>{t("content-namespace-all")}</span>
          </Link>
          {namespaces.map((item) => (
            <Link
              key={item.namespace}
              href={contentHref({ namespace: item.namespace, q: search, filter })}
              data-set-item="1"
              data-on={namespace === item.namespace ? "1" : "0"}
              data-namespace={item.namespace}
            >
              <span>{item.namespace}</span>
              <span className="ops-content__ns-count vt-dir-keep">{item.count}</span>
            </Link>
          ))}
        </nav>

        <div className="ops-content__panel">
          <form className="ops-content__toolbar" action="/ops/content" method="get">
            {namespace ? <input type="hidden" name="namespace" value={namespace} /> : null}
            <Select
              name="filter"
              label={t("filter")}
              defaultValue={filter}
              options={filterOptions}
            />
            <Input
              name="q"
              label={t("content-search")}
              defaultValue={search ?? ""}
            />
            <Button type="submit" variant="secondary">
              {t("search")}
            </Button>
          </form>

          <ContentStringTable rows={list.rows} />

          <div className="ops-content__pager">
            <span className="vt-dir-keep">
              {t("content-page-of", { page, pages, total: list.total })}
            </span>
            {page > 1 ? (
              <Link href={contentHref({ namespace, q: search, filter, page: page - 1 })}>
                {t("content-page-prev")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={contentHref({ namespace, q: search, filter, page: page + 1 })}>
                {t("content-page-next")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
