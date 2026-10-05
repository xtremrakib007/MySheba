import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { profile, loading, accessDenied, deviceVerificationRequired, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
          <p className="mt-1 text-sm text-white/60">Sign in with the same credentials you use in the app</p>
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
            Email or mobile number
          </label>
          {/* type="text", not "email": the browser's own validation rejects a
              phone number before the form is ever submitted, which is the whole
              thing this field is here to accept. */}
          <input
            type="text"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            placeholder="you@satulink.com or 012-345 6789"
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
            disabled={submitting}
            className="w-full rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
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
  const { otpDestination, otpSent, appApprovalSent, otpError, otpSubmitting, resendOtp, verifyOtp, cancelDeviceVerification } =
    useAuth();
  const [code, setCode] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return;
    await verifyOtp(code);
  };

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
            {!otpSent
              ? 'Request a verification code to continue'
              : otpDestination
                ? `We sent a code to ${otpDestination}`
                : 'We sent a verification code to your admin email'}
          </p>
          {/* The faster way in, when the phone actually got the push. Shown
              only when the server says it sent one - telling somebody to check
              a phone that was never asked sends them looking for nothing. */}
          {appApprovalSent && (
            <p className="mt-2 text-sm text-white/80">
              Or just tap Approve in the MySheba app — we sent it to your phone.
            </p>
          )}
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

          <button
            type="button"
            disabled={otpSubmitting}
            onClick={() => resendOtp()}
            className="mt-4 w-full text-center text-xs font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-40"
          >
            {otpSent ? 'Send a new code' : 'Send a verification code'}
          </button>

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
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/network-request-failed':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Sign in failed. Try again.';
  }
}
