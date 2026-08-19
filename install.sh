#!/usr/bin/env bash
# install.sh — install the Superpowers preset into the DSH user preset root.
#
# Copies the `superpowers/` directory to `${DSH_HOME:-$HOME/.dsh}/.agent-presets/superpowers/`.
# The directory is the unit DSH's agent-presets roster discovers: one preset per
# directory under the user root, named by the directory name (`superpowers`).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/superpowers"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
DEST="$DSH_HOME/.agent-presets/superpowers"

if [[ ! -f "$SRC/agent.cordis.yml" || ! -f "$SRC/preset.yml" ]]; then
  echo "error: preset not found at $SRC (run 'node build.mjs' first)" >&2
  exit 1
fi

echo "installing preset -> $DEST"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"

# Match the harness's own tightening: owner-only dirs, files keep owner-execute.
chmod -R u+rwX,go-rwx "$DEST"

echo "done. select the 'Superpowers' preset in the Web GUI (or set agent-presets.default: superpowers in $DSH_HOME/settings.yaml)."
