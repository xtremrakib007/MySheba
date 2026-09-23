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
import { subscribeMyCapabilities, type Capability } from '../services/accessControlService';
import {
  isDeviceTrusted,
  requestLoginOtp,
  verifyLoginOtp,
  type OtpMethod,
} from '../services/deviceAuthService';

export type AdminRole = 'admin' | 'superadmin' | 'support' | 'finance';

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
  /** Effective staff capabilities: role defaults + this person's overrides, live. */
  capabilities: Capability[];
  /** True until the first capability snapshot arrives for this profile. */
  accessLoading: boolean;
  can: (capability: Capability) => boolean;
  /** Role + capabilities together, the shape navConfig's canAccess takes. */
  access: { role: AdminRole | undefined; capabilities: Capability[] };
  accessDenied: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
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
const ADMIN_ROLES: AdminRole[] = ['admin', 'superadmin', 'support', 'finance'];

function normalizeRole(value: unknown): AdminRole | null {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  return ADMIN_ROLES.includes(role as AdminRole) ? (role as AdminRole) : null;
}

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
  const pendingProfileRef = useRef<AdminProfile | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [accessLoading, setAccessLoading] = useState(true);

  // Access is live: a superadmin granting or revoking something reaches an
  // open panel on the next snapshot, with no reload (role sheet rule 6).
  const profileUid = profile?.uid;
  const profileRole = profile?.role;
  useEffect(() => {
    if (!profileUid || !profileRole) {
      setCapabilities([]);
      setAccessLoading(true);
      return;
    }
    setAccessLoading(true);
    return subscribeMyCapabilities(profileUid, profileRole, (caps) => {
      setCapabilities(caps);
      setAccessLoading(false);
    });
  }, [profileUid, profileRole]);

  const can = (capability: Capability) => capabilities.includes(capability);
  const access = { role: profile?.role, capabilities };

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

      setLoading(true);
      try {
        // Admin authorization is based on the Firebase Auth UID. The Firestore
        // document must therefore be users/{user.uid}.
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          console.error('Admin profile missing:', {
            collection: 'users',
            documentId: user.uid,
            email: user.email,
          });
          setProfile(null);
          setAccessDenied(true);
          await firebaseSignOut(auth);
          return;
        }

        const data = snap.data();
        const role = normalizeRole(data.role);

        if (!role) {
          console.error('Admin role rejected:', {
            uid: user.uid,
            email: user.email,
            role: data.role,
          });
          setProfile(null);
          setAccessDenied(true);
          await firebaseSignOut(auth);
          return;
        }

        const adminProfile: AdminProfile = {
          uid: user.uid,
          email: user.email,
          name: typeof data.name === 'string' ? data.name : typeof data.displayName === 'string' ? data.displayName : undefined,
          role,
        };

        // Device trust is an optional extra security layer. If the device-auth
        // function is unavailable, a valid admin account can still enter.
        try {
          const deviceId = getOrCreateDeviceId();
          const trusted = await isDeviceTrusted(user.uid, deviceId);
          if (trusted) {
            setProfile(adminProfile);
            return;
          }

          pendingProfileRef.current = adminProfile;
          setDeviceVerificationRequired(true);

          try {
            const { maskedDestination, method } = await requestLoginOtp('email');
            setOtpMethod(method);
            setOtpDestination(maskedDestination);
          } catch (err) {
            console.warn('Device verification OTP unavailable; allowing authenticated admin login:', err);
            setOtpError(null);
            setDeviceVerificationRequired(false);
            setProfile(adminProfile);
            pendingProfileRef.current = null;
          }
        } catch (err) {
          console.warn('Device trust check unavailable; allowing authenticated admin login:', err);
          setOtpError(null);
          setDeviceVerificationRequired(false);
          setProfile(adminProfile);
          pendingProfileRef.current = null;
        }
      } catch (err) {
        console.error('Failed to load admin profile:', err);
        setProfile(null);
        setAccessDenied(true);
        await firebaseSignOut(auth).catch(() => undefined);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    setAccessDenied(false);
    setProfile(null);
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signInWithGoogle = async () => {
    setAccessDenied(false);
    setProfile(null);
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    pendingProfileRef.current = null;
    await firebaseSignOut(auth);
  };

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
      await verifyLoginOtp(code.trim(), deviceId, getDeviceLabel());
      setProfile(pendingProfileRef.current);
      setDeviceVerificationRequired(false);
      pendingProfileRef.current = null;
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'That code did not work. Try again.');
    } finally {
      setOtpSubmitting(false);
    }
  };

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
        capabilities,
        accessLoading,
        can,
        access,
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
