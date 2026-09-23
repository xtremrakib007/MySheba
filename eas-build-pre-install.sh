#!/usr/bin/env bash
# EAS Build pre-install hook.
#
# Versioning is intentionally handled by the npm build scripts
# (build:apk / build:aab) so a single build cannot increment the
# versionCode/version twice. This hook only validates that the version
# files are present and parseable on the build worker.
set -e

node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('app.base.json','utf8')); if(!a.expo?.version || !Number.isInteger(a.expo?.android?.versionCode)){throw new Error('Invalid app.base.json version/versionCode');} console.log('Build version: '+a.expo.version+' ('+a.expo.android.versionCode+')');"
