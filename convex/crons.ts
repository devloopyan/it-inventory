import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 01:00 UTC = 09:00 Asia/Manila by default.
crons.daily(
  "send due return reminders",
  {
    hourUTC: 1,
    minuteUTC: 0,
  },
  internal.hardwareInventory.sendDueReturnReminders,
);

export default crons;
