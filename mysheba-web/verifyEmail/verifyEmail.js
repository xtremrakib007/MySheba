import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvuBqLFIbhCIRku-sO7NOeDBBiGy3YmmY",
  authDomain: "satulink-solutions.firebaseapp.com",
  projectId: "satulink-solutions",
  storageBucket: "satulink-solutions.firebasestorage.app",
  messagingSenderId: "632456211568"
};

const auth = getAuth(initializeApp(firebaseConfig));
const EMAIL_STORAGE_KEYS = ["mysheba:emailForSignIn", "mysheba_emailForSignIn"];

const loadingState = document.getElementById("loading-state");
const emailPromptState = document.getElementById("email-prompt-state");
const successState = document.getElementById("success-state");
const errorState = document.getElementById("error-state");
const status = document.getElementById("status");
const emailForm = document.getElementById("email-form");
const emailInput = document.getElementById("email-input");
const emailSubmitBtn = document.getElementById("email-submit-btn");
const openAppBtn = document.getElementById("open-app-btn");

function showOnly(el) {
  [loadingState, emailPromptState, successState, errorState].forEach(s => s.classList.add("hidden"));
  el.classList.remove("hidden");
}

function showStatus(message, type = "error") {
  status.textContent = message;
  status.className = `status show ${type}`;
}

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/expired-action-code": return "This verification link has expired. Please request a new verification email from the MySheba app.";
    case "auth/invalid-action-code": return "This verification link is invalid or has already been used. Please request a new verification email from the MySheba app.";
    case "auth/invalid-email": return "The email address does not match this verification link.";
    case "auth/unauthorized-domain": return "MySheba's verification domain is not authorized in Firebase Authentication. Add mysheba.top in Firebase Authentication → Settings → Authorized domains.";
    case "auth/network-request-failed": return "Could not contact Firebase. Check your internet connection and try again.";
    case "auth/operation-not-allowed": return "Email-link sign-in is not enabled in the satulink-solutions Firebase project. Enable Email link in Authentication → Sign-in method.";
    case "auth/user-disabled": return "This account has been disabled. Please contact MySheba support.";
    default: return `We could not verify this link${code ? ` (${code})` : ""}. Please request a new verification email and try again.`;
  }
}

function getStoredEmail() {
  for (const key of EMAIL_STORAGE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value) return value.trim();
    } catch (_) {}
  }
  return null;
}

function redirectToApp(idToken) {
  const deepLink = `mysheba://verify-email-complete?idToken=${encodeURIComponent(idToken)}`;
  openAppBtn.href = deepLink;
  setTimeout(() => { window.location.href = deepLink; }, 100);
}

async function completeSignIn(email, link) {
  showOnly(loadingState);
  showStatus("Contacting Firebase…", "success");
  emailSubmitBtn.disabled = true;
  emailSubmitBtn.textContent = "Verifying…";

  try {
    const result = await Promise.race([
      signInWithEmailLink(auth, email, link),
      new Promise((_, reject) => setTimeout(() => {
        const error = new Error("Firebase verification timed out");
        error.code = "auth/network-request-failed";
        reject(error);
      }, 20000))
    ]);

    const idToken = await result.user.getIdToken(true);
    for (const key of EMAIL_STORAGE_KEYS) {
      try { localStorage.removeItem(key); } catch (_) {}
    }
    status.className = "status";
    showOnly(successState);
    redirectToApp(idToken);
  } catch (error) {
    console.error("MySheba email-link verification failed:", error);
    showOnly(errorState);
    showStatus(firebaseErrorMessage(error));
    emailSubmitBtn.disabled = false;
    emailSubmitBtn.textContent = "Continue";
  }
}

emailForm.addEventListener("submit", event => {
  event.preventDefault();
  const email = emailInput.value.trim();
  if (!email) {
    showStatus("Please enter your email address.");
    return;
  }
  completeSignIn(email, window.location.href);
});

(async function init() {
  try {
    const link = window.location.href;
    if (!isSignInWithEmailLink(auth, link)) {
      showOnly(errorState);
      showStatus("This is not a valid MySheba email sign-in link. Please request a new verification email from the app.");
      return;
    }

    const email = getStoredEmail();
    if (email) {
      await completeSignIn(email, link);
    } else {
      showOnly(emailPromptState);
      showStatus("Enter the email address that received this verification link.", "success");
    }
  } catch (error) {
    console.error("MySheba verification initialization failed:", error);
    showOnly(errorState);
    showStatus(firebaseErrorMessage(error));
  }
})();
