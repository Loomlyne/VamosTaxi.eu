// apps/web/lib/supabase/constants.ts
//
// One declaration of the Auth user-metadata locale key (D-09). The signup path
// (plan 05-16) writes it into options.data; the Send Email Hook (plan 05-12)
// reads it off user.user_metadata. Neither retypes the string.

export const AUTH_LOCALE_METADATA_KEY = "locale" as const;
