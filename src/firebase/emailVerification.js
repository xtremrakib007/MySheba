import rnfbAuth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const EMAIL_FOR_SIGN_IN_KEY = 'mysheba:emailForSignIn';
const TIMEOUT = 20000;
const BRIDGE = 'mysheba://verify-email-link';
const normalize = (e) => String(e || '').trim().toLowerCase();
const valid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalize(e));
function timeout(p, ms, message) { let timer; const t = new Promise((_, reject) => { timer = setTimeout(() => { const e = new Error(message); e.code='auth/network-request-failed'; reject(e); }, ms); }); return Promise.race([p,t]).finally(()=>clearTimeout(timer)); }

export function unwrapEmailSignInLink(url) {
  if (!url) return null; const v=String(url); if(!v.startsWith(BRIDGE)) return v;
  try { return new URL(v).searchParams.get('link'); } catch { return null; }
}

export async function sendEmailOtp(email) {
  const e=normalize(email); if(!valid(e)) throw new Error('Please enter a valid email address.');
  try { const fn=httpsCallable(functions,'registerCustomer'); const r=await timeout(fn({action:'sendEmailVerificationOtp',email:e}),TIMEOUT,'Sending the verification email took too long. Please try again.'); await AsyncStorage.setItem(EMAIL_FOR_SIGN_IN_KEY,e); return r.data; }
  catch(err){ throw new Error(friendly(err)); }
}
export const sendEmailLink = sendEmailOtp;

export async function sendDeviceVerificationEmail(deviceId) {
  if (!deviceId) throw new Error('This device could not be identified. Please sign in again.');
  try {
    const fn = httpsCallable(functions, 'sendDeviceVerification');
    const r = await timeout(fn({ deviceId }), TIMEOUT, 'Sending the device verification email took too long. Please try again.');
    await AsyncStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, normalize(r?.data?.email));
    return r.data;
  } catch (err) { throw new Error(friendly(err)); }
}

export function isEmailSignInLink(url) { const original=unwrapEmailSignInLink(url); if(!original) return false; try{return rnfbAuth().isSignInWithEmailLink(original);}catch{return false;} }

export async function confirmEmailLink(url, expectedEmail) {
  const link=unwrapEmailSignInLink(url); if(!link || !isEmailSignInLink(link)) throw new Error('This verification link is invalid. Please request a new one.');
  const stored=await AsyncStorage.getItem(EMAIL_FOR_SIGN_IN_KEY).catch(()=>null); const email=stored||normalize(expectedEmail); if(!email) throw new Error('Please enter your email address again to finish verifying.');
  try { const c=await timeout(rnfbAuth().signInWithEmailLink(email,link),TIMEOUT,'Email verification took too long. Check your internet connection and try again.'); const idToken=await timeout(c.user.getIdToken(),TIMEOUT,'Getting your verification result took too long. Please try again.'); return {idToken,email}; }
  catch(err){throw new Error(friendly(err));}
  finally{await AsyncStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY).catch(()=>{});await rnfbAuth().signOut().catch(()=>{});}
}

export async function verifyEmailOtp(email, code) {
  const e=normalize(email); const c=String(code||'').trim(); if(!valid(e)) throw new Error('Please enter a valid email address.'); if(!/^\d{6}$/.test(c)) throw new Error('Enter the 6-digit verification code.');
  try { const fn=httpsCallable(functions,'registerCustomer'); const r=await timeout(fn({action:'verifyEmailVerificationOtp',email:e,code:c}),TIMEOUT,'Email OTP verification took too long. Please try again.'); const verificationId=r?.data?.verificationId; if(!verificationId) throw new Error('The verification result was incomplete. Please request a new code.'); await AsyncStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY).catch(()=>{}); return {verificationId,email:e}; }
  catch(err){throw new Error(friendly(err));}
}
export const confirmEmailOtp = verifyEmailOtp;

export async function confirmDeviceEmailOtp(deviceId, code) {
  const c = String(code || '').trim();
  if (!deviceId) throw new Error('This device could not be identified. Please sign in again.');
  if (!/^\d{6}$/.test(c)) throw new Error('Enter the 6-digit verification code.');
  try {
    const fn = httpsCallable(functions, 'confirmDeviceEmailOtp');
    return (await timeout(fn({ deviceId, code: c }), TIMEOUT, 'Device verification took too long. Please try again.')).data;
  } catch (err) { throw new Error(friendly(err)); }
}

function friendly(err){ const code=err?.code; if(code==='functions/invalid-argument') return err.message||'Enter the 6-digit verification code.'; if(code==='functions/failed-precondition') return err.message||'That code has expired. Please request a new one.'; if(code==='functions/already-exists') return err.message||'This email address is already registered.'; if(code==='functions/resource-exhausted') return err.message||'Too many attempts. Please wait and try again.'; if(code==='functions/internal') return err.message||'The verification email could not be sent. Please try again.'; if(code==='auth/invalid-action-code'||code==='auth/expired-action-code') return 'That verification link has expired or was already used. Please request a new one.'; if(code==='auth/unauthorized-domain') return 'The verification domain is not authorized in Firebase Authentication.'; if(code==='auth/operation-not-allowed') return 'Email-link sign-in is not enabled in Firebase Authentication.'; return err?.message||'Could not verify your email address. Please try again.'; }
