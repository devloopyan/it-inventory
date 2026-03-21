import { cookies } from "next/headers";
import MonitoringClient from "./monitoring-client";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

async function resolveActorName() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return session?.username ?? "IT";
}

export default async function MonitoringPage() {
  const actorName = await resolveActorName();
  return <MonitoringClient actorName={actorName} />;
}
