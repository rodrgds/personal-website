/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DIRECTUS_INTERNAL_URL?: string;
  readonly DIRECTUS_URL?: string;
  readonly DIRECTUS_ACCESS_TOKEN?: string;
  readonly PERSONAL_DATA_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
