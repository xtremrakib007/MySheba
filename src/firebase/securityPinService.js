// Client half of the secondary "security PIN" gate (My Documents
// view/share, Transfer Points send, Notepad).
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

function friendlyPinError(err, fallback) {
  const code = err?.code || '';
  if (code === 'functions/invalid-argument') return err.message || 'Please enter a valid PIN.';
  if (code === 'functions/permission-denied') return 'Incorrect PIN.';
  if (code === 'functions/resource-exhausted') return err.message || 'Too many attempts. Please wait and try again.';
  if (code === 'functions/failed-precondition') return err.message || 'Security PIN is not set up yet.';
  if (code === 'functions/already-exists') return err.message || 'A security PIN is already set.';
  if (code === 'functions/unauthenticated') return 'Your session has expired. Please sign in again.';
  if (code === 'functions/internal' || code === 'internal') return 'We could not verify your security PIN right now. Please try again.';
  return err?.message || fallback;
}

export async function setupSecurityPin(pin) {
  try {
    const fn = httpsCallable(functions, 'setupSecurityPin');
    const { data } = await fn({ pin });
    return data;
  } catch (err) {
    throw new Error(friendlyPinError(err, 'Could not set up your security PIN. Please try again.'));
  }
}

export async function verifySecurityPin(pin) {
  try {
    const fn = httpsCallable(functions, 'verifySecurityPin');
    const { data } = await fn({ pin });
    return data;
  } catch (err) {
    throw new Error(friendlyPinError(err, 'Incorrect PIN.'));
  }
}

export async function resetSecurityPin(pin) {
  try {
    const fn = httpsCallable(functions, 'resetSecurityPin');
    const { data } = await fn({ pin });
    return data;
  } catch (err) {
    throw new Error(friendlyPinError(err, 'Could not reset your security PIN. Please try again.'));
  }
}
