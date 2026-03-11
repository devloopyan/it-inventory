import { BotFrameworkAdapter, TeamsActivityHandler, type TurnContext } from "botbuilder";

type TeamsBotConfig = {
  appId: string;
  appPassword: string;
  tenantId?: string;
};

let adapterInstance: BotFrameworkAdapter | null = null;

function resolveTeamsBotConfig(): TeamsBotConfig {
  const appId = process.env.MicrosoftAppId ?? process.env.MICROSOFT_CLIENT_ID;
  const appPassword = process.env.MicrosoftAppPassword ?? process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MicrosoftAppTenantId ?? process.env.MICROSOFT_TENANT_ID;

  if (!appId || !appPassword) {
    throw new Error("Microsoft Teams bot credentials are incomplete.");
  }

  return {
    appId,
    appPassword,
    tenantId,
  };
}

export function isTeamsBotConfigured() {
  return Boolean(
    (process.env.MicrosoftAppId ?? process.env.MICROSOFT_CLIENT_ID) &&
      (process.env.MicrosoftAppPassword ?? process.env.MICROSOFT_CLIENT_SECRET),
  );
}

export function getTeamsBotConfig() {
  return resolveTeamsBotConfig();
}

export function getTeamsBotAdapter() {
  if (adapterInstance) return adapterInstance;

  const config = resolveTeamsBotConfig();
  adapterInstance = new BotFrameworkAdapter({
    appId: config.appId,
    appPassword: config.appPassword,
    channelAuthTenant: config.tenantId,
  });
  adapterInstance.onTurnError = async (context, error) => {
    console.error("Teams bot error", error);
    if (context.responded) return;
    await context.sendActivity("The IT notification bot hit an error.");
  };

  return adapterInstance;
}

class InventoryNotificationBot extends TeamsActivityHandler {
  protected override async onTeamsMembersAdded(context: TurnContext) {
    if (context.activity.conversation?.conversationType !== "personal") {
      return;
    }
    await context.sendActivity(
      "IT inventory notifications are enabled. Due-return reminders will be sent here.",
    );
  }
}

export const teamsNotificationBot = new InventoryNotificationBot();
