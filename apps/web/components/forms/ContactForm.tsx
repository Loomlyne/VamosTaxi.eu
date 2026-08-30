"use client";

import "./ContactForm.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button, Icon } from "@/components/core";
import { Input, Textarea } from "@/components/forms";
import { Alert } from "@/components/feedback";
import { PendingSlot } from "@/components/legal";
import { contactSchema } from "@/lib/forms/schemas";
import { TurnstileWidget } from "./TurnstileWidget";

const { getPathname } = createNavigation(routing);

export type ContactFormPreviewState =
  | "idle"
  | "invalid"
  | "submitting"
  | "success"
  | "challenge-failed"
  | "service-unavailable";

export type ContactFormProps = {
  siteKey: string | undefined;
  locale: Locale;
  previewState?: ContactFormPreviewState;
};

type FieldErrors = {
  name?: string;
  email?: string;
  message?: string;
};

type UiState = "idle" | "invalid" | "submitting" | "success" | "challenge-failed" | "unavailable";

const PREVIEW_FILL = {
  name: "Ben Othman",
  email: "ben@example.com",
  phone: "+41 79 000 00 00",
  bookingRef: "VT-0000",
  message: "My flight lands two hours later than booked. Does the pickup move automatically?",
};

function mapPreview(preview?: ContactFormPreviewState): {
  ui: UiState;
  name: string;
  email: string;
  phone: string;
  bookingRef: string;
  message: string;
} {
  if (!preview || preview === "idle") {
    return { ui: "idle", name: "", email: "", phone: "", bookingRef: "", message: "" };
  }
  if (preview === "invalid") {
    return {
      ui: "invalid",
      name: "",
      email: "ben@example",
      phone: PREVIEW_FILL.phone,
      bookingRef: PREVIEW_FILL.bookingRef,
      message: "Delayed",
    };
  }
  if (preview === "success") {
    return { ui: "success", ...PREVIEW_FILL };
  }
  if (preview === "submitting") {
    return { ui: "submitting", ...PREVIEW_FILL };
  }
  if (preview === "challenge-failed") {
    return { ui: "challenge-failed", ...PREVIEW_FILL };
  }
  return { ui: "unavailable", ...PREVIEW_FILL };
}

