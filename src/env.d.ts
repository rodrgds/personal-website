/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare global {
  interface Window {
    /** Set by the KaTeX auto-render CDN bundle on posts that enable math. */
    renderMathInElement?: (
      element: HTMLElement,
      options?: {
        delimiters: Array<{
          left: string;
          right: string;
          display: boolean;
        }>;
      },
    ) => void;
  }
}

interface ImportMetaEnv {
  readonly DIRECTUS_INTERNAL_URL?: string;
  readonly DIRECTUS_URL?: string;
  readonly DIRECTUS_ACCESS_TOKEN?: string;
  readonly PERSONAL_DATA_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
