# Teams Reminder Setup

This project sends due-return reminders through a Microsoft Teams bot.

## Bot endpoint

Set the bot messaging endpoint to:

`https://<your-app-domain>/api/teams/messages`

For local development:

`http://localhost:3000/api/teams/messages`

## Required environment variables

Set these in the app environment and in the Convex deployment environment when needed:

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TEAMS_APP_ID`
- `MICROSOFT_TEAMS_SERVICE_URL`
- `MicrosoftAppTenantId`
- `MicrosoftAppId`
- `MicrosoftAppPassword`
- `TEAMS_REMINDER_WEBHOOK_URL`
- `TEAMS_REMINDER_WEBHOOK_SECRET`
- `RETURN_REMINDER_TIMEZONE`

`MicrosoftAppId` / `MicrosoftAppPassword` should point to the Teams bot registration.
In many setups these match `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`.

## Teams app requirements

- The Teams app must include the bot in `personal` scope.
- The app must be available in the Teams app catalog so Graph can install it for the borrower.
- The borrower must exist in Microsoft Entra ID and their recorded borrower email must match that account.

## Reminder flow

1. Borrower email and return due date are required when an asset is borrowed.
2. Convex cron checks borrowed assets whose due date is today or overdue.
3. Convex calls the internal Teams reminder API.
4. The server resolves the borrower from Microsoft Graph, ensures the Teams app is installed, and sends the direct Teams reminder through the bot.
