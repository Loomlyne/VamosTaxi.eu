"use client";

import { useState } from "react";
import { AuthForm, ResetForm } from "@/components/auth";
import type { AuthBanner, AuthFormProps, AuthMethod, AuthMode, AuthStage } from "@/components/auth";

const noop = () => undefined;

function Tile({
  label,
  mode,
  method,
  stage,
  banner = null,
  pending,
  fieldErrors,
}: {
  label: string;
  mode: AuthMode;
  method: AuthMethod;
  stage: AuthStage;
  banner?: AuthBanner;
  pending?: boolean;
  fieldErrors?: AuthFormProps["fieldErrors"];
}) {
  return (
    <section data-auth-state={label}>
      <p data-i18n-skip>{label}</p>
      <AuthForm
        mode={mode}
        method={method}
        stage={stage}
        banner={banner}
        pending={pending}
        fieldErrors={fieldErrors}
        onModeChange={noop}
        onMethodChange={noop}
        onSubmit={noop}
        onResend={noop}
      />
    </section>
  );
}

function LiveInvalid() {
  const [banner, setBanner] = useState<AuthBanner>(null);
  return (
    <section data-auth-state="live-invalid">
      <p data-i18n-skip>live invalid email</p>
      <AuthForm
        mode="signin"
        method="password"
        stage="form"
        banner={banner}
        onModeChange={noop}
        onMethodChange={noop}
        onSubmit={() => setBanner("credentials")}
        onResend={noop}
      />
    </section>
  );
}

export function AuthGallery() {
  return (
    <div>
      <p data-i18n-skip>
        Deferred: passkey/verifying, surface=ops (Phase 6), signup enumeration default is
        non-distinguishing; registered banner remains gallery-only.
      </p>
      <Tile label="signin-password-form" mode="signin" method="password" stage="form" />
      <Tile label="signin-magic-form" mode="signin" method="magic" stage="form" />
      <Tile label="signup-password-form" mode="signup" method="password" stage="form" />
      <Tile label="signup-magic-form" mode="signup" method="magic" stage="form" />
      <Tile label="forgot-form" mode="forgot" method="password" stage="form" />
      <Tile label="signin-sent" mode="signin" method="magic" stage="sent" />
      <Tile label="signup-sent" mode="signup" method="password" stage="sent" />
      <Tile label="forgot-sent" mode="forgot" method="password" stage="sent" />
      <Tile
        label="credentials"
        mode="signin"
        method="password"
        stage="form"
        banner="credentials"
      />
      <Tile
        label="registered"
        mode="signup"
        method="password"
        stage="form"
        banner="registered"
      />
      <Tile label="pending" mode="signin" method="password" stage="form" pending />
      <Tile
        label="field-errors"
        mode="signup"
        method="password"
        stage="form"
        fieldErrors={{ email: "x", password: "x" }}
      />
      <LiveInvalid />
      <section data-auth-state="reset-form">
        <p data-i18n-skip>reset form</p>
        <ResetForm stage="form" email="anna@example.test" onSubmit={noop} />
      </section>
      <section data-auth-state="reset-saved">
        <p data-i18n-skip>reset saved</p>
        <ResetForm stage="saved" email="anna@example.test" onSubmit={noop} />
      </section>
      <section data-auth-state="reset-expired">
        <p data-i18n-skip>reset expired</p>
        <ResetForm stage="expired" email="anna@example.test" onSubmit={noop} />
      </section>
    </div>
  );
}
