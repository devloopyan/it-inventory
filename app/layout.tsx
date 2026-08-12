import "./globals.css";
import { Nunito } from "next/font/google";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import Providers from "./providers";
import AppShell from "./app-shell";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-nunito",
});

// The brand kit specifies Helvetica Neue with a system fallback stack, set on
// --font-family-sans in globals.css. No webfont is loaded for the UI face.

async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  return {
    displayName: session.displayName ?? session.username,
    username: session.username,
    role: session.role,
    serviceGroups: session.serviceGroups,
    approvalScopes: session.approvalScopes,
    department: session.department,
    section: session.section,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  return (
    <html lang="en">
      <body className={nunito.variable}>
        <Providers>
          <AppShell currentUser={currentUser}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
