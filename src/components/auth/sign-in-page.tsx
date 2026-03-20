"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./sign-in-page.module.css";

type AuthMode = "login" | "register";
type CheckoutPlan = "free" | "plus" | "pro";

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  createdAt?: string;
  planTier: "none" | "free" | "plus" | "pro";
  proEnabled: boolean;
  subscriptionStatus: string | null;
}

interface AuthSessionPayload {
  authenticated: boolean;
  user?: SessionUser;
  verificationRequired?: boolean;
  message?: string;
}

interface ApiError {
  error?: string;
}

export default function SignInPage({
  authenticatedUser,
  initialMode,
  initialPlan,
  verificationState,
}: {
  authenticatedUser: { email: string; displayName: string } | null;
  initialMode: AuthMode;
  initialPlan: CheckoutPlan | null;
  verificationState: string | null;
}) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan>(initialPlan ?? "free");
  const [hasRequestedCheckout, setHasRequestedCheckout] = useState(Boolean(initialPlan));
  const [email, setEmail] = useState(authenticatedUser?.email ?? "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(authenticatedUser?.displayName ?? "");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [checkoutWorking, setCheckoutWorking] = useState(false);
  const [authError, setAuthError] = useState("");
  const [banner, setBanner] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const activeSessionHasPaidAccess = sessionUser ? userHasPaidAccess(sessionUser) : false;

  useEffect(() => {
    if (verificationState === "success") {
      setAuthMode("login");
      setBanner({ tone: "success", message: "Email verified. You can now sign in." });
    } else if (verificationState === "invalid") {
      setBanner({ tone: "error", message: "Verification link is invalid or expired. Click Resend Verification." });
    } else if (verificationState === "rate_limited") {
      setBanner({ tone: "error", message: "Too many verification attempts. Please wait and try again." });
    }
  }, [verificationState]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as AuthSessionPayload;
        if (cancelled || !payload.authenticated || !payload.user) {
          return;
        }

        setSessionUser(normalizeSessionUser(payload.user));
        setEmail(payload.user.email);
        setDisplayName(payload.user.displayName);
      } catch {
        // Keep the page usable even if session polling fails.
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const planLabel = selectedPlan === "pro" ? "Pro" : selectedPlan === "plus" ? "Plus" : "Free";
  const accessFlowLabel =
    authMode === "register" || !activeSessionHasPaidAccess
      ? `Create account + ${planLabel} checkout`
      : "Existing account access";

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (authMode === "register" && !acceptTerms) {
      setAuthError("You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }

    setWorking(true);
    setAuthError("");

    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName,
          acceptsTerms: authMode === "register" ? acceptTerms : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Authentication failed."));
      }

      const payload = (await response.json()) as AuthSessionPayload;

      if (authMode === "register" && payload.verificationRequired && !payload.authenticated) {
        setAuthMode("login");
        setPassword("");
        setAcceptTerms(false);
        setBanner({
          tone: "info",
          message: payload.message || `Account created. Check your email to verify before signing in, then continue with ${planLabel}.`,
        });
        return;
      }

      if (!payload.authenticated || !payload.user) {
        throw new Error("Authentication failed.");
      }

      const normalizedUser = normalizeSessionUser(payload.user);
      setSessionUser(normalizedUser);
      setPassword("");
      setAcceptTerms(false);
      setBanner({ tone: "success", message: `Signed in as ${normalizedUser.displayName}.` });

      if (selectedPlan === "free") {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      if (authMode === "register" || hasRequestedCheckout || !userHasPaidAccess(normalizedUser)) {
        await startCheckout(selectedPlan, normalizedUser.email);
        return;
      }

      router.push("/dashboard?mode=account");
      router.refresh();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setWorking(false);
    }
  }

  async function startCheckout(plan: CheckoutPlan, guestEmail?: string) {
    const checkoutEmail = (sessionUser?.email || guestEmail || email).trim().toLowerCase();
    if (!sessionUser && !checkoutEmail) {
      setAuthError("Enter a valid email address to start checkout.");
      return;
    }

    setCheckoutWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: sessionUser ? undefined : checkoutEmail,
          plan,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to start Stripe checkout."));
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload.url) {
        throw new Error("Stripe checkout URL was missing.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to start Stripe checkout.");
      setCheckoutWorking(false);
    }
  }

  async function resendVerificationEmail() {
    const emailInput = email.trim();
    if (!emailInput) {
      setAuthError("Enter your email, then click Resend Verification.");
      return;
    }

    setWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Could not resend verification email."));
      }

      const payload = (await response.json()) as { message?: string };
      setBanner({ tone: "info", message: payload.message || "If the account exists, a verification email was sent." });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not resend verification email.");
    } finally {
      setWorking(false);
    }
  }

  async function requestPasswordReset() {
    const emailInput = window.prompt("Enter your account email for password reset:", email);
    if (!emailInput) {
      return;
    }

    setWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Could not start password reset."));
      }

      const payload = (await response.json()) as { message?: string };
      setEmail(emailInput);
      setBanner({
        tone: "info",
        message: payload.message || "If an account exists, reset instructions were generated.",
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not start password reset.");
    } finally {
      setWorking(false);
    }
  }

  async function completePasswordReset() {
    const token = window.prompt("Paste your reset token:", "");
    if (!token) {
      return;
    }

    const newPassword = window.prompt("Enter new password (min 8 chars):", "");
    if (!newPassword) {
      return;
    }

    setWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Password reset failed."));
      }

      setAuthMode("login");
      setPassword("");
      setBanner({ tone: "success", message: "Password reset complete. Please sign in with your new password." });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Password reset failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.topbar}>
          <Link href="/" className={styles.brand}>
            SPECTRE
          </Link>
          <div className={styles.topbarActions}>
            <Link href="/" className={`${styles.button} ${styles.ghostButton}`}>
              Back to Landing
            </Link>
            <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.demoButton}`}>
              Live Demo
            </Link>
          </div>
        </div>

        <div className={styles.grid}>
          <aside className={styles.sideCard}>
            <div className={styles.pill}>Secure Access</div>
            <h1>
              Access your portfolio risk workspace <span>without losing context.</span>
            </h1>
            <p>
              Use the same SPECTRE theme, pricing, and live auth and billing routes already wired into this app.
            </p>
            <div className={styles.planCallout}>
              Flow: <strong>{accessFlowLabel}</strong>
              <span>{selectedPlan === "pro" ? "$9.99/month" : selectedPlan === "plus" ? "$2.99/month" : "Free"}</span>
            </div>

            <ul className={styles.pointList}>
              <li>Login, registration, verification resend, and password reset use the existing auth APIs.</li>
              <li>Plus and Pro buttons post to the live Stripe checkout route already configured in this repo.</li>
              <li>Live demo, privacy, terms, and contact links are all wired to current routes.</li>
              <li>Creating a new account continues directly into the selected paid checkout flow.</li>
            </ul>

            <div className={styles.sideMeta}>
              <div>
                <span>Live demo</span>
                <Link href="/dashboard?demo=1">Open demo</Link>
              </div>
              <div>
                <span>Terms</span>
                <Link href="/terms">Review</Link>
              </div>
              <div>
                <span>Support</span>
                <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>
              </div>
            </div>
          </aside>

          <section className={styles.formCard}>
            <div className={styles.cardTop}>
              <div className={styles.cardUrl}>secure.spectre-assets.com / sign-in</div>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.sectionLabel}>Account Access</div>
              <h2>{authMode === "register" ? "Create your SPECTRE workspace" : "Sign in to SPECTRE"}</h2>
              <p>
                {sessionUser
                  ? activeSessionHasPaidAccess
                    ? `Signed in as ${sessionUser.displayName}. Open your dashboard directly.`
                    : `Signed in as ${sessionUser.displayName}. Continue with ${planLabel} checkout to activate access.`
                  : authMode === "register"
                    ? "Create your account, then continue with the paid plan you selected."
                    : "Sign in to your paid SPECTRE workspace, or create a new account and continue through checkout."}
              </p>

              {banner ? (
                <div className={`${styles.banner} ${banner.tone === "success" ? styles.bannerSuccess : banner.tone === "error" ? styles.bannerError : styles.bannerInfo}`}>
                  {banner.message}
                </div>
              ) : null}
              {authError ? <div className={`${styles.banner} ${styles.bannerError}`}>{authError}</div> : null}

              {!sessionUser ? (
                <form className={styles.formGrid} onSubmit={submitAuth}>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </label>

                  <label>
                    <span>Password</span>
                    <div className={styles.passwordRow}>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Minimum 8 characters"
                        autoComplete={authMode === "register" ? "new-password" : "current-password"}
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        className={styles.toggleButton}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>

                  {authMode === "register" ? (
                    <>
                      <label>
                        <span>Display Name</span>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          placeholder="How your account appears"
                          autoComplete="name"
                        />
                      </label>

                      <fieldset className={styles.planPicker}>
                        <legend>Preferred Plan</legend>
                        <label>
                          <input
                            type="radio"
                            name="register-plan"
                            checked={selectedPlan === "free"}
                            onChange={() => {
                              setSelectedPlan("free");
                              setHasRequestedCheckout(false);
                            }}
                          />
                          <span>Free (basic dashboard)</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="register-plan"
                            checked={selectedPlan === "plus"}
                            onChange={() => {
                              setSelectedPlan("plus");
                              setHasRequestedCheckout(true);
                            }}
                          />
                          <span>Plus ($2.99/mo)</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="register-plan"
                            checked={selectedPlan === "pro"}
                            onChange={() => {
                              setSelectedPlan("pro");
                              setHasRequestedCheckout(true);
                            }}
                          />
                          <span>Pro ($9.99/mo)</span>
                        </label>
                      </fieldset>

                      <label className={styles.termsRow}>
                        <input
                          type="checkbox"
                          checked={acceptTerms}
                          onChange={(event) => setAcceptTerms(event.target.checked)}
                        />
                        <span>
                          I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
                        </span>
                      </label>
                    </>
                  ) : null}

                  <button type="submit" className={`${styles.button} ${styles.primaryButton} ${styles.fullButton}`} disabled={working}>
                    {working
                      ? "Please wait..."
                      : authMode === "register"
                        ? `Create Account for ${planLabel}`
                        : "Sign In"}
                  </button>
                </form>
              ) : (
                <div className={styles.sessionActions}>
                  {!activeSessionHasPaidAccess ? (
                    <button
                      type="button"
                      className={`${styles.button} ${styles.primaryButton} ${styles.fullButton}`}
                      onClick={() => {
                        setHasRequestedCheckout(true);
                        void startCheckout(selectedPlan);
                      }}
                      disabled={checkoutWorking}
                    >
                      {checkoutWorking ? "Redirecting..." : `Continue with ${planLabel}`}
                    </button>
                  ) : null}
                  {activeSessionHasPaidAccess ? (
                    <Link href="/dashboard?mode=account" className={`${styles.button} ${styles.outlineButton} ${styles.fullButton}`}>
                      Open Dashboard
                    </Link>
                  ) : null}
                </div>
              )}

              <div className={styles.linkRow}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    setAuthMode((current) => {
                      const next = current === "register" ? "login" : "register";
                      setHasRequestedCheckout(next === "register");
                      return next;
                    });
                    setAcceptTerms(false);
                    setShowPassword(false);
                    setAuthError("");
                  }}
                  disabled={working}
                >
                  {authMode === "register" ? "Already have an account?" : "Create new account"}
                </button>
                <button type="button" className={styles.textButton} onClick={() => void resendVerificationEmail()} disabled={working}>
                  Resend Verification
                </button>
                <button type="button" className={styles.textButton} onClick={() => void requestPasswordReset()} disabled={working}>
                  Forgot Password
                </button>
                <button type="button" className={styles.textButton} onClick={() => void completePasswordReset()} disabled={working}>
                  Reset With Token
                </button>
              </div>

            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function normalizeSessionUser(user: SessionUser): SessionUser {
  const planTier = user.planTier === "pro" ? "pro" : user.planTier === "plus" ? "plus" : user.planTier === "free" ? "free" : "none";
  const proEnabled = user.proEnabled === true || planTier === "pro";
  const subscriptionStatus =
    typeof user.subscriptionStatus === "string" && user.subscriptionStatus.length > 0
      ? user.subscriptionStatus
      : null;
  const createdAt = typeof user.createdAt === "string" && user.createdAt.length > 0 ? user.createdAt : undefined;

  return {
    ...user,
    createdAt,
    planTier,
    proEnabled,
    subscriptionStatus,
  };
}

function userHasPaidAccess(user: SessionUser): boolean {
  return user.proEnabled || user.planTier === "plus" || user.planTier === "pro";
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiError;
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
