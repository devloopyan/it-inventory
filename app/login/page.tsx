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
      return "Incorrect IT username or password.";
    case "config":
      return "Set IT_LOGIN_USERNAME, IT_LOGIN_PASSWORD, and IT_LOGIN_SECRET in .env.local before signing in.";
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
      <div className="login-stage">
        <div className="login-brand" aria-hidden="true">
          <svg className="login-brand-icon" viewBox="0 0 64 40" fill="none">
            <defs>
              <linearGradient id="login-brand-gradient" x1="10" y1="8" x2="54" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8FD3FF" />
                <stop offset="0.55" stopColor="#4F8FFF" />
                <stop offset="1" stopColor="#2F6FF2" />
              </linearGradient>
            </defs>
            <path
              d="M20 10C13.3726 10 8 15.3726 8 22C8 28.6274 13.3726 34 20 34C24.8545 34 29.0359 31.1199 30.9497 26.9799C32.8636 22.8398 37.045 19.9597 41.8995 19.9597C48.5269 19.9597 53.8995 14.5871 53.8995 7.95972C53.8995 1.33231 48.5269 -4.04028 41.8995 -4.04028C37.045 -4.04028 32.8636 -1.16017 30.9497 2.97989C29.0359 7.11996 24.8545 10 20 10Z"
              transform="translate(1 5)"
              fill="url(#login-brand-gradient)"
            />
          </svg>
        </div>

        <section className="login-panel">
          <div className="login-panel-head">
            <div className="login-panel-title">Welcome Back</div>
            <div className="login-panel-subtitle">Enter your credentials to access your account.</div>
          </div>

          {errorMessage ? <div className="login-alert">{errorMessage}</div> : null}

          <form action={loginAction} className="login-form">
            <input type="hidden" name="next" value={next} />

            <div className="login-field">
              <div className="login-input-shell">
                <span className="login-input-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 7.5H20C20.5523 7.5 21 7.94772 21 8.5V15.5C21 16.0523 20.5523 16.5 20 16.5H4C3.44772 16.5 3 16.0523 3 15.5V8.5C3 7.94772 3.44772 7.5 4 7.5Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <path d="M4 9L11.1056 13.7371C11.4411 13.9608 11.8789 13.9608 12.2144 13.7371L19.32 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
              <div className="login-input-shell">
                <span className="login-input-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 11V8.5C7 5.73858 9.23858 3.5 12 3.5C14.7614 3.5 17 5.73858 17 8.5V11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
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

            <button className="btn-primary login-submit" type="submit">
              Sign In
            </button>
          </form>
        </section>

        <div className="login-footnote">
          Forgot your password? <span className="login-footnote-link">Contact IT admin</span>
        </div>
      </div>
    </div>
  );
}
