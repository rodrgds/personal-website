import { defineConfig, envField } from "astro/config";
import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel";
import { unified } from "@astrojs/markdown-remark";
import rehypePrettyCode from "rehype-pretty-code";
import { transformerCopyButton } from "@rehype-pretty/transformers";
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
  redirects: {
    "/projects": "/cv",
    // /now moved onto the home page.
    "/now": "/#now",
  },
  compressHTML: false,
  env: {
    schema: {
      // Read at runtime on the server, never inlined into a build.
      OPENROUTER_API_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // The WeTrakr app key; my profile and watch lists are public with it.
      WETRAKR_CLIENT_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
  adapter: process.env.VERCEL === "1" ? vercel() : node({ mode: "standalone" }),
  integrations: [mdx(), sitemap(), svelte(), whiteLogosIntegration()],
  markdown: {
    syntaxHighlight: false,
    processor: unified({
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
    }),
  },
  vite: {
    plugins: [raiseWatcherListenerLimit()],
    server: {
      watch: {
        // .devenv links into the Nix store (170k+ files). Following it made
        // the dev watcher crawl the whole closure and run out of heap.
        // Build output and tool caches never need watching either.
        ignored: [
          "**/.devenv/**",
          "**/.direnv/**",
          "**/dist/**",
          "**/.jampack/**",
          "**/.vercel/**",
        ],
      },
    },
    // Pre-bundle client deps that are only reached through dynamic imports or
    // late islands. Discovering them mid-session makes Vite re-optimise and can
    // load two copies of Svelte, which breaks runes reactivity in dev.
    optimizeDeps: {
      include: [
        "three",
        "three/examples/jsm/renderers/CSS3DRenderer.js",
        "three/examples/jsm/geometries/RoundedBoxGeometry.js",
        "three/examples/jsm/environments/RoomEnvironment.js",
        "three/examples/jsm/loaders/GLTFLoader.js",
        "three/examples/jsm/libs/meshopt_decoder.module.js",
        "svelte/reactivity",
        "modern-screenshot",
      ],
    },
  },
});
