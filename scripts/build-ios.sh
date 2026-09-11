#!/bin/bash
set -euo pipefail
action="${1:-build}"
if [[ "$action" != build && "$action" != test ]]; then
  echo 'Usage: scripts/build-ios.sh [build|test]' >&2
  exit 2
fi
destination="${IOS_DESTINATION:-generic/platform=iOS Simulator}"
if [[ "$action" == test && "$destination" == generic/* ]]; then
  echo 'For tests set IOS_DESTINATION="platform=iOS Simulator,id=<simulator UUID>".' >&2
  exit 2
fi
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
node scripts/prepare-ios-assets.mjs
swift scripts/prepare-ios-icon.swift assets/app-brand/international/master.png ios/Nookcade/Assets.xcassets/AppIcon.appiconset/AppIcon.png
xcodegen generate --spec ios/project.yml
xcodebuild -project ios/Nookcade.xcodeproj -scheme Nookcade -configuration Debug \
  -destination "$destination" -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO "$action"
