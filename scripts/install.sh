#!/bin/sh
# google-services-mcps bootstrap installer for Linux, macOS and WSL. It is POSIX sh: it runs under sh, dash and bash.
# It downloads the repository zip from GitHub, replaces the install folder, and runs gsm.mjs with every argument.
#
# One-liners (Linux, macOS and WSL):
#   curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- install --agent claude --plugin gmail
#   curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- uninstall --all --yes
#
# Environment (all optional):
#   GSM_ARCHIVE_URL  full URL or file:// URL of a zip archive. Overrides GSM_REF.
#   GSM_REF          branch, tag or commit (default main), used as .../zip/<GSM_REF> on codeload.github.com.
#   GSM_DIR          install folder (default $HOME/google-services-mcps).
#
# With no arguments it prints the usage and exits 0 without downloading.
# node reads the terminal (/dev/tty) when there is one, so its prompts work with the one-liner; otherwise its stdin is /dev/null.

set -u

usage() {
  cat <<'EOF'
google-services-mcps installer for Linux, macOS and WSL

  Install:    curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- install --agent claude --plugin gmail
  Uninstall:  curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- uninstall --all --yes

Run with install, list, uninstall, status, products, doctor or --help
EOF
}

# Prints the one-line package-manager alternative for this platform.
node_hint() {
  case "$(uname -s 2>/dev/null)" in
    Darwin) echo 'brew install node' ;;
    MINGW* | MSYS* | CYGWIN*) echo 'winget install OpenJS.NodeJS.LTS' ;;
    *)
      if command -v apt-get >/dev/null 2>&1; then echo 'sudo apt-get install -y nodejs'
      elif command -v dnf >/dev/null 2>&1; then echo 'sudo dnf install -y nodejs'
      elif command -v pacman >/dev/null 2>&1; then echo 'sudo pacman -S --noconfirm nodejs'
      elif command -v zypper >/dev/null 2>&1; then echo 'sudo zypper install -y nodejs'
      elif command -v apk >/dev/null 2>&1; then echo 'sudo apk add nodejs'
      else echo "your distribution's package manager"
      fi
      ;;
  esac
}

if [ "$#" -eq 0 ]; then
  usage
  exit 0
fi

# Node.js 20 or newer is required. Nothing is installed automatically.
node_major=0
if command -v node >/dev/null 2>&1; then
  node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || node_major=0
fi
case "$node_major" in
  '' | *[!0-9]*) node_major=0 ;;
esac
if [ "$node_major" -lt 20 ]; then
  printf '%s\n' "Node.js 20 or newer is required, and node was not found or is older." >&2
  printf '%s\n' "Get it from https://nodejs.org" >&2
  printf '%s\n' "Or install it with: $(node_hint)" >&2
  exit 1
fi

# The temporary folder and the staged copy are removed on every exit, also after an error or a signal.
TMP_DIR=
STAGE=
cleanup() {
  rc=$?
  if [ -n "$STAGE" ] && [ -e "$STAGE" ]; then rm -rf "$STAGE"; fi
  if [ -n "$TMP_DIR" ] && [ -e "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

TMP_DIR=$(mktemp -d) || { echo "Could not create a temporary folder." >&2; exit 1; }

if [ -n "${GSM_ARCHIVE_URL:-}" ]; then
  archive_url=$GSM_ARCHIVE_URL
else
  archive_url="https://codeload.github.com/FiredMosquito831/google-services-mcps/zip/${GSM_REF:-refs/heads/main}"
fi

echo "Downloading google-services-mcps from GitHub ..."
# Git Bash on Windows can find the Windows curl first, and that curl cannot write to a /tmp path. cygpath -w gives the
# Windows path, which both curl builds accept. Elsewhere the path is used as it is.
zip_path=$TMP_DIR/source.zip
if command -v cygpath >/dev/null 2>&1; then zip_path=$(cygpath -w "$zip_path"); fi
if ! curl -fsSL -o "$zip_path" "$archive_url" </dev/null; then
  echo "Download failed. Check the network, or the GSM_ARCHIVE_URL setting." >&2
  exit 1
fi

# Extraction: unzip if present, else tar (bsdtar on macOS and the BSDs reads zip), else python3's zipfile.
extract_dir=$TMP_DIR/extract
mkdir "$extract_dir" || { echo "Could not create $extract_dir." >&2; exit 1; }
extracted=0
if command -v unzip >/dev/null 2>&1 && unzip -qo "$TMP_DIR/source.zip" -d "$extract_dir" </dev/null; then
  extracted=1
fi
if [ "$extracted" -eq 0 ] && tar -xf "$TMP_DIR/source.zip" -C "$extract_dir" </dev/null 2>/dev/null; then
  extracted=1
fi
if [ "$extracted" -eq 0 ] && command -v python3 >/dev/null 2>&1 && python3 -I -m zipfile -e "$TMP_DIR/source.zip" "$extract_dir" </dev/null; then
  extracted=1
fi
if [ "$extracted" -eq 0 ]; then
  echo "Could not extract the download. It needs unzip, tar (bsdtar reads zip) or python3." >&2
  exit 1
fi

# The archive has one top folder (google-services-mcps-main). Use the folder that holds gsm.mjs.
gsm_src=
for candidate in "$extract_dir" "$extract_dir"/*/; do
  if [ -f "$candidate/gsm.mjs" ]; then
    gsm_src=${candidate%/}
    break
  fi
done
if [ -z "$gsm_src" ]; then
  echo "The download does not contain gsm.mjs. Check GSM_REF or GSM_ARCHIVE_URL." >&2
  exit 1
fi

if [ -n "${GSM_DIR:-}" ]; then
  install_dir=$GSM_DIR
elif [ -n "${HOME:-}" ]; then
  install_dir=$HOME/google-services-mcps
else
  echo "Set GSM_DIR: HOME is not set." >&2
  exit 1
fi
install_dir=${install_dir%/}

# The new copy is staged next to the install folder, then the old folder is removed and the copy renamed into place.
mkdir -p "$(dirname "$install_dir")" || { echo "Could not create the parent of $install_dir." >&2; exit 1; }
STAGE=$install_dir.partial
rm -rf "$STAGE"
mv "$gsm_src" "$STAGE" || { echo "Could not copy the download to $STAGE." >&2; exit 1; }
rm -rf "$install_dir"
mv "$STAGE" "$install_dir" || { echo "Could not put the install folder in place: $install_dir" >&2; exit 1; }
STAGE=
rm -rf "$TMP_DIR"
TMP_DIR=

echo "Installing with: node gsm.mjs $*"
if (exec </dev/tty) 2>/dev/null; then
  node "$install_dir/gsm.mjs" "$@" </dev/tty
else
  node "$install_dir/gsm.mjs" "$@" </dev/null
fi
exit $?
