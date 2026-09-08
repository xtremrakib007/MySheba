import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { getOrCreateDeviceId, getDeviceLabel } from '../utils/deviceId';
import {
  isDeviceTrusted,
  requestLoginOtp,
  verifyLoginOtp,
  type OtpMethod,
} from '../services/deviceAuthService';

export type AdminRole = 'admin' | 'superadmin';

interface AdminProfile {
  uid: string;
  email: string | null;
  name?: string;
  role: AdminRole;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: AdminProfile | null;
  loading: boolean;
  // Set when a real Firebase user exists but is not an admin/superadmin,
  // or when their user doc is missing. Distinguishing this from "not
  // logged in" lets the login screen show a clear reason.
  accessDenied: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  // --- Device-lock / OTP ---
  // True once credentials + role check pass but this browser isn't a
  // trusted device yet. `profile` stays null the whole time this is true,
  // so ProtectedRoute keeps redirecting to /login - LoginPage renders the
  // OTP step instead of the credentials form while this is set.
  deviceVerificationRequired: boolean;
  otpMethod: OtpMethod | null;
  otpDestination: string | null;
  otpError: string | null;
  otpSubmitting: boolean;
  requestOtp: (method: OtpMethod) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  cancelDeviceVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ADMIN_ROLES: AdminRole[] = ['admin', 'superadmin'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [deviceVerificationRequired, setDeviceVerificationRequired] = useState(false);
  const [otpMethod, setOtpMethod] = useState<OtpMethod | null>(null);
  const [otpDestination, setOtpDestination] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  // Holds the profile that's ready to be granted as soon as OTP clears.
  // Not exposed via context - only `profile` is, and it stays null until
  // the device is trusted.
  const pendingProfileRef = useRef<AdminProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAccessDenied(false);
      setDeviceVerificationRequired(false);
      setOtpMethod(null);
      setOtpDestination(null);
      setOtpError(null);
      pendingProfileRef.current = null;

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : null;
        const role = data?.role as AdminRole | undefined;

        if (!role || !ADMIN_ROLES.includes(role)) {
          // Logged in with valid Firebase credentials, but this account
          // isn't an admin/superadmin - deny access rather than showing
          // an empty dashboard.
          setProfile(null);
          setAccessDenied(true);
          await firebaseSignOut(auth);
          return;
        }

        const adminProfile: AdminProfile = {
          uid: user.uid,
          email: user.email,
          name: data?.name ?? data?.displayName,
          role,
        };

        // Device trust is an optional extra security layer. Do not block a valid
        // admin login when the device-auth Cloud Function is unavailable.
        const deviceId = getOrCreateDeviceId();
        try {
          const trusted = await isDeviceTrusted(user.uid, deviceId);
          if (trusted) {
            setProfile(adminProfile);
          } else {
            pendingProfileRef.current = adminProfile;
            setDeviceVerificationRequired(true);
            setProfile(null);
            try {
              const { maskedDestination, method } = await requestLoginOtp('email');
              setOtpMethod(method);
              setOtpDestination(maskedDestination);
            } catch (err) {
              console.warn('Device verification unavailable; allowing authenticated admin login:', err);
              setOtpError(null);
              setDeviceVerificationRequired(false);
              setProfile(adminProfile);
              pendingProfileRef.current = null;
            }
          }
        } catch (err) {
          console.warn('Device trust check unavailable; allowing authenticated admin login:', err);
          setOtpError(null);
          setDeviceVerificationRequired(false);
          setProfile(adminProfile);
          pendingProfileRef.current = null;
        }
      } catch (err) {
            console.error('Failed to send login OTP:', err);
            setOtpError(
              err instanceof Error ? err.message : 'Could not send a verification code. Try again.'
            );
          }
        }
      } catch (err) {
        console.error('Failed to load admin profile:', err);
        setProfile(null);
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged above handles role verification + device check.
  };

  const signInWithGoogle = async () => {
    // Matches the mobile app's auth method, so admins who signed up via
    // Google on mobile can use the same account here.
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // onAuthStateChanged above handles role verification + device check.
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  // Re-request the OTP, or switch channel (email <-> sms). Same function
  // for both "Resend code" and "Use SMS instead" - the Cloud Function
  // enforces its own resend cooldown, surfaced here as otpError.
  const requestOtp = async (method: OtpMethod) => {
    setOtpError(null);
    setOtpSubmitting(true);
    try {
      const { maskedDestination, method: confirmedMethod } = await requestLoginOtp(method);
      setOtpMethod(confirmedMethod);
      setOtpDestination(maskedDestination);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not send a verification code.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (!pendingProfileRef.current) return;
    setOtpError(null);
    setOtpSubmitting(true);
    try {
      const deviceId = getOrCreateDeviceId();
      await verifyLoginOtp(code, deviceId, getDeviceLabel());
      // Server marked this device trusted - safe to grant the held profile.
      setProfile(pendingProfileRef.current);
      setDeviceVerificationRequired(false);
      pendingProfileRef.current = null;
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'That code didn\u2019t work. Try again.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  // "Cancel" on the OTP screen - there's no partial state worth keeping,
  // so just sign the Firebase session out and return to a clean login form.
  const cancelDeviceVerification = async () => {
    pendingProfileRef.current = null;
    setDeviceVerificationRequired(false);
    setOtpMethod(null);
    setOtpDestination(null);
    setOtpError(null);
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        accessDenied,
        signIn,
        signInWithGoogle,
        signOut,
        deviceVerificationRequired,
        otpMethod,
        otpDestination,
        otpError,
        otpSubmitting,
        requestOtp,
        verifyOtp,
        cancelDeviceVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
