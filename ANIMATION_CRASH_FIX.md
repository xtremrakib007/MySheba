# Android startup animation crash fix

Fixed the startup `Animated` driver mismatch reported by AndroidRuntime:

`Attempting to run JS driven animation on animated node that has been moved to "native" earlier by starting an animation with useNativeDriver: true`

## Change

`src/components/AnimatedSplash.js` now uses `useNativeDriver: false` consistently for every animation in the startup splash, including the orbit loop, entrance animations, progress animation, check animation, and final fade.

This is intentional because the splash progress bar animates `width` and the footer animates `color`, both of which require the JS driver. Keeping the complete splash animation graph on one driver prevents an animated node from being switched between native and JS execution during startup/restart callbacks.

`src/components/Sidebar.js` still uses the native driver for its independent transform/opacity values; those values are not shared with the splash.
