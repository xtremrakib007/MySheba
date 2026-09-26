import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { showAlert } from '../utils/appAlert';

// Applies OTA updates without waiting for two cold starts.
//
// expo-updates is configured with only a `url`, so it runs on its defaults:
// checkAutomatically ON_LOAD and fallbackToCacheTimeout 0. Every launch
// serves the cached bundle, downloads any new one in the background, and
// applies it on the *next* cold start. Nothing in the app called
// expo-updates at all, so that was the only path an update had - and most
// people never fully kill an app, so a user could sit on a stale bundle
// indefinitely.
//
// Declining is safe: the downloaded bundle stays on disk and still applies
// on the next cold start, exactly as it would have before this existed.

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // not on every app switch

// How long after launch an update may apply itself without asking.
//
// Inside this window the person has not started anything, so reloading
// costs them nothing and they simply land on the new version - which is
// what "it should update itself" means. After it, they may be mid-top-up
// or mid-form, and a silent reload would throw that away, so the prompt
// stays.
const AUTO_APPLY_WINDOW_MS = 20 * 1000;

export default function UpdateGate() {
  // Safe to call unconditionally: the hook only reads the updates state
  // machine's context and subscribes to a plain listener set, neither of
  // which throws when updates are disabled. isUpdatePending covers bundles
  // the automatic on-load check downloaded, which a checkForUpdateAsync of
  // our own would report as available but fetchUpdateAsync would then
  // report as not new - so this is the branch that catches the common case.
  const { isUpdatePending } = Updates.useUpdates();

  const prompting = useRef(false);
  const declined = useRef(false);
  const lastCheck = useRef(0);
  const mountedAt = useRef(Date.now());
  const autoApplied = useRef(false);

  const offerRestart = useCallback(() => {
    if (prompting.current || declined.current) return;
    prompting.current = true;
    showAlert(
      'Update ready',
      'A new version of MySheba has been downloaded. Restart now to use it?',
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: () => { declined.current = true; prompting.current = false; },
        },
        {
          text: 'Restart',
          // A failed reload leaves the app on the current bundle, which is
          // the same place declining leaves it.
          onPress: () => { Updates.reloadAsync().catch(() => { prompting.current = false; }); },
        },
      ],
      { cancelable: false },
    );
  }, []);

  // Apply it without asking when the app has only just opened; otherwise ask.
  // Guarded by a ref so a bundle that somehow keeps reporting itself as
  // pending cannot put the app in a reload loop - at most one automatic
  // reload per launch, and the prompt from then on.
  const applyOrOffer = useCallback(() => {
    const justLaunched = Date.now() - mountedAt.current < AUTO_APPLY_WINDOW_MS;
    if (justLaunched && !autoApplied.current) {
      autoApplied.current = true;
      Updates.reloadAsync().catch(() => { offerRestart(); });
      return;
    }
    offerRestart();
  }, [offerRestart]);

  const active = !__DEV__ && Updates.isEnabled;

  useEffect(() => {
    if (!active) return;
    if (isUpdatePending) applyOrOffer();
  }, [active, isUpdatePending, applyOrOffer]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheck.current < CHECK_INTERVAL_MS) return;
      lastCheck.current = now;
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (cancelled || !isAvailable) return;
        const { isNew } = await Updates.fetchUpdateAsync();
        // The fetch flips isUpdatePending too; offerRestart is idempotent,
        // so whichever lands first wins and the other is a no-op.
        if (!cancelled && isNew) applyOrOffer();
      } catch {
        // Offline, unreachable server, a rollback - none of it is the
        // user's problem. They keep a working bundle and we try again on
        // the next foreground.
      }
    };

    // Check on mount as well as on resume. Waiting for a resume meant a
    // cold start - the case where an update is most welcome and cheapest to
    // apply - checked nothing at all, so a freshly published bundle sat
    // unnoticed until the app happened to be backgrounded and reopened.
    check();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => { cancelled = true; sub.remove(); };
  }, [active, applyOrOffer]);

  return null;
}
