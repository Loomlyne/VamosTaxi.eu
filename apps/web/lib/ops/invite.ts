// apps/web/lib/ops/invite.ts
//
// Pinned invite redirect + role narrowing. Nothing here may read a request,
// a header, or a body field — redirectTo is a compile-time origin chosen by
// DEPLOY_ENV, then `/login` on the dashboard host (D-06). Never derived from request input.

export type InviteRole = "dispatcher" | "admin";

const PRODUCTION_ORIGIN = "https://dashboard.vamostaxi.site";
const STAGING_ORIGIN = "https://dashboard.vamostaxi.site";
const LOCAL_ORIGIN = "http://127.0.0.1:3000";

export const INVITE_ERROR = {
  invalid_input: "invalid_input",
  invite_delivery_unconfigured: "invite_delivery_unconfigured",
  already_invited: "already_invited",
  invite_failed: "invite_failed",
  staff_row_failed: "staff_row_failed",
} as const;

export type InviteErrorCode = (typeof INVITE_ERROR)[keyof typeof INVITE_ERROR];

/**
 * Single pinned redirect target for `inviteUserByEmail`. Staging and
 * production share the dashboard host (D-01a). Local next-dev uses the
 * loopback origin 06-02 put on the Auth redirect allow-list.
 */
export function opsInviteRedirectUrl(): string {
  const deployEnv = process.env.DEPLOY_ENV;
  const origin =
    deployEnv === "staging"
      ? STAGING_ORIGIN
      : deployEnv === "production" || process.env.NODE_ENV === "production"
        ? PRODUCTION_ORIGIN
        : LOCAL_ORIGIN;
  return `${origin}/login`;
}

export function assertInviteRole(value: unknown): InviteRole {
  if (value === "dispatcher" || value === "admin") return value;
  throw new Error(INVITE_ERROR.invalid_input);
}

export type EstablishInviteSession = (input: {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
}) => Promise<{ ok: boolean }>;

export type SetInvitePassword = (password: string) => Promise<{ ok: boolean }>;

export type StartTotpEnrol = () => Promise<
  { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false }
>;

export type ChallengeTotp = (factorId: string) => Promise<{ ok: true; challengeId: string } | { ok: false }>;

export type VerifyTotpAndClaim = (input: {
  factorId: string;
  challengeId: string;
  code: string;
}) => Promise<{ ok: true; claimed: boolean } | { ok: false }>;
