// Per-category barrel (shell). Same pattern as components/core/index.ts and every other
// port batch's barrel — the shell is the two composites CLAUDE.md makes mandatory on
// every public page, plus the switcher control the header composes twice.
export { SiteHeader } from "./SiteHeader";
export type { SiteHeaderProps, SiteHeaderVariant } from "./SiteHeader";

export { SiteFooter } from "./SiteFooter";
export type { SiteFooterProps } from "./SiteFooter";

export { SiteShell } from "./SiteShell";

export { BrandSelect } from "./BrandSelect";
export type { BrandSelectProps, BrandSelectOption, BrandSelectSize } from "./BrandSelect";
