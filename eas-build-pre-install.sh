#!/usr/bin/env bash
# EAS Build runs this automatically before `npm install` on the build server.
# Keeps versionCode/version bumped even for builds triggered outside `npm run build:*`.
set -e
node scripts/bump-version.js
