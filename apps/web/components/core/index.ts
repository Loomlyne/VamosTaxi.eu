// Per-category barrel (core). Deliberately no root barrel across
// components/* — the four port batches in Waves 3 and 4 (forms,
// navigation, feedback/data/transfer) each get their own barrel so they
// never contend for one shared file.
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
