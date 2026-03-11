import type { Activity, ChannelAccount, ConversationAccount } from "botframework-schema";
import { getTeamsBotAdapter, getTeamsBotConfig } from "./teamsBot";

type ReminderPayload = {
  recipientEmail: string;
  borrowerName?: string;
  assetTag: string;
  assetNameDescription?: string;
  returnDueDate: string;
};

type GraphTokenResponse = {
  access_token?: string;
};

type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

type InstalledAppListResponse = {
  value?: Array<{
    id: string;
  }>;
};

function getGraphConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? process.env.MicrosoftAppTenantId;
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.MicrosoftAppId;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MicrosoftAppPassword;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are incomplete.");
  }

  return {
    tenantId,
    clientId,
    clientSecret,
  };
}

function getTeamsAppCatalogId() {
  const teamsAppId = process.env.MICROSOFT_TEAMS_APP_ID;
  if (!teamsAppId) {
    throw new Error("MICROSOFT_TEAMS_APP_ID is required for Teams reminders.");
  }
  return teamsAppId;
}

function getTeamsServiceUrl() {
  return process.env.MICROSOFT_TEAMS_SERVICE_URL || "https://smba.trafficmanager.net/teams/";
}

function buildReminderText(payload: ReminderPayload) {
  const description = payload.assetNameDescription?.trim()
    ? ` (${payload.assetNameDescription.trim()})`
    : "";
  const name = payload.borrowerName?.trim() || "User";
  return [
    `Hello ${name},`,
    "",
    `This is a reminder that asset ${payload.assetTag}${description} is due for return on ${payload.returnDueDate}.`,
    "Please coordinate with IT for the return of the asset.",
  ].join("\n");
}

async function getMicrosoftGraphAccessToken() {
  const config = getGraphConfig();
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Unable to get Microsoft Graph access token.");
  }

  const data = (await response.json()) as GraphTokenResponse;
  if (!data.access_token) {
    throw new Error("Microsoft Graph access token was not returned.");
  }

  return data.access_token;
}

async function graphRequest<T>(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Microsoft Graph request failed for ${path}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function resolveUserByEmail(accessToken: string, email: string) {
  const user = await graphRequest<GraphUser>(
    accessToken,
    `/users/${encodeURIComponent(email)}?$select=id,displayName,mail,userPrincipalName`,
  );

  if (!user.id) {
    throw new Error(`Microsoft user lookup failed for ${email}.`);
  }

  return user;
}

async function getInstalledAppId(accessToken: string, userId: string, teamsAppId: string) {
  const query = `/users/${encodeURIComponent(
    userId,
  )}/teamwork/installedApps?$expand=teamsApp&$filter=${encodeURIComponent(
    `teamsApp/id eq '${teamsAppId}'`,
  )}`;
  const response = await graphRequest<InstalledAppListResponse>(accessToken, query);
  return response.value?.[0]?.id;
}

async function wait(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureTeamsAppInstalled(accessToken: string, userId: string) {
  const teamsAppId = getTeamsAppCatalogId();
  const existingInstallId = await getInstalledAppId(accessToken, userId, teamsAppId);
  if (existingInstallId) {
    return existingInstallId;
  }

  await graphRequest(
    accessToken,
    `/users/${encodeURIComponent(userId)}/teamwork/installedApps`,
    {
      method: "POST",
      body: JSON.stringify({
        "teamsApp@odata.bind": `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${teamsAppId}`,
      }),
    },
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await wait(1200);
    const installId = await getInstalledAppId(accessToken, userId, teamsAppId);
    if (installId) {
      return installId;
    }
  }

  throw new Error("Teams app installation could not be confirmed for the borrower.");
}

export function isTeamsReminderConfigured() {
  return Boolean(
    (process.env.MICROSOFT_TENANT_ID ?? process.env.MicrosoftAppTenantId) &&
      (process.env.MICROSOFT_CLIENT_ID ?? process.env.MicrosoftAppId) &&
      (process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MicrosoftAppPassword) &&
      (process.env.MicrosoftAppId ?? process.env.MICROSOFT_CLIENT_ID) &&
      (process.env.MicrosoftAppPassword ?? process.env.MICROSOFT_CLIENT_SECRET) &&
      process.env.MICROSOFT_TEAMS_APP_ID,
  );
}

export async function sendTeamsReturnReminder(payload: ReminderPayload) {
  const accessToken = await getMicrosoftGraphAccessToken();
  const user = await resolveUserByEmail(accessToken, payload.recipientEmail);
  await ensureTeamsAppInstalled(accessToken, user.id);

  const adapter = getTeamsBotAdapter();
  const { appId, tenantId } = getTeamsBotConfig();
  const serviceUrl = getTeamsServiceUrl();

  const botAccount: ChannelAccount = {
    id: appId,
    name: "IT Inventory Notifications",
  };
  const userAccount: ChannelAccount = {
    id: user.id,
    aadObjectId: user.id,
    name: user.displayName || payload.borrowerName || payload.recipientEmail,
  };
  const conversation: ConversationAccount = {
    id: "",
    isGroup: false,
    conversationType: "personal",
    name: user.displayName || payload.borrowerName || payload.recipientEmail,
    tenantId,
  };

  const activity: Partial<Activity> = {
    type: "message",
    text: buildReminderText(payload),
  };

  await adapter.createConversation(
    {
      bot: botAccount,
      user: userAccount,
      channelId: "msteams",
      serviceUrl,
      conversation,
    },
    async (context) => {
      await context.sendActivity(activity);
    },
  );

  return {
    aadObjectId: user.id,
    displayName: user.displayName || payload.borrowerName || payload.recipientEmail,
  };
}
