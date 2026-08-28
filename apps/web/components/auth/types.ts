// D-06: mock AuthForm.dc.html line 296 —
// `const verified = this.state.mode === 'signin' || this.state.method === 'magic'`
// Only a brand-new password signup stays unverified. Derived, not settable.
// stage drops mock `verifying` (passkey wait, deferred) and `returning`
// (SSR redirect has no rendered state).

export type AuthMode = "signin" | "signup" | "forgot";
export type AuthMethod = "password" | "magic";
export type AuthStage = "form" | "sent";
export type AuthBanner = "credentials" | "registered" | null;

export function isVerifiedPath(mode: AuthMode, method: AuthMethod): boolean {
  return mode === "signin" || method === "magic";
}

export type AuthSubmitPayload =
  | { mode: "signin"; method: "password"; email: string; password: string }
  | { mode: "signin"; method: "magic"; email: string }
  | {
      mode: "signup";
      method: "password";
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }
  | { mode: "signup"; method: "magic"; email: string; firstName: string; lastName: string }
  | { mode: "forgot"; email: string };

export type AuthFormProps = {
  mode: AuthMode;
  method: AuthMethod;
  stage: AuthStage;
  banner: AuthBanner;
  pending?: boolean;
  fieldErrors?: Partial<Record<"email" | "password" | "firstName" | "lastName", string>>;
  onModeChange(m: AuthMode): void;
  onMethodChange(m: AuthMethod): void;
  onSubmit(payload: AuthSubmitPayload): void;
  onResend?(): void;
};

export type ResetFormProps = {
  stage: "form" | "saved" | "expired";
  email: string;
  pending?: boolean;
  fieldErrors?: Partial<Record<"password" | "confirm", string>>;
  onSubmit(password: string): void;
};
