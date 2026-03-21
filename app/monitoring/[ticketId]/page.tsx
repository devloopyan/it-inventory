import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import TicketDetailClient from "./ticket-detail-client";

async function resolveActorName() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return session?.username ?? "IT";
}

export default async function MonitoringTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const actorName = await resolveActorName();
  const { ticketId } = await params;

  if (!ticketId) {
    notFound();
  }

  return <TicketDetailClient ticketId={ticketId as Id<"monitoringTickets">} actorName={actorName} />;
}
