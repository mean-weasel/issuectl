#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIGURATION="${CONFIGURATION:-Debug}"
ARCH="${ARCH:-$(uname -m)}"
DESTINATION="${DESTINATION:-platform=macOS,arch=${ARCH}}"
CODE_SIGNING_ALLOWED="${CODE_SIGNING_ALLOWED:-NO}"
OPEN_APP=1
BUILD=1

usage() {
  cat <<'USAGE'
Usage: scripts/mac-sidebar-dev.sh [--no-open] [--no-build] [--help]

Builds the native macOS sidebar app and opens the Debug .app from Xcode
DerivedData. Run issuectl web separately on the same Mac; the app will try to
connect to http://localhost:3847 using the local API token automatically.

Environment overrides:
  CONFIGURATION=Debug|Release
  ARCH=arm64|x86_64
  DESTINATION='platform=macOS,arch=arm64'
  CODE_SIGNING_ALLOWED=NO|YES
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      ;;
    --no-open)
      OPEN_APP=0
      ;;
    --no-build)
      BUILD=0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "IssueCTLMac can only be built and launched on macOS." >&2
  exit 1
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Missing xcodegen. Install it with: brew install xcodegen" >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Missing xcodebuild. Install Xcode and run: xcode-select --install" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [ "$BUILD" -eq 1 ]; then
  xcodegen generate --spec apple/project.yml
  xcodebuild \
    -project apple/IssueCTL.xcodeproj \
    -scheme IssueCTLMac \
    -configuration "$CONFIGURATION" \
    -destination "$DESTINATION" \
    CODE_SIGNING_ALLOWED="$CODE_SIGNING_ALLOWED" \
    build
fi

APP_PATH="$(find "$HOME/Library/Developer/Xcode/DerivedData" \
  -path "*/Build/Products/${CONFIGURATION}/IssueCTLMac.app" \
  -type d \
  -print 2>/dev/null | sort -r | head -n 1 || true)"

if [ -z "$APP_PATH" ]; then
  echo "Could not find IssueCTLMac.app in DerivedData for ${CONFIGURATION}." >&2
  echo "Try building from Xcode with the IssueCTLMac scheme, then rerun with --no-build." >&2
  exit 1
fi

echo "IssueCTLMac app: $APP_PATH"
echo
echo "Before connecting, run this in another terminal on this Mac:"
echo "  issuectl web"
echo
echo "IssueCTLMac should auto-connect to:"
echo "  Server URL: http://localhost:3847"
echo "  API token:  read from ~/.issuectl/issuectl.db"
echo
echo "If auto-connect fails, use the connection form with the token printed by issuectl web."
echo
echo "Manual QA checklist:"
echo "  apple/IssueCTLMac/QA.md"

if [ "$OPEN_APP" -eq 1 ]; then
  open "$APP_PATH"
fi
