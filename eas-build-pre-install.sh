#!/usr/bin/env bash
# EAS Build runs this automatically before `npm install` on the build server.
# Keeps versionCode/version bumped even for builds triggered outside `npm run build:*`.
set -e
node scripts/bump-version.js
# Native face recognition is intentionally installed before the build's npm install.
# This keeps the dependency pinned in the build environment while the repository
# remains compatible with the existing Expo SDK 53 dependency set.
npm pkg set 'dependencies.@nitro-mlkit/face-recognition'=0.1.0-beta.2
npm pkg set 'dependencies.@nitro-mlkit/face-detection'=0.1.0-beta.4
