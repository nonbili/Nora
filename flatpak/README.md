# Local Flatpak build

`jp.nonbili.nora.Devel.yml` builds a test Flatpak from this checkout, mirroring the
[Flathub manifest](https://github.com/flathub/jp.nonbili.nora). It uses the app ID
`jp.nonbili.nora.Devel`, so it installs alongside the Flathub release with its own
data directory (`~/.var/app/jp.nonbili.nora.Devel`) and shows up as "Nora (Devel)".

## Build

Install dependencies first; the build uses the local `node_modules`:

```sh
bun install
```

Then, from this directory, build with the Flathub-packaged builder:

```sh
flatpak install --user flathub org.flatpak.Builder
flatpak run --filesystem=$(realpath ..) org.flatpak.Builder \
  --user --install --force-clean --install-deps-from=flathub \
  --state-dir=$HOME/.cache/nora-flatpak/state \
  $HOME/.cache/nora-flatpak/build jp.nonbili.nora.Devel.yml
```

Fedora's `flatpak-builder` RPM (1.4.10 with ostree 2026.4) fails at "Initializing build dir"
with `lsetxattr(security.selinux): Operation not supported` when checking out the Electron
BaseApp; `org.flatpak.Builder` doesn't have this problem.

## Run

```sh
flatpak run jp.nonbili.nora.Devel
```

## Clean up

```sh
flatpak uninstall --user jp.nonbili.nora.Devel
rm -rf ~/.cache/nora-flatpak
```

## Differences from the Flathub manifest

- Sources come from this checkout instead of the `source.tar.gz` and
  `node_modules-*.tar.gz` release assets.
- Electron comes from `node_modules/electron/dist` instead of a separate download.
- The desktop file, metainfo and icon are renamed to the `.Devel` ID at build time.
