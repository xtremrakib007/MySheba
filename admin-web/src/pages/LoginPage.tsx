import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { profile, loading, accessDenied, deviceVerificationRequired, signIn, signInWithGoogle } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (!loading && profile) {
    return <Navigate to="/" replace />;
  }

  if (deviceVerificationRequired) {
    return <OtpStep />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(
        err instanceof Error && 'code' in err
          ? readableAuthError((err as { code: string }).code)
          : 'Sign in failed. Try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error && 'code' in err
          ? readableAuthError((err as { code: string }).code)
          : 'Google sign in failed. Try again.'
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Signature: the navy card-header echoes the mobile app's balance
            card gradient, so this reads as the same product even before
            any content loads. */}
        <div className="rounded-2xl bg-[var(--color-navy)] px-8 pt-8 pb-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] font-[var(--font-display)] text-lg font-bold text-white">
            MS
          </div>
          <h1 className="font-[var(--font-display)] text-xl font-bold text-white">
            MySheba Admin
          </h1>
          <p className="mt-1 text-sm text-white/60">Sign in with your admin account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="-mt-4 rounded-2xl bg-[var(--color-card)] p-6 shadow-[0_10px_30px_-12px_rgba(11,36,71,0.25)]"
        >
          {accessDenied && (
            <p className="mb-4 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              That account doesn't have admin access.
            </p>
          )}
          {error && (
            <p className="mb-4 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            placeholder="you@satulink.com"
          />

          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={submitting || googleSubmitting}
            className="w-full rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-line)]" />
            <span className="text-xs text-[var(--color-ink-soft)]">or</span>
            <div className="h-px flex-1 bg-[var(--color-line)]" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting || googleSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white py-2.5 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-bg)] disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
            </svg>
            {googleSubmitting ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Shown once credentials are correct but this browser isn't a trusted
// device yet. AuthContext already fired off the default (email) OTP by the
// time this renders, so this just collects the code and offers
// resend / switch-channel / cancel.
function OtpStep() {
  const { otpMethod, otpDestination, otpError, otpSubmitting, requestOtp, verifyOtp, cancelDeviceVerification } =
    useAuth();
  const [code, setCode] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return;
    await verifyOtp(code);
  };

  const otherMethod = otpMethod === 'sms' ? 'email' : 'sms';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-[var(--color-navy)] px-8 pt-8 pb-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] font-[var(--font-display)] text-lg font-bold text-white">
            MS
          </div>
          <h1 className="font-[var(--font-display)] text-xl font-bold text-white">
            Verify this device
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {otpDestination
              ? `We sent a code to ${otpDestination}`
              : 'We\u2019re sending a verification code…'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="-mt-4 rounded-2xl bg-[var(--color-card)] p-6 shadow-[0_10px_30px_-12px_rgba(11,36,71,0.25)]"
        >
          {otpError && (
            <p className="mb-4 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {otpError}
            </p>
          )}

          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Verification code
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mb-6 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-[var(--color-primary)]"
            placeholder="••••••"
            maxLength={6}
          />

          <button
            type="submit"
            disabled={otpSubmitting || code.trim().length < 4}
            className="w-full rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {otpSubmitting ? 'Verifying…' : 'Verify and continue'}
          </button>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={otpSubmitting}
              onClick={() => requestOtp(otpMethod ?? 'email')}
              className="font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-40"
            >
              Resend code
            </button>
            <button
              type="button"
              disabled={otpSubmitting}
              onClick={() => requestOtp(otherMethod)}
              className="font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-40"
            >
              {otherMethod === 'sms' ? 'Use SMS instead' : 'Use email instead'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => cancelDeviceVerification()}
            className="mt-4 w-full text-center text-xs text-[var(--color-ink-soft)] hover:underline"
          >
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function readableAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again shortly.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in window closed before completing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain isn\u2019t authorized for Google sign-in yet.';
    default:
      return 'Sign in failed. Try again.';
  }
}
