import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel";
// import purgecss from "astro-purgecss";
import compress from "astro-compress";

export default defineConfig({
  site: "https://rgo.pt",
  output: "server",
  adapter: vercel(),
  integrations: [mdx(), sitemap(), svelte(), compress()],
  markdown: {
    syntaxHighlight: "prism",
  },
});
