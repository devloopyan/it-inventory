import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { normalizeUserRole } from "@/lib/roles";
import UserSettingsClient from "./settings-client";

export default async function UserSettingsPage() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (normalizeUserRole(session?.role) !== "admin") {
    redirect("/dashboard");
  }

  return <UserSettingsClient />;
}
