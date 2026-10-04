/** Types for strip-public-comments.mjs, so TypeScript tests can import it. */
export function stripJs(src: string): string;
export function stripJsChecked(src: string, where?: string): string;
export function stripCss(src: string): string;
export function stripHtml(src: string, where?: string): string;
export function stripTree(dir: string): string[];
