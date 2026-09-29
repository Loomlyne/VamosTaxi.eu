"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { AccountChoice } from "@/components/checkout/AccountChoice";
import type { AccountChoiceProps, AccountChoiceValue } from "@/components/checkout/AccountChoice";
import { CheckoutSignIn } from "@/components/checkout/CheckoutSignIn";
import type { CheckoutSignInPreview, CheckoutSignInStage } from "@/components/checkout/CheckoutSignIn";
import type { FetchLike } from "@/components/checkout/account-sign-in-api";

// States gallery for the 26.5 account choice (CLAUDE.md: a component with states gets a
// gallery). English scaffold on purpose (review-scaffold exemption): only the component
// copy inside the tiles is translated, so /de, /fr, /ar flip the tiles and the page to RTL.
// Hover, press and focus are live pointer/keyboard states, so they are reached by using the
// tiles, not forced. Every fetch here is mocked: nothing calls /api/auth.

const json = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mocks: Record<string, FetchLike> = {
  ok: async (_u, init) => {
    const b = JSON.parse(String(init?.body ?? "{}"));
    if (b.mode === "verify-code") {
      return new Response(JSON.stringify(b.code === "000000" ? { ok: false, reason: "code-invalid" } : { ok: true }), {
        status: b.code === "000000" ? 400 : 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ stage: "sent" }), { status: 200, headers: { "content-type": "application/json" } });
  },
  rate: json(429, { ok: false, reason: "rate-limited" }),
  fail: json(400, { stage: "form", banner: "send_failed" }),
};

const CHOICE_BASE: Omit<AccountChoiceProps, "value" | "onChange"> = {
  guestAccountsOn: true,
  createAvailable: true,
  createConsent: false,
  onCreateConsent: () => {},
  createConsentError: null,
  error: null,
  disabled: false,
};

function Tile({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section data-gal-tile="1">
      <h3>{title}</h3>
      {note ? <p data-gal-note="1">{note}</p> : null}
      {children}
    </section>
  );
}

function ChoiceTile({
  title,
  note,
  start,
  over,
}: {
  title: string;
  note?: string;
  start: AccountChoiceValue;
  over?: Partial<AccountChoiceProps>;
}) {
  const [value, setValue] = useState<AccountChoiceValue>(start);
  const [consent, setConsent] = useState(over?.createConsent ?? false);
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<CheckoutSignInStage>("form");
  const locale = useLocale();
  return (
    <Tile title={title} note={note}>
      <AccountChoice
        {...CHOICE_BASE}
        {...over}
        value={value}
        onChange={setValue}
        createConsent={consent}
        onCreateConsent={setConsent}
      >
        <CheckoutSignIn
          email={email}
          onEmail={setEmail}
          locale={locale}
          returnTo="/checkout"
          turnstileSiteKey={undefined}
          stage={stage}
          onStage={setStage}
          onSignedIn={() => {}}
          payBlockError={null}
          disabled={false}
          fetchImpl={mocks.ok}
        />
      </AccountChoice>
    </Tile>
  );
}

function SignInTile({
  title,
  note,
  startStage,
  preview,
  mock = "ok",
}: {
  title: string;
  note?: string;
  startStage: CheckoutSignInStage;
  preview?: CheckoutSignInPreview;
  mock?: keyof typeof mocks;
}) {
  const [email, setEmail] = useState("guest@example.com");
  const [stage, setStage] = useState<CheckoutSignInStage>(startStage);
  const locale = useLocale();
  return (
    <Tile title={title} note={note}>
      <CheckoutSignIn
        email={email}
        onEmail={setEmail}
        locale={locale}
        returnTo="/checkout"
        turnstileSiteKey={undefined}
        stage={stage}
        onStage={setStage}
        onSignedIn={() => {}}
        payBlockError={null}
        disabled={false}
        fetchImpl={mocks[mock]}
        previewState={preview}
      />
    </Tile>
  );
}

export function CheckoutAccountGallery() {
  return (
    <main data-gal-page="1">
      <style>{`
        [data-gal-page]{max-inline-size:1200px;margin-inline:auto;padding-block:32px;padding-inline:clamp(20px,5vw,56px);display:flex;flex-direction:column;gap:32px}
        [data-gal-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:24px}
        [data-gal-tile]{border:1px solid var(--vt-border-subtle);border-radius:var(--vt-radius-lg);padding:var(--vt-space-4);background:var(--vt-bg-surface);min-inline-size:0;display:flex;flex-direction:column;gap:var(--vt-space-3)}
        [data-gal-tile] h3{margin:0;font-size:16px}
        [data-gal-note]{margin:0;font-size:13px;color:var(--vt-text-secondary)}
      `}</style>
      <h1>Checkout account choice: states</h1>
      <p data-gal-note="1">
        Dev only. Fetch is mocked on this page. Hover, press and focus are live: use the tiles. To see the
        code error, type 000000 in the code field.
      </p>

      <h2>AccountChoice</h2>
      <div data-gal-grid="1">
        <ChoiceTile title="Default: guest preselected, switch on" start="guest" />
        <ChoiceTile title="Guest, switch off (D-09): nothing under the group" start="guest" over={{ guestAccountsOn: false }} />
        <ChoiceTile title="Selected: sign in" start="signin" />
        <ChoiceTile title="Create, unticked" start="create" />
        <ChoiceTile title="Create, ticked" start="create" over={{ createConsent: true }} />
        <ChoiceTile
          title="Create, consent error"
          start="create"
          over={{ createConsentError: "Tick the box to accept the Terms and confirm the Privacy notice." }}
        />
        <ChoiceTile title="Group error" start="signin" over={{ error: "Sign in first, or continue as a guest." }} />
        <ChoiceTile title="Disabled (PAY loading or link sending)" start="guest" over={{ disabled: true }} />
        <ChoiceTile title="Create unavailable: two options" start="guest" over={{ createAvailable: false }} />
      </div>

      <h2>CheckoutSignIn</h2>
      <div data-gal-grid="1">
        <SignInTile title="Form" startStage="form" note="EMAIL ME A SIGN-IN LINK moves to the sent stage (mocked)." />
        <SignInTile title="Form, sending" startStage="form" preview="sending" />
        <SignInTile title="Form, rate limited" startStage="form" preview="rate-limited" />
        <SignInTile title="Form, send failed" startStage="form" preview="send-failed" />
        <SignInTile title="Sent" startStage="sent" />
        <SignInTile title="Sent, resent" startStage="sent" preview="resent" />
        <SignInTile title="Sent, rate limited" startStage="sent" preview="rate-limited" />
        <SignInTile title="Sent, code error" startStage="sent" preview="code-error" />
        <SignInTile title="Sent, resend answers 429 (press it)" startStage="sent" mock="rate" />
        <SignInTile title="Form, send answers failed (press it)" startStage="form" mock="fail" />
      </div>
    </main>
  );
}
