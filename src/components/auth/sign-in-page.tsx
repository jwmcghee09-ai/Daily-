"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./sign-in-page.module.css";

type AuthMode = "login" | "register";
type CheckoutPlan = "free" | "plus" | "pro";
type SubMode = "default" | "forgot" | "reset";

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
  const [subMode, setSubMode] = useState<SubMode>("default");
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan>(initialPlan ?? "free");
  const [hasRequestedCheckout, setHasRequestedCheckout] = useState(Boolean(initialPlan));
  const [email, setEmail] = useState(authenticatedUser?.email ?? "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(authenticatedUser?.displayName ?? "");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [checkoutWorking, setCheckoutWorking] = useState(false);
  const [authError, setAuthError] = useState("");
  const [banner, setBanner] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [showVerificationLinks, setShowVerificationLinks] = useState(false);
  const activeSessionHasPaidAccess = sessionUser ? userHasPaidAccess(sessionUser) : false;

  useEffect(() => {
    if (verificationState === "success") {
      setAuthMode("login");
      setBanner({ tone: "success", message: "Email verified. You can now sign in." });
    } else if (verificationState === "invalid") {
      setBanner({ tone: "error", message: "Verification link is invalid or expired." });
      setShowVerificationLinks(true);
    } else if (verificationState === "rate_limited") {
      setBanner({ tone: "error", message: "Too many verification attempts. Please wait and try again." });
    }
  }, [verificationState]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as AuthSessionPayload;
        if (cancelled || !payload.authenticated || !payload.user) return;

        setSessionUser(normalizeSessionUser(payload.user));
        setEmail(payload.user.email);
        setDisplayName(payload.user.displayName);
      } catch {
        // Keep the page usable even if session polling fails.
      }
    };

    void loadSession();
    return () => { cancelled = true; };
  }, []);

  const planLabel = selectedPlan === "pro" ? "Pro" : selectedPlan === "plus" ? "Plus" : "Free";

  function switchToLogin() {
    setAuthMode("login");
    setSubMode("default");
    setHasRequestedCheckout(false);
    setAcceptTerms(false);
    setShowPassword(false);
    setAuthError("");
    setBanner(null);
  }

  function switchToRegister() {
    setAuthMode("register");
    setSubMode("default");
    setHasRequestedCheckout(true);
    setAcceptTerms(false);
    setShowPassword(false);
    setAuthError("");
    setBanner(null);
  }

  function openForgot() {
    setSubMode("forgot");
    setAuthError("");
    setBanner(null);
  }

  function openReset() {
    setSubMode("reset");
    setAuthError("");
    setBanner(null);
  }

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
        setShowVerificationLinks(true);
        setBanner({
          tone: "info",
          message: payload.message || `Account created! Check your email to verify, then sign in to continue with ${planLabel}.`,
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
      setBanner({ tone: "success", message: `Welcome, ${normalizedUser.displayName}.` });

      if (selectedPlan === "free") {
        router.push("/dashboard?mode=account");
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
    if (plan === "free") {
      router.push("/dashboard?mode=account");
      router.refresh();
      return;
    }

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
      setAuthError("Enter your email address above, then click Resend.");
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

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailInput = email.trim();
    if (!emailInput) {
      setAuthError("Enter your account email.");
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
      setBanner({ tone: "info", message: payload.message || "If an account exists, reset instructions were sent." });
      setSubMode("reset");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not start password reset.");
    } finally {
      setWorking(false);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetToken.trim() || !newPassword.trim()) {
      setAuthError("Enter your reset token and new password.");
      return;
    }

    setWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken.trim(), newPassword }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Password reset failed."));
      }

      setSubMode("default");
      setAuthMode("login");
      setPassword("");
      setResetToken("");
      setNewPassword("");
      setBanner({ tone: "success", message: "Password reset. Sign in with your new password." });
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
              Back
            </Link>
            <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.demoButton}`}>
              Live Demo
            </Link>
          </div>
        </div>

        {authMode === "login" && subMode === "default" && !sessionUser ? (
          <div className={styles.aiBox}>
            <span className={styles.aiBoxGlyph}>✦</span>
            <input
              type="text"
              className={styles.aiBoxInput}
              placeholder="Ask SPECTRE anything about your portfolio risk..."
              onChange={(e) => {
                if (e.target.value.length > 0) {
                  switchToRegister();
                }
              }}
            />
            <span className={styles.aiBoxCta}>Create account to use AI →</span>
          </div>
        ) : null}

        <div className={styles.grid}>
          <aside className={styles.sideCard}>
            <div className={styles.pill}>Portfolio Intelligence</div>
            <h1>
              Know your real risk <span>before the market does.</span>
            </h1>
            <p>
              SPECTRE scores your ASX, crypto, and super holdings against live risk signals — concentration, drawdown, volatility, and more — in one unified dashboard.
            </p>

            <ul className={styles.pointList}>
              <li>Import from any broker, exchange, or super fund in minutes.</li>
              <li>One clear risk score with VaR95, drawdown, and sector breakdown.</li>
              <li>Dip alerts delivered to your inbox when prices hit your threshold.</li>
              <li>Your data is encrypted, never sold, and deletable at any time.</li>
            </ul>

            <div className={styles.sideMeta}>
              <div>
                <span>Live demo</span>
                <Link href="/dashboard?demo=1">Explore</Link>
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
              <div className={styles.cardUrl}>spectre-assets.com / sign-in</div>
            </div>

            <div className={styles.cardBody}>
              {subMode === "forgot" ? (
                <>
                  <div className={styles.sectionLabel}>Password Reset</div>
                  <h2>Forgot your password?</h2>
                  <p>Enter your account email and we&apos;ll send reset instructions.</p>

                  {banner ? (
                    <div className={`${styles.banner} ${banner.tone === "success" ? styles.bannerSuccess : banner.tone === "error" ? styles.bannerError : styles.bannerInfo}`}>
                      {banner.message}
                    </div>
                  ) : null}
                  {authError ? <div className={`${styles.banner} ${styles.bannerError}`}>{authError}</div> : null}

                  <form className={styles.formGrid} onSubmit={submitForgotPassword}>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        maxLength={254}
                        required
                      />
                    </label>
                    <button type="submit" className={`${styles.button} ${styles.primaryButton} ${styles.fullButton}`} disabled={working}>
                      {working ? "Sending..." : "Send Reset Link"}
                    </button>
                  </form>

                  <div className={styles.linkRow}>
                    <button type="button" className={styles.textButton} onClick={() => openReset()}>
                      I have a reset token
                    </button>
                    <button type="button" className={styles.textButton} onClick={switchToLogin}>
                      Back to sign in
                    </button>
                  </div>
                </>
              ) : subMode === "reset" ? (
                <>
                  <div className={styles.sectionLabel}>New Password</div>
                  <h2>Reset your password</h2>
                  <p>Paste the token from your email and choose a new password.</p>

                  {banner ? (
                    <div className={`${styles.banner} ${banner.tone === "success" ? styles.bannerSuccess : banner.tone === "error" ? styles.bannerError : styles.bannerInfo}`}>
                      {banner.message}
                    </div>
                  ) : null}
                  {authError ? <div className={`${styles.banner} ${styles.bannerError}`}>{authError}</div> : null}

                  <form className={styles.formGrid} onSubmit={submitResetPassword}>
                    <label>
                      <span>Reset Token</span>
                      <input
                        type="text"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Paste token from email"
                        maxLength={128}
                        required
                      />
                    </label>
                    <label>
                      <span>New Password</span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                      />
                    </label>
                    <button type="submit" className={`${styles.button} ${styles.primaryButton} ${styles.fullButton}`} disabled={working}>
                      {working ? "Resetting..." : "Set New Password"}
                    </button>
                  </form>

                  <div className={styles.linkRow}>
                    <button type="button" className={styles.textButton} onClick={openForgot}>
                      Resend reset link
                    </button>
                    <button type="button" className={styles.textButton} onClick={switchToLogin}>
                      Back to sign in
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.sectionLabel}>Account Access</div>
                  <h2>{authMode === "register" ? "Create your workspace" : "Welcome back"}</h2>
                  <p>
                    {sessionUser
                      ? activeSessionHasPaidAccess
                        ? `Signed in as ${sessionUser.displayName}.`
                        : `Signed in as ${sessionUser.displayName}. Continue to activate your plan.`
                      : authMode === "register"
                        ? "Create an account and start tracking your portfolio risk."
                        : "Sign in to your SPECTRE workspace."}
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
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                          maxLength={254}
                          required
                        />
                      </label>

                      <label>
                        <span>Password</span>
                        <div className={styles.passwordRow}>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Minimum 8 characters"
                            autoComplete={authMode === "register" ? "new-password" : "current-password"}
                            minLength={8}
                            maxLength={128}
                            required
                          />
                          <button
                            type="button"
                            className={styles.toggleButton}
                            onClick={() => setShowPassword((v) => !v)}
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
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="Your name"
                              autoComplete="name"
                              maxLength={80}
                            />
                          </label>

                          <fieldset className={styles.planPicker}>
                            <legend>Choose your plan</legend>
                            {(["free", "plus", "pro"] as CheckoutPlan[]).map((plan) => (
                              <label
                                key={plan}
                                className={`${styles.planOption} ${selectedPlan === plan ? styles.planOptionActive : ""}`}
                              >
                                <input
                                  type="radio"
                                  name="register-plan"
                                  checked={selectedPlan === plan}
                                  onChange={() => {
                                    setSelectedPlan(plan);
                                    setHasRequestedCheckout(plan !== "free");
                                  }}
                                />
                                <div className={styles.planOptionInner}>
                                  <span className={styles.planOptionName}>
                                    {plan === "free" ? "Free" : plan === "plus" ? "Plus" : "Pro"}
                                  </span>
                                  <span className={styles.planOptionPrice}>
                                    {plan === "free" ? "No cost" : plan === "plus" ? "$2.99 / mo" : "$9.99 / mo"}
                                  </span>
                                </div>
                              </label>
                            ))}
                          </fieldset>

                          <label className={styles.termsRow}>
                            <input
                              type="checkbox"
                              checked={acceptTerms}
                              onChange={(e) => setAcceptTerms(e.target.checked)}
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
                            ? `Create Account${selectedPlan !== "free" ? ` — ${planLabel}` : ""}`
                            : "Sign In"}
                      </button>

                      {authMode === "login" ? (
                        <button type="button" className={styles.forgotLink} onClick={openForgot}>
                          Forgot password?
                        </button>
                      ) : null}
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
                      onClick={authMode === "register" ? switchToLogin : switchToRegister}
                      disabled={working}
                    >
                      {authMode === "register" ? "Already have an account?" : "Create new account"}
                    </button>
                    {showVerificationLinks ? (
                      <button type="button" className={styles.textButton} onClick={() => void resendVerificationEmail()} disabled={working}>
                        Resend verification email
                      </button>
                    ) : null}
                  </div>
                </>
              )}
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
