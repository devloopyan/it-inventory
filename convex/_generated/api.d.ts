/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assetLogs from "../assetLogs.js";
import type * as assets from "../assets.js";
import type * as borrowers from "../borrowers.js";
import type * as dashboardCalendar from "../dashboardCalendar.js";
import type * as digitalInventory from "../digitalInventory.js";
import type * as hardwareInventory from "../hardwareInventory.js";
import type * as http from "../http.js";
import type * as monitoring from "../monitoring.js";
import type * as operations from "../operations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assetLogs: typeof assetLogs;
  assets: typeof assets;
  borrowers: typeof borrowers;
  dashboardCalendar: typeof dashboardCalendar;
  digitalInventory: typeof digitalInventory;
  hardwareInventory: typeof hardwareInventory;
  http: typeof http;
  monitoring: typeof monitoring;
  operations: typeof operations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
