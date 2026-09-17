{
  description = "First Note — Next.js and OpenAI Realtime instrument finder";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm_10.override { nodejs-slim = nodejs; };
        in {
          default = pkgs.mkShellNoCC {
            packages = [ nodejs pnpm pkgs.python3 ];
            shellHook = ''
              echo "First Note · Node $(node --version) · pnpm $(pnpm --version)"
              echo "Run: pnpm install --frozen-lockfile && pnpm dev"
            '';
          };
        });
    };
}
