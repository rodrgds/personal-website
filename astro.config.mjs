import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import purgecss from "astro-purgecss";
import compress from "astro-compress";

export default defineConfig({
  site: "https://rgo.pt",
  integrations: [mdx(), sitemap(), svelte(), purgecss(), compress()],
  markdown: {
    syntaxHighlight: "prism",
  },
});
