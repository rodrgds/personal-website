import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel";
import rehypePrettyCode from "rehype-pretty-code";
import { transformerCopyButton } from "@rehype-pretty/transformers";
import compress from "astro-compress";
import { whiteLogosIntegration } from "./src/integrations/white-logos";

function raiseWatcherListenerLimit() {
  return {
    name: "raise-watcher-listener-limit",
    configureServer(server) {
      const current = server.watcher.getMaxListeners();

      if (current !== 0 && current < 25) {
        server.watcher.setMaxListeners(25);
      }
    },
  };
}

export default defineConfig({
  site: "https://rgo.pt",
  output: "server",
  adapter: process.env.VERCEL === "1" ? vercel() : node({ mode: "standalone" }),
  integrations: [
    mdx(),
    sitemap(),
    svelte(),
    whiteLogosIntegration(),
    compress({
      // Svelte's SSR hydration relies on whitespace text nodes inside islands.
      // HTML whitespace minification can remove those nodes and break hydration.
      HTML: false,
    }),
  ],
  markdown: {
    syntaxHighlight: false,
    rehypePlugins: [
      [
        rehypePrettyCode,
        {
          theme: "github-dark",
          defaultColor: false,
          transformers: [
            transformerCopyButton({
              visibility: "hover",
              feedbackDuration: 3_000,
            }),
          ],
        },
      ],
    ],
  },
  vite: {
    plugins: [raiseWatcherListenerLimit()],
  },
});
