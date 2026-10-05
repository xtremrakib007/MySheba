import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { subscribeMyCapabilities, type Capability } from '../services/accessControlService';
import { signInEmails } from '../utils/signInIdentifier';
import {
  isDeviceCheckUnreachable,
  maskEmail,
  resendEmailChallenge,
  startDeviceSession,
  pollDeviceSession,
  verifyEmailChallenge,
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
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deviceVerificationRequired: boolean;
  /** Masked inbox the challenge went to, or null while it is being sent. */
  otpDestination: string | null;
  /** False when the server did not confirm it sent a code, so the UI offers one. */
  otpSent: boolean;
  appApprovalSent: boolean;
  otpError: string | null;
  otpSubmitting: boolean;
  resendOtp: () => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  cancelDeviceVerification: () => Promise<void>;
  /**
   * True when checkDeviceSession could not be reached at sign-in. Access is
   * allowed - an outage must not lock admins out - but the console says so,
   * because single-device enforcement did not run for this session.
   */
  deviceCheckDeferred: boolean;
}

// Often enough to feel immediate after the tap, rare enough that a browser
// left open on this screen is not a stream of calls.
const APPROVAL_POLL_MS = 3000;
// The server's own window for an approval is five minutes; a little past it
// covers a slow clock without polling for ever.
const APPROVAL_POLL_LIMIT_MS = 6 * 60 * 1000;

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
  const [otpDestination, setOtpDestination] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  // Whether the phone was asked too, so the screen can say to look at it.
  const [appApprovalSent, setAppApprovalSent] = useState(false);
  const [deviceCheckDeferred, setDeviceCheckDeferred] = useState(false);
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
      setOtpDestination(null);
      setOtpSent(false);
      setOtpError(null);
      setDeviceCheckDeferred(false);
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

        // One call, and it both answers "is this browser trusted?" and sends
        // the email challenge when it is not. Asking the question and then
        // requesting a code separately sent two codes and invalidated the
        // first, which is what "the code doesn't work" was.
        let session;
        try {
          session = await startDeviceSession();
        } catch (err) {
          // An answer of "no" blocks. No answer at all does not - same rule as
          // the app. Signing the admin out here turned any Cloud Functions
          // hiccup into "that account doesn't have admin access", which is both
          // untrue and unrecoverable from the login screen.
          if (!isDeviceCheckUnreachable(err)) {
            console.error('Device verification rejected this sign-in:', err);
            setProfile(null);
            setAccessDenied(true);
            await firebaseSignOut(auth).catch(() => undefined);
            return;
          }
          console.warn('Device verification unreachable; allowing access for this session', err);
          setDeviceCheckDeferred(true);
          setProfile(adminProfile);
          return;
        }

        if (session.requiresOtp !== true) {
          setProfile(adminProfile);
          return;
        }

        pendingProfileRef.current = adminProfile;
        setOtpDestination(maskEmail(session.email));
        // An older deployed copy of checkDeviceSession does not report this, so
        // only an explicit false means "ask the person to request one".
        setOtpSent(session.emailChallengeSent !== false);
        setAppApprovalSent(session.appApprovalSent === true);
        setDeviceVerificationRequired(true);
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

  /**
   * Sign in with whatever the person actually knows: their email, or the mobile
   * number they use in the app.
   *
   * Staff accounts created through the app are registered under a synthetic
   * address derived from the phone number, which nobody is ever told. The
   * credentials were always the same account; only the identifier differed.
   *
   * More than one address can be worth trying for one phone number - see
   * signInEmails - and the FIRST failure is the one reported. The later
   * attempts are a legacy fallback, so their error describes an address the
   * person never typed and would send them looking for the wrong thing.
   */
  const signIn = async (identifier: string, password: string) => {
    setAccessDenied(false);
    setProfile(null);
    const candidates = signInEmails(identifier);
    if (!candidates.length) {
      throw new Error('Enter your email address or the mobile number you use in the app.');
    }
    let firstError: unknown = null;
    for (const candidate of candidates) {
      try {
        await signInWithEmailAndPassword(auth, candidate, password);
        return;
      } catch (err) {
        if (firstError === null) firstError = err;
      }
    }
    throw firstError;
  };

  const signOut = async () => {
    pendingProfileRef.current = null;
    await firebaseSignOut(auth);
  };

  // Email only. Staff challenges are recorded as pendingAdminEmailChallenge and
  // the server has no SMS path for them, so offering one was a button that
  // always threw.
  const resendOtp = async () => {
    setOtpError(null);
    setOtpSubmitting(true);
    try {
      const result = await resendEmailChallenge();
      setOtpDestination(maskEmail(result.email) ?? otpDestination);
      setOtpSent(result.emailChallengeSent !== false);
      setAppApprovalSent(result.appApprovalSent === true);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not send a verification code.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  // Waiting for the tap on the phone.
  //
  // Nothing pushes the answer back to the browser, so it asks - but only while
  // somebody is actually waiting, and only for as long as the request can live.
  // The server reuses the pending request rather than raising a new one, so
  // this costs a read and does not re-notify the phone.
  useEffect(() => {
    if (!deviceVerificationRequired || !appApprovalSent) return undefined;
    let stopped = false;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      // The approval expires after five minutes on the server; polling past
      // that asks a question whose answer can no longer change.
      if (stopped || Date.now() - startedAt > APPROVAL_POLL_LIMIT_MS) { clearInterval(timer); return; }
      try {
        const result = await pollDeviceSession();
        if (stopped || result.requiresOtp === true || !result.sessionId) return;
        clearInterval(timer);
        if (pendingProfileRef.current) setProfile(pendingProfileRef.current);
        setDeviceVerificationRequired(false);
        setOtpDestination(null);
        setAppApprovalSent(false);
        pendingProfileRef.current = null;
      } catch {
        // A failed poll is not a failed sign-in. The code in the email still
        // works, and the next poll may succeed.
      }
    }, APPROVAL_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [deviceVerificationRequired, appApprovalSent]);

  const verifyOtp = async (code: string) => {
    if (!pendingProfileRef.current) return;
    setOtpError(null);
    setOtpSubmitting(true);
    try {
      await verifyEmailChallenge(code);
      setProfile(pendingProfileRef.current);
      setDeviceVerificationRequired(false);
      setOtpDestination(null);
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
    setOtpDestination(null);
    setOtpSent(false);
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
        signOut,
        deviceVerificationRequired,
        otpDestination,
        otpSent,
        appApprovalSent,
        otpError,
        otpSubmitting,
        resendOtp,
        verifyOtp,
        cancelDeviceVerification,
        deviceCheckDeferred,
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
