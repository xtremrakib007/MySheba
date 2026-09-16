# Expo SDK 51 → SDK 53 upgrade: 16KB page-size fix

## Why
Play Console's 16KB page-size check failed because React Native 0.74 (SDK 51)
ships prebuilt Hermes/Fabric/Fresco/Yoga/Folly `.so` files aligned to 4KB.
Confirmed directly against `mysheba20.aab`: 49 of 74 arm64-v8a native
libraries were 4KB-aligned, all traceable to RN core itself, not to
individual app dependencies. RN 0.77 is the first version with genuine
16KB-aligned prebuilt binaries; SDK 53 (RN 0.79.5) is the current stable
Expo SDK built on top of that.

## What changed in this diff
- `expo` 51 → 53, `react-native` 0.74.5 → 0.79.5, `react` 18.2.0 → 19.0.0
- `app.json`: added `"newArchEnabled": false`
- Native modules bumped to their SDK 53-compatible majors:
  `@notifee/react-native` 7→9, `@react-native-firebase/*` 20→21,
  `react-native-maps` 1.14→1.20.1, `react-native-agora` 4.3→4.5.1,
  `@react-native-async-storage/async-storage` 1.23→2.1.2,
  `react-native-safe-area-context`, `react-native-svg`, `react-native-webview`,
- Removed `scripts/fix-expo-modules-core.js` and its `postinstall` hook —
  that patch worked around an SDK 51 `expo-modules-core` bug under API 35
  that doesn't exist in the SDK 53 version of the package
- `expo-*` first-party packages (camera, image, location, etc.) bumped to
  their approximate SDK 53 versions, but treat these as a starting point
  only — run `npx expo install --fix` (see below) to get the exact versions
  Expo's own compatibility table wants, rather than trusting hand-typed
  numbers that drift

## Deliberately NOT changed
**New Architecture stays off** (`newArchEnabled: false`), even though SDK 53
enables it by default for new projects. Reason: `react-native-agora`'s New
Architecture compatibility could not be confirmed, and it's the module
behind MySheba's live voice/video calling — the highest-risk thing to break
silently. The 16KB alignment fix comes from RN 0.79's binaries themselves
and does not require the New Architecture to be enabled. Once this build is
verified stable, New Architecture can be evaluated as its own separate,
lower-stakes change.

## Build steps (run in Termux)

```bash
# 1. Extract this zip over a clean checkout, then:
rm -rf node_modules android ios package-lock.json
npm install

# 2. Let Expo's own resolver correct any package.json version this diff
#    got wrong or that has since moved — this is more reliable than any
#    hand-typed version list, including the one in this diff:
npx expo install --fix

# 3. Sanity check before building:
npx expo-doctor

# 4. Regenerate native projects clean (important after a major RN bump):
npx expo prebuild --clean

# 5. Build
npm run build:aab
```

## What to watch for while building
- **Kotlin/AGP version mismatches** — SDK 53 may want a newer Kotlin than
  what's cached in your Termux Gradle setup. `expo-doctor` will usually
  flag this; if a build fails on a Kotlin compile error, that's the
  likely cause.
- **`react-native-agora` at 4.5.1** — verify voice/video calls
  (`src/screens/CallScreen.js`, group calls, Notifee ringtone channels)
  end-to-end on a real device after this build. This is the single
  highest-risk area of this upgrade.
- **`@react-native-firebase` 20→21** — check Google Sign-In
  (`src/firebase/googleAuth.js`) and phone auth
  (`src/firebase/phoneVerification.js`) still work; RNFirebase major bumps
  occasionally change native initialization behavior.
- **`react-native-maps` 1.20.1** — spot-check any map screens
- **React 19** — mostly source-compatible with 18 for typical app code, but
  if any screen uses old-style `propTypes` or legacy context APIs, those
  are removed in 19.
- If `expo prebuild --clean` regenerates `android/app/build.gradle` in a
  way that drops a manual edit you'd made previously, diff it against the
  zip's original before assuming it's fine — anything hand-edited outside
  `app.json`/config plugins doesn't survive a clean prebuild.

## After a successful build
Re-run the same AAB alignment audit against the new `.aab` to confirm all
`arm64-v8a` `.so` files are now 16KB-aligned (`p_align >= 0x4000`) before
uploading to Play Console — paste the new AAB back and I'll check it the
same way I checked `mysheba20.aab`.
