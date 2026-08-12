// Order matters: kit tokens and components first, then the app's own styles,
// then the adapter that maps legacy class names onto the kit's components.
import "./brand-kit/tokens.css";
import "./brand-kit/components.css";
import "./globals.css";
import "./brand-kit/adapter.css";
import { Inter, Nunito } from "next/font/google";
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

// Inter is the UI face. It is exposed as --font-inter and consumed by the kit's
// --font-sans token; it is deliberately NOT applied via inter.className, which
// would set font-family on body directly and override the token.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

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
      <body className={`${inter.variable} ${nunito.variable}`}>
        <Providers>
          <AppShell currentUser={currentUser}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
