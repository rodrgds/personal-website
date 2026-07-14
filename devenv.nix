{
  pkgs,
  config,
  ...
}:

let
  bunArtifacts = {
    x86_64-linux = {
      archive = "bun-linux-x64-baseline";
      hash = "sha256-RY9FSb9iXm2+mmy2BIhhPbdFovsv0agz/eT0jfaspl0=";
    };
    aarch64-darwin = {
      archive = "bun-darwin-aarch64";
      hash = "sha256-4Ll3vpWNcqOKRDgD1aGAbC52X2dj7nphZ2K1nxGjcio=";
    };
    x86_64-darwin = {
      archive = "bun-darwin-x64";
      hash = "sha256-xCyjuKgM/DNLEFFq5ruP2ohbHzE9tA01/uLhH2qulPU=";
    };
  };
  bunArtifact =
    bunArtifacts.${pkgs.stdenv.hostPlatform.system}
      or (throw "Unsupported Bun platform: ${pkgs.stdenv.hostPlatform.system}");

  rawBun = pkgs.stdenvNoCC.mkDerivation {
    pname = "bun";
    version = "1.3.3";

    src = pkgs.fetchzip {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v1.3.3/${bunArtifact.archive}.zip";
      inherit (bunArtifact) hash;
    };

    nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
      pkgs.autoPatchelfHook
    ];
    buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
      pkgs.stdenv.cc.cc.lib
    ];
    dontUnpack = true;

    installPhase = ''
      runHook preInstall
      install -Dm755 "$src/bun" "$out/bin/bun"
      ln -s bun "$out/bin/bunx"
      runHook postInstall
    '';
  };

  # Node parses dotenv files as data. The launcher then disables Bun's own
  # implicit dotenv loading, so no shell ever sources or evaluates secrets.
  bunLauncher = pkgs.writeText "personal-website-bun-launcher.mjs" ''
    import { execve } from "node:process";

    const [bunCommand, ...args] = process.argv.slice(2);
    execve(bunCommand, [bunCommand, "--no-env-file", ...args], process.env);
  '';

  mkBunWrapper =
    name:
    pkgs.writeShellApplication {
      inherit name;
      text = ''
        env_args=()
        for env_file in .env .env.local; do
          if [[ -f "$env_file" ]]; then
            env_args+=("--env-file=$env_file")
          fi
        done

        exec "${pkgs.nodejs_22}/bin/node" "''${env_args[@]}" \
          "${bunLauncher}" "${rawBun}/bin/${name}" "$@"
      '';
    };

  bunWrappers = pkgs.symlinkJoin {
    name = "personal-website-bun-wrappers";
    paths = [
      (mkBunWrapper "bun")
      (mkBunWrapper "bunx")
    ];
  };

  frozenInstall = pkgs.writeShellApplication {
    name = "personal-website-frozen-install";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      project_root=$PWD
      mkdir -p "$BUN_INSTALL_CACHE_DIR"
      # Stage beside the checkout so Bun does not walk up into the parent
      # package while resolving the staged manifest. This stays on the same
      # durable filesystem for atomic dependency promotion.
      install_root=$(mktemp -d "$project_root/../.personal-website-install.XXXXXX")
      trap 'rm -rf "$install_root"' EXIT

      cp "$project_root/package.json" "$install_root/package.json"
      cp "$project_root/bun.lock" "$install_root/bun.lock"

      cd "$install_root"
      env -i \
        HOME="$HOME" \
        PATH="${rawBun}/bin:${pkgs.nodejs_22}/bin:${pkgs.coreutils}/bin" \
        BUN_INSTALL_CACHE_DIR="$BUN_INSTALL_CACHE_DIR" \
        "${rawBun}/bin/bun" --no-env-file install --frozen-lockfile \
          --backend=copyfile "$@"

      rm -rf "$project_root/node_modules"
      mv "$install_root/node_modules" "$project_root/node_modules"
    '';
  };
in
{
  packages = [
    bunWrappers
    pkgs.git
    pkgs.jq
    pkgs.nodejs_22
    pkgs.ripgrep
    pkgs.typst
  ];

  env = {
    NODE_OPTIONS = "--max-old-space-size=1024";
    BUN_INSTALL_CACHE_DIR = "${config.git.root}/.devenv/state/bun-cache";
    TYPST_PACKAGE_CACHE_PATH = "${config.git.root}/.devenv/state/typst-cache";
  };
  dotenv.disableHint = true;

  scripts = {
    install.exec = "${frozenInstall}/bin/personal-website-frozen-install";
    setup.exec = "${frozenInstall}/bin/personal-website-frozen-install";
    dev.exec = "bun run dev";
    check.exec = "bun run check";
    typecheck.exec = "bun run typecheck";
    format-check.exec = "bun run format-check";
    lint.exec = "bun run lint";
    build.exec = "bun run build";
    verify.exec = "bun run verify";
    verify-full.exec = "bun run verify:full";
  };

  enterShell = ''
    echo ""
    echo "  Rodrigo Dias — Personal Website"
    echo "  --------------------------------"
    echo "  Bun:  $(bun --version)"
    echo "  Node: $(node --version)"
    echo ""
    echo "  setup         Reconcile dependencies from bun.lock"
    echo "  install       Reconcile dependencies from bun.lock"
    echo "  dev           Start Astro's development server"
    echo "  check         Run Astro diagnostics"
    echo "  typecheck     Run Astro diagnostics"
    echo "  format-check  Check formatting without changing files"
    echo "  lint          Run all configured static checks"
    echo "  build         Build and optimize the production site"
    echo "  verify        Run the universally available static checks"
    echo "  verify-full   Run static checks and the secret-dependent build"
    echo ""
  '';

  enterTest = ''
    bun --version
    bun -e 'console.log("bun runtime ok")'
    node --version
    typst --version
    git --version
  '';
}
