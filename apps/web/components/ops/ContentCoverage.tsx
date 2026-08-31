import "./ContentCoverage.css";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import type { LegalDocCoverage } from "@/lib/ops/content";

const { Link } = createNavigation(routing);

export type ContentCoverageDoc = LegalDocCoverage & {
  title: string;
  href: string;
};

export function ContentCoverage({
  docs,
  seedNotice,
  totalLabel,
  pendingLabel,
  completeLabel,
  gapsLabel,
  openLabel,
}: {
  docs: ContentCoverageDoc[];
  seedNotice: string;
  totalLabel: (n: number) => string;
  pendingLabel: (n: number) => string;
  completeLabel: string;
  gapsLabel: (n: number) => string;
  openLabel: string;
}) {
  return (
    <div className="ops-coverage">
      <p className="ops-coverage__notice" role="note">
        {seedNotice}
      </p>
      <ul className="ops-coverage__list">
        {docs.map((doc) => {
          const gaps =
            doc.total * 4 -
            (doc.present.en + doc.present.de + doc.present.fr + doc.present.ar);
          const complete = gaps === 0 && doc.pendingValueCount === 0;
          return (
            <li
              key={doc.slug}
              className="ops-coverage__row"
              data-complete={complete ? "1" : "0"}
            >
              <div className="ops-coverage__copy">
                <h2>{doc.title}</h2>
                <p>
                  <span className="vt-dir-keep">{totalLabel(doc.total)}</span>
                  {" · "}
                  <span className="vt-dir-keep">EN {doc.present.en}</span>
                  {" · "}
                  <span className="vt-dir-keep">DE {doc.present.de}</span>
                  {" · "}
                  <span className="vt-dir-keep">FR {doc.present.fr}</span>
                  {" · "}
                  <span className="vt-dir-keep">AR {doc.present.ar}</span>
                </p>
                <p
                  className={
                    complete ? "ops-coverage__ok" : "ops-coverage__gap"
                  }
                >
                  {complete
                    ? completeLabel
                    : `${pendingLabel(doc.pendingValueCount)} · ${gapsLabel(gaps)}`}
                </p>
              </div>
              <Link href={doc.href} className="ops-coverage__open">
                {openLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
