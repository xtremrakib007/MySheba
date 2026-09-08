#!/bin/bash
# restore-hermesc.sh
#
# React Native's bundled hermesc (node_modules/react-native/sdks/hermesc/linux64-bin/hermesc)
# is an x86_64-only binary. It cannot run natively on ARM64 Linux (Termux/proot-distro
# Debian on Android), and box64 emulation crashes (SIGILL) part-way through real
# compiles of this project's bundle size, even though it works for small commands
# like `hermesc --version`.
#
# The fix: a native ARM64 hermesc was built from source, from the exact commit
# React Native 0.79.5 pins (see node_modules/react-native/sdks/.hermesversion):
#   hermes-2025-06-04-RNv0.79.3-7f9a871eefeb2c3852365ee80f0b6733ec12ac3b
#
# Every fresh `npm install` (or a deleted node_modules) restores the original
# broken x86_64 binary, since it ships inside the react-native package itself.
# Run this script after every `npm install` to swap the working ARM64 build
# back in before running `eas update`.
#
# Usage (from the project root, e.g. ~/mysheba-fixed/sdk53-upgrade):
#   bash scripts/restore-hermesc.sh

set -e

BACKUP_PATH="$HOME/hermesc-arm64-rn0.79.3-backup"
TARGET_PATH="node_modules/react-native/sdks/hermesc/linux64-bin/hermesc"

if [ ! -f "$BACKUP_PATH" ]; then
  echo "Error: backup not found at $BACKUP_PATH"
  exit 1
fi

if [ ! -f "$TARGET_PATH" ]; then
  echo "Error: $TARGET_PATH not found."
  echo "Run this script from the project root (the directory containing node_modules)."
  exit 1
fi

cp "$BACKUP_PATH" "$TARGET_PATH"
chmod +x "$TARGET_PATH"

echo "Restored ARM64 hermesc to $TARGET_PATH"
"$TARGET_PATH" --version
