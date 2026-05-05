import type { Id } from "@/convex/_generated/dataModel";
import MyRequestDetailClient from "./my-request-detail-client";

export default async function MyRequestDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <MyRequestDetailClient ticketId={ticketId as Id<"monitoringTickets">} />;
}
