// packages/emails/src/PayLinkEmail.tsx
//
// Unpaid pay-link. Amounts CHF 000 until pricing_live. No glow.

import { Body, Button, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import { formatPaidTotal } from "./ConfirmationEmail";
import type { EmailLocale, PayLinkForEmail } from "./lib/types";
import { t } from "./lib/t";

const CHARCOAL = "#1E1F1F";
const GREY = "#DEDEDE";
const YELLOW = "#FDC20B";
const WHITE = "#FFFFFF";
const MUTED = "#545756";
const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';

export function PayLinkEmail({ link }: { link: PayLinkForEmail }) {
  const locale: EmailLocale = link.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const amount = formatPaidTotal(link.totalRappen);

  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{t(locale, "payLink.preheader")}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: GREY, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ padding: "28px 32px 20px" }}>
            <Text style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "28px", fontWeight: 600, color: CHARCOAL }}>
              Vamos Taxi
            </Text>
          </Section>
          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>
          <Section style={{ padding: "28px 32px 32px" }}>
            <Text style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "24px", fontWeight: 600, color: CHARCOAL }}>
              {t(locale, "payLink.headline")}
            </Text>
            <Text style={{ margin: "12px 0 0", fontSize: "14px", color: MUTED }}>
              {t(locale, "payLink.referenceLabel")} {link.reference}
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: "16px", color: CHARCOAL }}>{link.pickupText}</Text>
            <Text style={{ margin: "4px 0 0", fontSize: "16px", color: CHARCOAL }}>{link.dropoffText}</Text>
            <Text style={{ margin: "16px 0 0", fontSize: "14px", color: MUTED }}>{t(locale, "payLink.unpaid")}</Text>
            <Text style={{ margin: "8px 0 0", fontSize: "12px", color: MUTED, textTransform: "uppercase" }}>
              {t(locale, "payLink.amountLabel")}
            </Text>
            <Text style={{ margin: "4px 0 0", fontFamily: DISPLAY_FONT, fontSize: "22px", fontWeight: 700 }}>
              {amount}
            </Text>
            <Button
              href={link.payUrl}
              style={{
                backgroundColor: YELLOW,
                color: CHARCOAL,
                padding: "14px 22px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-block",
                marginTop: "24px",
              }}
            >
              {t(locale, "payLink.payCta")}
            </Button>
            <Text style={{ margin: "20px 0 0", fontSize: "13px", color: MUTED }}>{t(locale, "payLink.holdLine")}</Text>
            <Text style={{ margin: "24px 0 0", fontSize: "12px", color: MUTED }}>{t(locale, "payLink.footer")}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
