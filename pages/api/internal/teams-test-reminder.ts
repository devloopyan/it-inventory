import type { NextApiRequest, NextApiResponse } from "next";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { sendTeamsReturnReminder } from "@/lib/teamsReminders";

type ResponseBody =
  | {
      ok: true;
      recipientEmail: string;
      dueDate: string;
    }
  | {
      error: string;
    };

function getTodayInTimeZone(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const sessionToken = req.cookies[SESSION_COOKIE_NAME];
  const session = await verifySessionToken(sessionToken);
  if (!session) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const recipientEmail =
    typeof req.body?.recipientEmail === "string" ? req.body.recipientEmail.trim() : "";
  if (!recipientEmail) {
    res.status(400).json({ error: "Recipient Microsoft email is required." });
    return;
  }

  try {
    const dueDate = getTodayInTimeZone(process.env.RETURN_REMINDER_TIMEZONE || "Asia/Manila");
    await sendTeamsReturnReminder({
      recipientEmail,
      assetTag: "IT-TEST-REMINDER",
      assetNameDescription: "Teams direct message test",
      returnDueDate: dueDate,
      borrowerName: "IT Test",
    });
    res.status(200).json({
      ok: true,
      recipientEmail,
      dueDate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teams test reminder failed.";
    res.status(500).json({ error: message });
  }
}
