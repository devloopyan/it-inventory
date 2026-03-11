import type { NextApiRequest, NextApiResponse } from "next";
import { isTeamsReminderConfigured, sendTeamsReturnReminder } from "@/lib/teamsReminders";

type ErrorBody = {
  error: string;
};

function getSharedSecret() {
  return process.env.TEAMS_REMINDER_WEBHOOK_SECRET;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: true } | ErrorBody>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (!isTeamsReminderConfigured()) {
    res.status(503).json({ error: "Teams reminder configuration is incomplete." });
    return;
  }

  const sharedSecret = getSharedSecret();
  if (!sharedSecret || req.headers["x-reminder-secret"] !== sharedSecret) {
    res.status(401).json({ error: "Unauthorized reminder request." });
    return;
  }

  const payload = req.body as {
    recipientEmail?: string;
    borrowerName?: string;
    assetTag?: string;
    assetNameDescription?: string;
    returnDueDate?: string;
  };

  if (!payload.recipientEmail || !payload.assetTag || !payload.returnDueDate) {
    res.status(400).json({ error: "recipientEmail, assetTag, and returnDueDate are required." });
    return;
  }

  try {
    await sendTeamsReturnReminder({
      recipientEmail: payload.recipientEmail,
      borrowerName: payload.borrowerName,
      assetTag: payload.assetTag,
      assetNameDescription: payload.assetNameDescription,
      returnDueDate: payload.returnDueDate,
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teams reminder failed.";
    res.status(500).json({ error: message });
  }
}
