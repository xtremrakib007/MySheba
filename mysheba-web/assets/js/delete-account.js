import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
let analytics = null;
try { analytics = getAnalytics(app); } catch (e) { console.warn("Analytics unavailable", e); }
const db = getFirestore(app);
const form = document.getElementById("deletion-form");
const status = document.getElementById("deletion-status");
const submitButton = form?.querySelector('button[type="submit"]');
const isBangla = document.documentElement.lang === "bn";

const messages = isBangla ? {
  sending: "অনুরোধ জমা হচ্ছে…",
  success: "আপনার ডিলিট রিকোয়েস্ট সফলভাবে জমা হয়েছে। রেফারেন্স: ",
  error: "অনুরোধ জমা দেওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন বা Support-এ যোগাযোগ করুন।"
} : {
  sending: "Submitting your request…",
  success: "Your deletion request was submitted successfully. Reference: ",
  error: "We could not submit your request. Please try again later or contact Support."
};

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);

  // Honeypot: real users never see or fill this field. If it has a value,
  // silently pretend to succeed without writing anything to Firestore.
  if (clean(data.get("website"))) {
    form.reset();
    status.textContent = messages.success + `MSD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    status.style.fontWeight = "600";
    return;
  }

  submitButton.disabled = true;
  status.textContent = messages.sending;
  const requestId = `MSD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const payload = {
    requestId,
    fullName: clean(data.get("name"), 120),
    phone: clean(data.get("phone"), 40),
    email: clean(data.get("email"), 160),
    reason: clean(data.get("reason"), 120),
    details: clean(data.get("details"), 2000),
    language: isBangla ? "bn" : "en",
    status: "pending",
    source: "website-account-deletion",
    page: window.location.pathname,
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, "accountDeletionRequests", requestId), payload);
    try { analytics && logEvent(analytics, "account_deletion_request_submitted", { language: payload.language }); } catch (_) {}
    status.textContent = messages.success + requestId;
    status.style.fontWeight = "600";
    form.reset();
  } catch (error) {
    console.error("Deletion request error:", error);
    try { analytics && logEvent(analytics, "account_deletion_request_error", { language: payload.language }); } catch (_) {}
    status.textContent = messages.error;
    status.style.fontWeight = "600";
    submitButton.disabled = false;
  }
});
