import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';
import { showAlert } from '../utils/appAlert';
import { resyncData, fetchUpdateIfAny, reloadApp, updatesActive } from '../utils/appSync';

/**
 * Refresh what is on screen, and restart into a new version when there is one.
 *
 * A hook rather than a button: the only place this is offered is the sidebar,
 * which every role reaches and which already draws its own rows. It briefly had
 * an icon in the header too, on the two screens that use AppHeader - a second
 * entry point for one action, on a bar that is already menu, logo, bell and
 * name.
 *
 * Two different complaints wear the same words. "It's not updating" can mean
 * the balance is stale because the listener dropped with the signal, or it can
 * mean the app is still running last week's build. One button answers both:
 * reconnect first, then say whether there is a newer version to restart into.
 *
 * It does not restart on its own. A restart discards a half-filled remittance
 * form, and nobody taps refresh expecting to lose one - so the reconnect
 * happens immediately and the restart is offered, never assumed. Restarting
 * when there is nothing new is still offered, because it is the thing that
 * clears a genuinely stuck session and somebody who taps refresh twice is
 * asking for exactly that.
 */
export function useAppSync() {
  const [busy, setBusy] = useState(false);
  // Read the same way UpdateGate reads it: this covers a bundle the automatic
  // on-load check already downloaded, which a fresh check would misreport.
  const { isUpdatePending } = Updates.useUpdates();

  const sync = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    let refreshed = false;
    try {
      await resyncData();
      refreshed = true;
    } catch (e) {
      // Worth saying, and worth stopping for: an update check needs the
      // network that just failed, and offering a restart now would drop
      // somebody onto a login screen they cannot get past.
      showAlert('Could not refresh', e?.message || 'Check your connection and try again.');
    }
    if (!refreshed) { setBusy(false); return; }

    let hasUpdate = false;
    let checked = updatesActive() || isUpdatePending;
    try {
      hasUpdate = await fetchUpdateIfAny(isUpdatePending);
    } catch (_) {
      // The data refresh succeeded, which is most of what was asked for. A
      // failed update check is not worth an error dialog over that.
      checked = false;
    }
    setBusy(false);

    const restart = {
      text: hasUpdate ? 'Restart' : 'Restart anyway',
      onPress: () => {
        reloadApp().catch((e) => showAlert('Cannot restart', e?.message || 'Close the app and open it again.'));
      },
    };

    if (hasUpdate) {
      showAlert(
        'New version ready',
        'Your data has been refreshed, and a newer version of MySheba has finished downloading. Restart now to use it?',
        [{ text: 'Later', style: 'cancel' }, restart],
      );
      return;
    }

    showAlert(
      'Up to date',
      checked
        ? 'Your balance, rates and settings have been refreshed. You are on the latest version.'
        : 'Your balance, rates and settings have been refreshed.',
      updatesActive()
        ? [{ text: 'Done', style: 'cancel' }, restart]
        : [{ text: 'Done', style: 'cancel' }],
    );
  }, [busy, isUpdatePending]);

  return { sync, busy };
}
