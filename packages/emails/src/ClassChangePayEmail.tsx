// packages/emails/src/ClassChangePayEmail.tsx
//
// 26.2 P1: a dearer class change on a paid trip. The customer pays the difference on Stripe's page
// within 24 hours; then the booking changes class by itself. Wording approved by the owner word for
// word in four languages (.planning/decisions/2026-10-01-class-change-pay-mail.md): subject,
// heading, text, button — nothing else is said. Same light chrome as the pay-link mail. Amounts
// through the shared money formatter; never a typed CHF figure.

import type { ReactNode } from "react";
import { Body, Button, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import { formatPaidTotal } from "./ConfirmationEmail";
import { BODY_FONT, CHARCOAL, DISPLAY_FONT, GREY, LOGO, WHITE, YELLOW } from "./chrome";
import { t } from "./lib/t";
import type { ClassChangePayForEmail } from "./lib/types";

type Vars = { reference: string; className: string; newTotal: string; paid: string; difference: string };

function vars(mail: ClassChangePayForEmail): Vars {
  return {
    reference: mail.reference,
    className: mail.className,
    newTotal: formatPaidTotal(mail.newTotalRappen),
    paid: formatPaidTotal(mail.paidRappen),
    difference: formatPaidTotal(mail.differenceRappen),
  };
}

/** The four approved lines with this booking's values. */
export function classChangePayCopy(mail: ClassChangePayForEmail): {
  subject: string;
  heading: string;
  text: string;
  button: string;
} {
  const v = vars(mail);
  return {
    subject: t(mail.locale, "classChangePay.subject", v),
    heading: t(mail.locale, "classChangePay.heading", v),
    text: t(mail.locale, "classChangePay.text", v),
    button: t(mail.locale, "classChangePay.button", v),
  };
}

function ltr(value: string, key: string): ReactNode {
  return (
    <span key={key} style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

/** The approved text with each value in a left-to-right island (references and CHF never flip in Arabic). */
function islands(template: string, v: Vars): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let n = 0;
  for (const m of template.matchAll(/\{(reference|className|newTotal|paid|difference)\}/g)) {
    const index = m.index ?? 0;
    if (index > at) out.push(template.slice(at, index));
    out.push(ltr(v[m[1] as keyof Vars], `v${n++}`));
    at = index + m[0].length;
  }
  if (at < template.length) out.push(template.slice(at));
  return out;
}

const RAW_TEXT_KEY = "classChangePay.text";

function rawTemplate(mail: ClassChangePayForEmail): string {
  // t() with no values leaves the {placeholders} in place.
  return t(mail.locale, RAW_TEXT_KEY);
}

export function ClassChangePayEmail({ mail }: { mail: ClassChangePayForEmail }) {
  const locale = mail.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const copy = classChangePayCopy(mail);
  const v = vars(mail);
  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`:root{color-scheme:light only!important}body{background-color:${GREY}!important;color:${CHARCOAL}!important}`}</style>
      </Head>
      <Preview>{copy.heading}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: GREY, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ backgroundColor: WHITE, padding: "28px 32px 20px" }}>
            <Img
              src={LOGO}
              width={216}
              height={30}
              alt="Vamos Taxi"
              style={{ display: "block", border: "0", outline: "none", width: "216px", height: "30px" }}
            />
            <Text
              style={{
                margin: "20px 0 0",
                fontFamily: DISPLAY_FONT,
                fontSize: "28px",
                lineHeight: "34px",
                fontWeight: 600,
                color: CHARCOAL,
              }}
            >
              {copy.heading}
            </Text>
          </Section>

          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>&nbsp;</Section>

          <Section style={{ backgroundColor: WHITE, padding: "28px 32px 32px" }}>
            <Text style={{ margin: 0, fontSize: "16px", lineHeight: "26px", color: CHARCOAL }}>
              {islands(rawTemplate(mail), v)}
            </Text>
            <Button
              href={mail.payUrl}
              style={{
                backgroundColor: YELLOW,
                color: CHARCOAL,
                fontFamily: BODY_FONT,
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textDecoration: "none",
                padding: "16px 28px",
                marginTop: "24px",
                borderRadius: "999px",
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                textAlign: "center",
              }}
            >
              {copy.button}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function classChangePayPlainText(mail: ClassChangePayForEmail): string {
  const copy = classChangePayCopy(mail);
  return [copy.heading, copy.text, copy.button, mail.payUrl].join("\n\n");
}

export function classChangePaySubject(mail: ClassChangePayForEmail): string {
  return classChangePayCopy(mail).subject;
}
