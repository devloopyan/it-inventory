# Learning Hub — Design Spec

**Date:** 2026-07-06
**Status:** Approved for planning
**Author:** official@envicomm.org

## Summary

Embed the existing "Dev Phrasebook" React component into the IT Inventory System as
an **admin-only** tab in a new **"Personal"** sidebar section. It is a private,
single-browser learning space for the owner, who is learning developer, system
analyst, and QA skills. All data persists in the browser's `localStorage` — no
database, no backend, no cross-device sync.

The Phrasebook keeps its distinct warm paper/notebook aesthetic (Fraunces serif +
JetBrains Mono + cream palette), deliberately different from the app's cool APO
Linear design system, to signal "this is my personal space."

## Goals

- One new nav tab — "Learning Hub" — visible only to `owner`/`admin` roles.
- Preserve all four Phrasebook sections and their behavior:
  - **Notebook** — capture terms, plain-English meanings, 5-dot confidence,
    categories, link related terms, needs-review / ready-to-archive states.
  - **Roadmap** — 4-phase checklist with progress bar.
  - **Activities** — Developer / System Analyst / QA real-world tasks with
    focus (star) and mastered (check) states.
  - **Quiz** — flashcards drawn from terms that have a meaning, weakest-first.
  - **Connection map** — d3 force-directed graph of linked terms.
- Data persists across sessions in the same browser via `localStorage`.

## Non-Goals (YAGNI)

- No database / Convex integration. (The app uses Convex for shared data; the
  Learning Hub intentionally does not.)
- No cross-device sync. Data lives only in the browser it was entered in.
- No multi-user sharing or per-user storage. It is the admin's personal space.
- No restyle to the APO design system. The paper/notebook look is kept as-is.

## Source Material

The user supplied a complete, working component, `dev-phrasebook.jsx`, built for
Claude's artifact sandbox. It is functionally complete; the work is adapting it to
run in this Next.js 16 / React 19 / Tailwind v4 app.

## Architecture

### Files to create

| File | Purpose |
|------|---------|
| `app/learning/page.tsx` | Thin route page (server component) that renders the client component. |
| `app/learning/learning-client.tsx` | The Phrasebook, adapted to Next.js. Starts with `"use client"`. Contains all sub-components (`RoadmapTracker`, `ActivitiesTab`, `QuizMode`, `GraphView`, `EntryCard`, `ConnectPicker`, `StatChip`, `EmptyState`). |

### Files to modify

| File | Change |
|------|--------|
| `app/app-shell.tsx` | Add a new nav section `{ label: "Personal", items: [...] }` with one item: `{ href: "/learning", label: "Learning Hub", icon: <…>, allowedRoles: ["owner", "admin"] }`. Uses the existing `allowedRoles` gating in `canShowNavItem`. |
| `lib/roles.ts` | In `canAccessAppPath`, add a branch: if `pathname === "/learning"` or starts with `/learning/`, return `isAdminRole(role)` (i.e. `ADMIN_ROLES.includes(...)`). Blocks non-admins from direct-URL access. |
| `app/layout.tsx` | Add `Fraunces` and `JetBrains_Mono` via `next/font/google`, exposing CSS variables (`--font-fraunces`, `--font-jetbrains-mono`) on `<body>` so the client component can reference them. Inter already loaded. |
| `package.json` | Add `d3` (dependency) and `@types/d3` (devDependency); run `npm install`. |

## Access Control

"Admin only" = the `ADMIN_ROLES` set already defined in `lib/roles.ts`:
`["owner", "admin"]`. Enforced in two existing places, mirroring the `/users` tab:

1. **Nav visibility** — `allowedRoles: ["owner", "admin"]` on the nav item makes
   `canShowNavItem` hide it (and the whole "Personal" section collapses when empty
   via the existing `.filter((section) => section.items.length > 0)`).
2. **Route guard** — the new `/learning` branch in `canAccessAppPath` prevents a
   non-admin from reaching the page by typing the URL.

## Data & Storage

All state lives in `localStorage`, matching the existing pattern in
`lib/activeWorkflow.ts`. The component's original calls use a Claude-only
`window.storage.get/set` API (async, returns `{ value }`). We replace this with a
tiny local wrapper so the call sites stay almost identical:

```js
const storage = {
  get: async (key) => {
    const value = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return value === null ? null : { value };
  },
  set: async (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};
```

Storage keys are namespaced to avoid any collision with existing app keys:

| Data | Key |
|------|-----|
| Notebook entries | `learning-phrasebook-entries` |
| Roadmap progress | `learning-phrasebook-roadmap-progress` |
| Activities progress | `learning-phrasebook-activities-progress` |

(These rename the file's original `phrasebook-*` keys.)

## Adaptations to the Supplied Component

Behavior is unchanged; these are environment fixes:

1. **`"use client"`** directive at the top (uses hooks + browser APIs).
2. **`window.storage` → local `storage` wrapper** (see above).
3. **`.jsx` → `.tsx`** with light, pragmatic typing. Some `any` is acceptable for a
   personal tool; the priority is a clean compile, not exhaustive types.
4. **Fix mangled characters** from the copy-paste (`â` → `—`, `Â·` → `·`, garbled
   arrows → `→`/`←`, smart quotes) throughout strings and comments.
5. **Fonts** — remove the in-component Google-Fonts `@import`; instead reference the
   `next/font` CSS variables added in `layout.tsx`. The scoped `<style>` block that
   defines animations (`.card-enter`, `.highlight-ring`, keyframes) and the
   `.fraunces` / `.mono` / `.sans` helper classes stays, but the font-family values
   point at the `next/font` variables.
6. **Namespace storage keys** as listed above.

## Dependencies

- **`d3`** — required by `GraphView` for the force-directed connection map
  (`d3.forceSimulation`, `forceLink`, `forceManyBody`, `forceCenter`, `forceCollide`).
  Added as a dependency; `@types/d3` for TypeScript.
- **`lucide-react`** — already installed; the icon imports work as-is.
- **Tailwind v4** — already installed (`@import "tailwindcss"` in `globals.css`);
  all utility classes in the component work without config changes.

## Testing / Verification

Because this is a self-contained client feature with no shared data, verification is
manual, driven in the running app:

1. As an **admin/owner**, "Learning Hub" appears under a "Personal" sidebar section;
   clicking it loads the Phrasebook.
2. As a **non-admin** (member/reviewer/team_lead), the tab is hidden AND visiting
   `/learning` directly is blocked by the route guard.
3. Add a term in Notebook → it appears; reload the page → it persists.
4. Toggle a Roadmap item, star/master an Activity, run a Quiz card → each persists
   across reload under its namespaced key.
5. Link two terms → the connection map (d3 graph) renders an edge between them.
6. No console errors; fonts render (Fraunces headings, mono labels).

## Open Questions

None. All decisions confirmed with the user:
- Name: "Learning Hub"; placement: new "Personal" sidebar section.
- Visibility: admin only (`owner` + `admin`).
- Style: keep the paper/notebook look.
- Connection graph: kept (add `d3`).
