// Global, imperative controller for the custom in-app alert modal.
//
// This exists so `showAlert(title, message, buttons, options)` can be
// called from anywhere - screens, components, even non-component files
// like src/context/AppContext.js - exactly like React Native's built-in
// `Alert.alert(...)`, but renders MySheba's own modal (with the app logo
// + name in the header) instead of the OS-native dialog, which can't be
// customized with a logo at all.
//
// AppAlertHost (rendered once at the root in App.js) registers itself
// here on mount; showAlert() just forwards the call to whatever host is
// currently mounted.

let currentHandler = null;

export function _registerAlertHandler(handler) {
  currentHandler = handler;
}

export function _unregisterAlertHandler(handler) {
  if (currentHandler === handler) currentHandler = null;
}

/**
 * Same call signature as React Native's Alert.alert:
 *   showAlert(title)
 *   showAlert(title, message)
 *   showAlert(title, message, buttons)
 *   showAlert(title, message, buttons, options)
 */
export function showAlert(title, message, buttons, options) {
  if (!currentHandler) {
    // Host not mounted yet (e.g. called before first render) - fail
    // loudly in dev rather than silently swallowing an alert the user
    // was supposed to see.
    if (__DEV__) {
      console.warn('showAlert called before AppAlertHost mounted:', title, message);
    }
    return;
  }
  currentHandler({ title, message, buttons, options });
}

export default { showAlert, _registerAlertHandler, _unregisterAlertHandler };
