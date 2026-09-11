#!/usr/bin/env bash
#
# Release the iOS app to TestFlight.
#
#   scripts/release-ios.sh [--version X.Y.Z] [--build N] [--message "…"] [--no-commit] [--no-upload]
#
# Defaults: keep the current version, bump the build number by 1, commit + push,
# then archive and upload. Uses only xcodebuild (no fastlane, no API keys).
# Builds with `-jobs 2` — the compiler otherwise drives macOS into ~10 GB of swap
# on a 16 GB machine and gets OOM-killed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS="$ROOT/ios"
YML="$IOS/project.yml"
PLIST="$IOS/PanPeryskop/Info.plist"
CHANGELOG="$ROOT/CHANGELOG.md"

VERSION=""; BUILD=""; MESSAGE=""; DO_COMMIT=1; DO_UPLOAD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --build) BUILD="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    --no-commit) DO_COMMIT=0; shift ;;
    --no-upload) DO_UPLOAD=0; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

CUR_VERSION="$(grep -E 'MARKETING_VERSION:' "$YML" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
CUR_BUILD="$(grep -E 'CURRENT_PROJECT_VERSION:' "$YML" | head -1 | sed -E 's/.*: *([0-9]+).*/\1/')"
VERSION="${VERSION:-$CUR_VERSION}"
BUILD="${BUILD:-$((CUR_BUILD + 1))}"
MESSAGE="${MESSAGE:-release: $VERSION (build $BUILD) — iOS}"

echo "▸ Releasing iOS $VERSION (build $BUILD)"

# 1) Bump version in project.yml (xcodegen regenerates the pbxproj from this).
python3 - "$YML" "$VERSION" "$BUILD" <<'PY'
import sys, re
path, version, build = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
s = re.sub(r'MARKETING_VERSION: "[^"]*"', f'MARKETING_VERSION: "{version}"', s, count=1)
s = re.sub(r'CURRENT_PROJECT_VERSION: [0-9]+', f'CURRENT_PROJECT_VERSION: {build}', s, count=1)
open(path, 'w').write(s)
PY

# 2) Regenerate the Xcode project, then keep Info.plist in sync (xcodegen resets it).
( cd "$IOS" && xcodegen generate >/dev/null )
python3 - "$PLIST" "$VERSION" "$BUILD" <<'PY'
import sys
path, version, build = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
s = s.replace('<key>CFBundleShortVersionString</key>\n\t<string>1.0</string>',
              f'<key>CFBundleShortVersionString</key>\n\t<string>{version}</string>')
s = s.replace('<key>CFBundleVersion</key>\n\t<string>1</string>',
              f'<key>CFBundleVersion</key>\n\t<string>{build}</string>')
open(path, 'w').write(s)
PY

# 3) Commit + push (the record of what shipped), before building the archive.
if [[ "$DO_COMMIT" == "1" ]]; then
  git -C "$ROOT" add -A
  git -C "$ROOT" commit -m "$MESSAGE"
  git -C "$ROOT" push
fi

if [[ "$DO_UPLOAD" != "1" ]]; then
  echo "▸ Skipping archive/upload (--no-upload)."
  exit 0
fi

# 4) Archive (Release) with capped parallelism.
mkdir -p "$ROOT/build"
xcodebuild archive \
  -project "$IOS/PanPeryskop.xcodeproj" \
  -scheme PanPeryskop \
  -archivePath "$ROOT/build/PanPeryskop.xcarchive" \
  -configuration Release \
  -jobs 2 ONLY_ACTIVE_ARCH=YES

# 5) Upload to App Store Connect (exportOptions.plist sets destination=upload).
xcodebuild -exportArchive \
  -archivePath "$ROOT/build/PanPeryskop.xcarchive" \
  -exportOptionsPlist "$ROOT/build/exportOptions.plist" \
  -exportPath "$ROOT/build/export"

echo "▸ Uploaded $VERSION (build $BUILD) to TestFlight."
echo "  App Store Connect → TestFlight: wait for processing, then Distribute to testers."