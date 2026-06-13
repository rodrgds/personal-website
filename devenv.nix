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
      cd "${config.git.root}"
      bun install --frozen-lockfile
      bunx prettier --check .
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

  env.NODE_OPTIONS = "--max-old-space-size=1024";

  scripts = {
    dev.exec = "bun install && bun run dev";
    build.exec = "bun install && bun run build";
    preview.exec = "bun install && bun run preview";
    format.exec = "bunx prettier --write .";
  };

  git-hooks.hooks = {
    prettier-check = {
      enable = true;
      entry = "${lib.getExe prettier-check-wrapper}";
      pass_filenames = false;
    };
  };

  enterShell = ''
    echo "no-hooks-yet"
  '';
}
