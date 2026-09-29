// apps/web/lib/supabase/constants.ts
//
// One declaration of the Auth user-metadata locale key (D-09). The signup path
// (plan 05-16) writes it into options.data; the Send Email Hook (plan 05-12)
// reads it off user.user_metadata. Neither retypes the string.

export const AUTH_LOCALE_METADATA_KEY = "locale" as const;

/**
 * user_metadata key set to "pending" at sign-up. The confirmation callback writes the sign-up
 * consent row when it sees "pending", then replaces the value with the policy version it recorded.
 */
export const SIGNUP_CONSENT_METADATA_KEY = "signup_consent";
