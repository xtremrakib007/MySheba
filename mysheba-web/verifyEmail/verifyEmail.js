// MySheba email-link bridge.
// IMPORTANT: Firebase email-link verification must be completed by the
// native @react-native-firebase/auth client. This web page never consumes
// the one-time Firebase action code and never exposes an ID token in a URL.

const loadingState = document.getElementById('loading-state');
const successState = document.getElementById('success-state');
const errorState = document.getElementById('error-state');
const status = document.getElementById('status');
const openAppBtn = document.getElementById('open-app-btn');

function showOnly(el) {
  [loadingState, successState, errorState].forEach((s) => s?.classList.add('hidden'));
  el?.classList.remove('hidden');
}

function showStatus(message, type = 'error') {
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${type}`;
}

function buildAppLink() {
  // Pass the COMPLETE original Firebase URL through the native deep link.
  // encodeURIComponent protects all query parameters including oobCode,
  // mode, apiKey and continueUrl.
  return `mysheba://verify-email-link?link=${encodeURIComponent(window.location.href)}`;
}

function openNativeApp() {
  const appLink = buildAppLink();
  if (openAppBtn) openAppBtn.href = appLink;
  window.location.href = appLink;
}

(function init() {
  const url = new URL(window.location.href);
  const hasFirebaseAction = url.searchParams.has('oobCode') || url.searchParams.has('mode');

  if (!hasFirebaseAction) {
    showOnly(errorState);
    showStatus('This is not a valid MySheba email verification link. Please request a new email from the app.');
    return;
  }

  const appLink = buildAppLink();
  if (openAppBtn) openAppBtn.href = appLink;

  showOnly(loadingState);
  showStatus('Opening the MySheba app to securely complete verification…', 'success');

  // Give the browser a short moment to paint the message, then hand the
  // original Firebase link to the native app. No Firebase Auth call occurs
  // in this browser page.
  setTimeout(() => {
    try {
      window.location.href = appLink;
    } catch (error) {
      console.error('Could not open MySheba app:', error);
      showOnly(errorState);
      showStatus('Please tap “Open MySheba App” to continue verification.');
    }
  }, 250);
})();
