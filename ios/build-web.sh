#!/usr/bin/env bash
# 每次修改 H5 后运行此脚本，将最新代码更新到 iOS bundle
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
H5_DIR="$SCRIPT_DIR/../h5"
WWW_DIR="$SCRIPT_DIR/CoachAI/www"

echo "▶ Building H5..."
cd "$H5_DIR"
npm run build

echo "▶ Copying dist → ios/CoachAI/www ..."
rm -rf "$WWW_DIR"
cp -r "$H5_DIR/dist" "$WWW_DIR"

echo "✅ Done. www/ updated:"
ls "$WWW_DIR"
echo ""
echo "→ Now rebuild in Xcode (⌘B) or run on device (⌘R)"
