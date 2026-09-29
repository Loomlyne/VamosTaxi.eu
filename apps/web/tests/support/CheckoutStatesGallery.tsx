// Test-only harness for tests/visual/checkout-states.spec.ts (26.3-19). Never routed by
// the Worker: mountPort renders it statically with the parts' own CSS. Shows every state
// of PayBar, DisclosureRow and ExtraRow side by side, in English and in Arabic (RTL).
import { PayBar, type PayBarState } from "../../components/checkout/PayBar";
import { DisclosureRow } from "../../components/checkout/DisclosureRow";
import { ExtraRow } from "../../components/checkout/ExtraRow";

const COPY = {
  en: {
    total: "Total",
    pay: "Pay",
    opening: "Opening payment",
    chooseClass: "Choose a class",
    updating: "Updating price",
    failed: "Payment did not start. Try Pay again.",
    reassure: "No charge until the Stripe page.",
    optional: "Optional",
    company: "Need a company receipt?",
    note: "Add a note for the driver",
    seat: "Child seat",
    pet: "Pet crate",
    dir: "ltr",
  },
  ar: {
    total: "الإجمالي",
    pay: "ادفع",
    opening: "جارٍ فتح الدفع",
    chooseClass: "اختر فئة",
    updating: "جارٍ تحديث السعر",
    failed: "لم يبدأ الدفع. حاول الدفع مرة أخرى.",
    reassure: "لا يتم خصم أي مبلغ قبل صفحة Stripe.",
    optional: "اختياري",
    company: "هل تحتاج إلى إيصال للشركة؟",
    note: "أضف ملاحظة للسائق",
    seat: "مقعد أطفال",
    pet: "صندوق حيوانات أليفة",
    dir: "rtl",
  },
} as const;

const STATES: PayBarState[] = ["idle", "disabled", "loading", "error"];

export function CheckoutStatesGallery({ lang }: { lang: "en" | "ar" }) {
  const c = COPY[lang];
  return (
    <div dir={c.dir} lang={lang} style={{ padding: 16, display: "grid", gap: 24, maxInlineSize: 1000 }} data-gallery={lang}>
      <section data-gallery-bars style={{ display: "grid", gap: 12 }}>
        {STATES.map((state) => (
          <div key={state} data-gallery-bar={state}>
            <PayBar
              variant="bar"
              state={state}
              totalLabel={c.total}
              total="CHF 000"
              payLabel={c.pay}
              payAmount="CHF 000"
              loadingLabel={c.opening}
              error={c.failed}
              onTotal={() => {}}
            />
          </div>
        ))}
        <div data-gallery-bar="no-class">
          <PayBar variant="bar" totalLabel={c.total} totalNote={c.chooseClass} payLabel={c.pay} loadingLabel={c.opening} />
        </div>
        <div data-gallery-bar="updating">
          <PayBar variant="bar" totalLabel={c.total} totalNote={c.updating} payLabel={c.pay} loadingLabel={c.opening} />
        </div>
      </section>

      <section data-gallery-rails style={{ display: "grid", gap: 12, inlineSize: 360 }}>
        {STATES.map((state) => (
          <div key={state} data-gallery-rail={state}>
            <PayBar
              variant="rail"
              state={state}
              totalLabel={c.total}
              total="CHF 000"
              payLabel={c.pay}
              payAmount="CHF 000"
              loadingLabel={c.opening}
              error={c.failed}
              reassurance={c.reassure}
            />
          </div>
        ))}
      </section>

      <section data-gallery-disclosures>
        <DisclosureRow id="g-company" icon="briefcase" label={c.company} optionalLabel={c.optional} open={false} onToggle={() => {}}>
          <p>x</p>
        </DisclosureRow>
        <DisclosureRow id="g-note" icon="message-circle" label={c.note} optionalLabel={c.optional} open onToggle={() => {}}>
          <p data-gallery-open-panel>x</p>
        </DisclosureRow>
      </section>

      <section data-gallery-extras>
        <ExtraRow code="child-seat" name={c.seat} amount="CHF 000" checked={false} onChange={() => {}} />
        <ExtraRow code="pet-crate" name={c.pet} amount="CHF 000" checked onChange={() => {}} />
        <ExtraRow code="updating" name={c.seat} amount="CHF 000" checked updating onChange={() => {}} />
        <ExtraRow code="disabled" name={c.pet} amount="CHF 000" checked={false} disabled onChange={() => {}} />
      </section>
    </div>
  );
}
