import "./globals.css";
import Providers from "./providers";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-bg">
            <div className="app-shell">
              <aside className="app-sidebar">
                <div className="logo-box">IT</div>
                <nav className="icon-nav">
                  <Link href="/dashboard" className="icon-link" aria-label="Dashboard">
                    D
                  </Link>
                  <Link href="/assets" className="icon-link" aria-label="Assets">
                    A
                  </Link>
                  <Link href="/borrowers" className="icon-link" aria-label="Borrowers">
                    B
                  </Link>
                  <Link
                    href="/hardware-inventory"
                    className="icon-link"
                    aria-label="Hardware Inventory"
                  >
                    H
                  </Link>
                </nav>
                <div className="icon-link bottom-icon">?</div>
              </aside>

              <div className="app-main">
                <header className="app-topbar">
                  <div>
                    <div className="greet-title">Greetings!</div>
                    <div className="greet-subtitle">Start your day with IT Inventory</div>
                  </div>

                  <div className="topbar-actions">
                    <input className="search-input" placeholder="Search" />
                    <div className="account-pill">My account</div>
                  </div>
                </header>

                <main className="app-content">{children}</main>
              </div>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