export function ContactForm({ siteKey, locale, previewState }: ContactFormProps) {
  const tContact = useTranslations("contact");
  const tCommon = useTranslations("common");
  const tPartner = useTranslations("partner");
  const initial = mapPreview(previewState);
  const [ui, setUi] = useState<UiState>(initial.ui);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [bookingRef, setBookingRef] = useState(initial.bookingRef);
  const [message, setMessage] = useState(initial.message);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [token, setToken] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const successRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const previewErrors: FieldErrors =
    previewState === "invalid"
      ? {
          name: tPartner("tell-us-what-to-call-you"),
          email: tPartner("that-address-is-missing-something-check-it-over"),
          message: tContact("a-line-or-two-more-so-we-can-answer-properly"),
        }
      : {};
  const shownErrors = Object.keys(fieldErrors).length > 0 ? fieldErrors : previewErrors;

  const privacyHref = getPathname({ href: "/privacy", locale });
  const homeHref = getPathname({ href: "/", locale });
  const sending = ui === "submitting";
  const preview = previewState !== undefined;

  useEffect(() => {
    if (ui === "success") successRef.current?.focus();
    if (ui === "invalid") alertRef.current?.focus();
  }, [ui]);

  function errorsFromZod(): FieldErrors {
    const parsed = contactSchema.safeParse({
      name,
      email,
      phone,
      bookingRef,
      message,
      locale,
      turnstileToken: "placeholder-token",
      idempotencyKey,
    });
    if (parsed.success) return {};
    const next: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name") next.name = tPartner("tell-us-what-to-call-you");
      if (key === "email") {
        next.email =
          email.trim().length === 0
            ? tContact("we-need-an-address-to-reply-to")
            : tPartner("that-address-is-missing-something-check-it-over");
      }
      if (key === "message") next.message = tContact("tell-us-what-you-need");
    }
    return next;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending || preview) return;

    const nextErrors = errorsFromZod();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setUi("invalid");
      return;
    }
    if (!token) {
      setUi("challenge-failed");
      setResetNonce((n) => n + 1);
      return;
    }

    setFieldErrors({});
    setUi("submitting");

    const body = {
      name: name.trim(),
      email: email.trim(),
      phone,
      bookingRef,
      message: message.trim(),
      locale,
      turnstileToken: token,
      idempotencyKey,
    };

    let res: Response;
    try {
      res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setUi("unavailable");
      setResetNonce((n) => n + 1);
      return;
    }

    let json: { ok?: boolean; created?: boolean; code?: string } = {};
    try {
      json = (await res.json()) as { ok?: boolean; created?: boolean; code?: string };
    } catch {
      setUi("unavailable");
      setResetNonce((n) => n + 1);
      return;
    }

    if (res.status === 200 && json.ok === true) {
      setUi("success");
      setIdempotencyKey(crypto.randomUUID());
      setToken(null);
      setResetNonce((n) => n + 1);
      return;
    }

    const code = json.code;
    if (res.status === 403 || code === "challenge_failed") {
      setUi("challenge-failed");
      setToken(null);
      setResetNonce((n) => n + 1);
      return;
    }
    if (res.status === 400 || code === "invalid_input") {
      const again = errorsFromZod();
      if (Object.keys(again).length > 0) {
        setFieldErrors(again);
        setUi("invalid");
      } else {
        setUi("unavailable");
      }
      setResetNonce((n) => n + 1);
      return;
    }
    setUi("unavailable");
    setResetNonce((n) => n + 1);
  }

  function resetForm() {
    setUi("idle");
    setName("");
    setEmail("");
    setPhone("");
    setBookingRef("");
    setMessage("");
    setFieldErrors({});
    setToken(null);
    setIdempotencyKey(crypto.randomUUID());
    setResetNonce((n) => n + 1);
  }

  const errorCount = Object.keys(shownErrors).length;

  if (ui === "success") {
    return (
      <div
        className="vt-contact-success"
        ref={successRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-contact-state="success"
      >
        <div className="vt-contact-success__mark">
          <Icon name="circle-check" size={24} color="var(--vt-success)" />
        </div>
        <h3>{tContact("message-received")}</h3>
        <p>
          {tContact("a-copy-is-on-its-way-to")}{" "}
          <strong className="vt-contact-success__email">{email}</strong>
        </p>
        <p>
          {tContact("we-answer-within")} <PendingSlot label={tContact("response-time")} />
          {tContact("if-your-travel-is-sooner-than-that-call-us-on-th")}
        </p>
        <div className="vt-contact-success__actions">
          <Button size="md" variant="secondary" type="button" onClick={resetForm}>
            {tContact("send-another-message")}
          </Button>
          <Button size="md" variant="ghost" href={homeHref}>
            {tPartner("back-to-home")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="vt-contact-form"
      noValidate
      onSubmit={onSubmit}
      data-contact-state={ui === "unavailable" ? "service-unavailable" : ui}
    >
      {ui === "invalid" ? (
        <div ref={alertRef} tabIndex={-1} role="alert">
          <Alert
            tone="danger"
            title={
              errorCount === 1
                ? tPartner("one-field-needs-your-attention")
                : tContact("fieldsNeedAttentionCount", { n: errorCount || 3 })
            }
          >
            {tPartner("nothing-has-been-sent-the-fields-below-are-marke")}
          </Alert>
        </div>
      ) : null}

      {ui === "unavailable" ? (
        <div role="alert" data-contact-code="unavailable">
          <Alert tone="danger" title={tContact("your-message-did-not-send")}>
            {tContact("something-on-our-side-failed-not-yours-your-text")}
          </Alert>
        </div>
      ) : null}

      <div className="vt-contact-form__row">
        <Input
          id="ct-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder={tContact("your-name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={sending}
          error={shownErrors.name}
          label={tContact("your-name")}
        />
        <Input
          id="ct-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={tCommon("email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          error={shownErrors.email}
          label={tCommon("email")}
        />
      </div>

      <div className="vt-contact-form__row">
        <Input
          id="ct-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder={tCommon("phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={sending}
          label={
            <>
              {tCommon("phone")} <span className="vt-contact-form__label-extra">{tContact("optional")}</span>
            </>
          }
          hint={tContact("faster-than-email-if-we-need-one-detail-from-you")}
        />
        <Input
          id="ct-ref"
          name="bookingRef"
          type="text"
          placeholder={tCommon("booking-reference")}
          value={bookingRef}
          onChange={(e) => setBookingRef(e.target.value)}
          disabled={sending}
          label={
            <>
              {tCommon("booking-reference")}{" "}
              <span className="vt-contact-form__label-extra">{tContact("if-you-have-one")}</span>
            </>
          }
          hint={tContact("top-of-your-confirmation-email-it-puts-your-mess")}
        />
      </div>

      <Textarea
        id="ct-msg"
        name="message"
        placeholder={tContact("tell-us-what-you-need-if-it-concerns-a-journey-t")}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={sending}
        error={shownErrors.message}
        label={tContact("how-can-we-help")}
        rows={5}
      />

      <TurnstileWidget
        siteKey={siteKey}
        action="contact"
        onToken={setToken}
        resetNonce={resetNonce}
      />
      {ui === "challenge-failed" ? (
        <p className="vt-contact-form__challenge-msg" role="alert" data-contact-code="challenge_failed">
          {tCommon("form-challenge-failed")}
        </p>
      ) : null}

      <div className="vt-contact-form__actions">
        {sending ? (
          <span className="vt-contact-form__sending">
            <span className="vt-contact-form__spin">
              <Icon name="loader-circle" size={18} color="currentColor" />
            </span>
            {tPartner("sending")}
          </span>
        ) : (
          <Button size="lg" type="submit" iconEnd="arrow-right">
            {tContact("send-message")}
          </Button>
        )}
        <p className="vt-contact-form__privacy">
          {tContact("we-use-what-you-write-here-to-answer-you-and-not")}{" "}
          <a href={privacyHref}>{tCommon("privacy-policy")}</a>.
        </p>
      </div>
    </form>
  );
}
