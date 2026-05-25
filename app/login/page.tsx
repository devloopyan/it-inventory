import { resolveSafeRedirectPath } from "@/lib/auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error?: string) {
  switch (error) {
    case "invalid":
      return "Incorrect username or password.";
    case "config":
      return "Set IT_LOGIN_SECRET before signing in. The old shared IT login also needs IT_LOGIN_USERNAME and IT_LOGIN_PASSWORD.";
    default:
      return "";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = resolveSafeRedirectPath(pickFirst(params.next));
  const errorMessage = getErrorMessage(pickFirst(params.error));

  return (
    <div className="login-page">

      {/* Left — brand panel */}
      <div className="login-brand-panel">
        <div className="login-brand-deco login-brand-deco--tl" aria-hidden="true" />
        <div className="login-brand-deco login-brand-deco--br" aria-hidden="true" />
        <div className="login-brand-content">
          <div className="login-brand-name">ENVI-COMM</div>
          <div className="login-brand-tagline">IT Operations & Asset Management</div>
          <div className="login-brand-chips">
            <span className="login-brand-chip">Hardware</span>
            <span className="login-brand-chip">Monitoring</span>
            <span className="login-brand-chip">Requests</span>
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="login-form-panel">
        <div className="login-stage">
          <section className="login-panel">
            <div className="login-panel-head">
              <div className="login-panel-title">Welcome back</div>
              <div className="login-panel-subtitle">Sign in to your IT Operations account</div>
            </div>

            {errorMessage ? <div className="login-alert">{errorMessage}</div> : null}

            <form action={loginAction} className="login-form">
              <input type="hidden" name="next" value={next} />

              <div className="login-field">
                <label className="login-label">Username</label>
                <div className="login-input-shell">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    className="input-base login-input-control"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your username"
                    aria-label="IT username"
                    required
                  />
                </div>
              </div>

              <div className="login-field">
                <label className="login-label">Password</label>
                <div className="login-input-shell">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M7 11V8.5C7 5.73858 9.23858 3.5 12 3.5C14.7614 3.5 17 5.73858 17 8.5V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </span>
                  <input
                    className="input-base login-input-control"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-label="Password"
                    required
                  />
                </div>
              </div>

              <button className="login-submit" type="submit">
                Sign In
              </button>
            </form>
          </section>

          <div className="login-footnote">
            Forgot your password?{" "}
            <span className="login-footnote-link">Contact IT admin</span>
          </div>
        </div>
      </div>

    </div>
  );
}
