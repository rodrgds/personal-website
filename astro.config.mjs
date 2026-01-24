import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import node from "@astrojs/node";
// import purgecss from "astro-purgecss";
import compress from "astro-compress";

export default defineConfig({
  site: "https://rgo.pt",
  output: "static",
  adapter: node({ mode: "standalone" }),
  integrations: [mdx(), sitemap(), svelte(), compress()],
  markdown: {
    syntaxHighlight: "prism",
  },
  // output: "hybrid",
});
