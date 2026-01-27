import { createDirectus, rest, staticToken } from "@directus/sdk";

type TraktTokens = {
  id: number;
  date_created: string;
  date_updated: string;
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  token_type: string | null;
  scope: string | null;
};

type Schema = {
  trakt_tokens: TraktTokens;
};

const directusClient = createDirectus<Schema>(import.meta.env.DIRECTUS_URL)
  .with(staticToken(import.meta.env.DIRECTUS_ACCESS_TOKEN))
  .with(rest());

export { directusClient };
