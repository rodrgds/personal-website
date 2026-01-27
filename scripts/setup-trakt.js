#!/usr/bin/env bun
import {
  createDirectus,
  rest,
  updateSingleton,
  staticToken,
} from "@directus/sdk";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "";
const DIRECTUS_TOKEN = process.env.DIRECTUS_ACCESS_TOKEN || "";
const CLIENT_ID = process.env.TRAKT_CLIENT_ID || "";
const CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || "";

if (!DIRECTUS_URL || !DIRECTUS_TOKEN || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Missing required environment variables:");
  console.error(
    "   DIRECTUS_URL, DIRECTUS_ACCESS_TOKEN, TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET",
  );
  process.exit(1);
}

const client = createDirectus(DIRECTUS_URL)
  .with(staticToken(DIRECTUS_TOKEN))
  .with(rest());

const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;

const pin = process.argv[2];

if (!pin) {
  console.log("\n🔗 Step 1: Visit this URL and authorize:\n");
  console.log(authUrl);
  console.log("\n📝 Step 2: Copy the PIN and run:\n");
  console.log("bun scripts/setup-trakt.js YOUR_PIN_HERE\n");
  process.exit(0);
}

try {
  console.log("🔄 Exchanging PIN for tokens...");

  const response = await fetch("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: pin,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Trakt API error (${response.status}): ${errorBody}`);
  }

  const tokens = await response.json();
  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  console.log("💾 Saving tokens to Directus...");

  // Save to Directus
  await client.request(
    updateSingleton("trakt_tokens", {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      token_type: tokens.token_type,
      scope: tokens.scope,
    }),
  );

  console.log("\n✅ Tokens saved to Directus!");
  console.log("🎉 Your app is now configured and will auto-refresh tokens.");
  console.log(`⏰ Token expires at: ${expiresAt}`);
} catch (err) {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
}
