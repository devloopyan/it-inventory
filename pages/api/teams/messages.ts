import type { NextApiRequest, NextApiResponse } from "next";
import { getTeamsBotAdapter, isTeamsBotConfigured, teamsNotificationBot } from "@/lib/teamsBot";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isTeamsBotConfigured()) {
    res.status(503).json({ error: "Microsoft Teams bot credentials are incomplete." });
    return;
  }

  const adapter = getTeamsBotAdapter();
  await adapter.processActivity(req, res, async (context) => {
    await teamsNotificationBot.run(context);
  });
}
