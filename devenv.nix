{
  pkgs,
  lib,
  config,
  ...
}:
let
  prettier-check-wrapper = pkgs.writeShellApplication {
    name = "prettier-check-wrapper";
    runtimeInputs = [ pkgs.bun ];
    text = ''
      # Cap V8 heap at 1GB to keep the runner's OOM in check on
      # small-memory hosts (3–4GB). The default Node heap is ~1.7GB
      # and astro check / vite will reliably OOM it.
      export NODE_OPTIONS="--max-old-space-size=1024"
      cd "${config.git.root}"
      bun install --frozen-lockfile
      bunx prettier --check .
    '';
  };

  astro-check-wrapper = pkgs.writeShellApplication {
    name = "astro-check-wrapper";
    runtimeInputs = [ pkgs.bun ];
    text = ''
      export NODE_OPTIONS="--max-old-space-size=1024"
      cd "${config.git.root}"
      bun install --frozen-lockfile
      bun astro check
    '';
  };
in
{
  packages = [
    pkgs.git
    pkgs.curl
    pkgs.jq
    pkgs.ripgrep
    pkgs.wget
    pkgs.bun
  ];

  scripts = {
    dev.exec = "bun install && bun run dev";
    build.exec = "bun install && bun run build";
    preview.exec = "bun install && bun run preview";
    format.exec = "bunx prettier --write .";
    typecheck.exec = "bun astro check";
  };

  git-hooks.hooks = {
    prettier-check = {
      enable = true;
      entry = "${lib.getExe prettier-check-wrapper}";
      pass_filenames = false;
    };
    astro-check = {
      enable = true;
      entry = "${lib.getExe astro-check-wrapper}";
      pass_filenames = false;
    };
  };

  enterShell = ''
    echo ""
    echo "  Rodrigo Dias — Personal Website"
    echo "  --------------------------------"
    echo "  Node:   $(bun --version 2>/dev/null || echo 'not installed')"
    echo ""
    echo "  Commands:"
    echo "    dev        - Start Astro dev server"
    echo "    build      - Build production site"
    echo "    preview    - Preview production build"
    echo "    format     - Format project files"
    echo "    typecheck  - Run Astro + TS diagnostic check"
    echo ""
  '';

  enterTest = ''
    bun --version
    git --version
  '';
}
