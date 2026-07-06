# Learning Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only "Learning Hub" tab (the Dev Phrasebook: Notebook / Roadmap / Activities / Quiz) to the IT Inventory System, backed by `localStorage`.

**Architecture:** A self-contained client component (`app/learning/learning-client.jsx`) rendered by a thin server route page (`app/learning/page.tsx`). Visibility is gated to `owner`/`admin` in two existing places: the sidebar nav (`allowedRoles`) and the `proxy.ts` middleware route guard (`canAccessAppPath`). All state lives in `localStorage`; no database or Convex.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 (already configured), `lucide-react` (installed), `d3` (added in Task 1), `next/font/google` for Fraunces + JetBrains Mono.

## Global Constraints

- Keep the component as **`.jsx`** — the project's `tsconfig.json` has `allowJs: true`, so no TypeScript typing is required and the file is not type-checked.
- Roles: "admin only" = the `ADMIN_ROLES` set in `lib/roles.ts` = `["owner", "admin"]`.
- `localStorage` keys MUST be namespaced `learning-phrasebook-*` (never the bare `phrasebook-*`).
- Preserve all existing Phrasebook behavior — these are environment adaptations, not feature changes.
- Keep the paper/notebook aesthetic; fonts load via `next/font` CSS variables (`--font-fraunces`, `--font-jetbrains-mono`, existing `--font-inter`), NOT via a Google-Fonts CDN `@import`.
- This repo has **no unit-test harness** (no jest/vitest; `package.json` scripts are only `dev`/`build`/`start`/`lint`). The automated gate per task is `npx tsc --noEmit` and `npm run lint`; behavioral checks are manual in `npm run dev`.
- Commit at the end of each task. End commit messages with the `Co-Authored-By` trailer.

---

### Task 1: Add d3 dependency and load fonts

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: the `d3` package (consumed by the graph in Task 2); CSS variables `--font-fraunces` and `--font-jetbrains-mono` on `<body>` (consumed by Task 2's `<style>` block).

- [ ] **Step 1: Install d3**

Run:
```bash
npm install d3
```
Expected: `package.json` `dependencies` now lists `d3`; `npm` exits 0. (No `@types/d3` — the component is `.jsx` and is not type-checked.)

- [ ] **Step 2: Load Fraunces + JetBrains Mono in the layout**

In `app/layout.tsx`, change the font import line and add two font instances. Replace:

```tsx
import { Inter, Nunito } from "next/font/google";
```

with:

```tsx
import { Inter, Nunito, Fraunces, JetBrains_Mono } from "next/font/google";
```

Then, immediately after the existing `inter` definition (the block ending with `variable: "--font-inter",\n});`), add:

```tsx
// Learning Hub (Dev Phrasebook) uses a warm serif + mono pairing.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-fraunces",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});
```

- [ ] **Step 3: Expose the font variables on `<body>`**

In `app/layout.tsx`, replace:

```tsx
      <body className={`${inter.className} ${inter.variable} ${nunito.variable}`}>
```

with:

```tsx
      <body className={`${inter.className} ${inter.variable} ${nunito.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
```

- [ ] **Step 4: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: both pass with no new errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(learning): add d3 dep and Fraunces/JetBrains Mono fonts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create the adapted Phrasebook client component

**Files:**
- Create: `app/learning/learning-client.jsx`

**Interfaces:**
- Consumes: `d3` and the font CSS variables from Task 1; `lucide-react` (already installed).
- Produces: a default-exported React component `LearningClient` (consumed by Task 3's page).

This is the user's supplied `dev-phrasebook.jsx` with exactly these adaptations already applied: `"use client"` added; a local `storage` wrapper over `localStorage` replacing `window.storage`; storage keys namespaced `learning-phrasebook-*`; mangled characters fixed; font-family values pointed at the `next/font` variables and the CDN `@import` removed. Behavior is otherwise identical.

- [ ] **Step 1: Create `app/learning/learning-client.jsx` with this exact content**

```jsx
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Archive, RotateCcw, BookOpen, Inbox, X, Link2, Check, Star } from "lucide-react";
import * as d3 from "d3";

const INK = "#1E2A44";
const PAPER = "#F1ECE0";
const CARD = "#FAF7EF";
const STAMP_RED = "#B23A2E";
const MUSTARD = "#C08A1F";
const TEAL = "#2F6E62";
const MUTED = "#7A7062";
const RULE = "#DCD3C0";
const SLATE = "#4A6FA5";
const PLUM = "#7B4B94";

// Tiny localStorage wrapper mirroring the async { value } shape the component was
// originally built against. Matches the app's localStorage use in lib/activeWorkflow.ts.
const storage = {
  get: async (key) => {
    if (typeof window === "undefined") return null;
    const value = window.localStorage.getItem(key);
    return value === null ? null : { value };
  },
  set: async (key, value) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
};

const CATEGORIES = ["Core Vocab", "Team Process", "Architecture", "Tooling", "Other"];
const CATEGORY_COLORS = {
  "Core Vocab": SLATE,
  "Team Process": TEAL,
  Architecture: PLUM,
  Tooling: MUSTARD,
  Other: MUTED,
};

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STORAGE_KEY = "learning-phrasebook-entries";
const ROADMAP_KEY = "learning-phrasebook-roadmap-progress";

const ROADMAP = [
  {
    id: "p1",
    phase: "Phase 1",
    title: "Core Vocabulary",
    weeks: "Week 1–2",
    color: SLATE,
    items: [
      { id: "p1-1", label: "Roles: frontend, backend, full-stack, DevOps, QA, PM" },
      { id: "p1-2", label: "Code structure: function, variable, repo, branch, commit, PR" },
      { id: "p1-3", label: "Version control: Git, merge, rebase, conflict, main/master" },
      { id: "p1-4", label: "Environments: local, dev, staging, production" },
      { id: "p1-5", label: "Bugs & work: bug, issue, ticket, backlog, blocker, hotfix" },
    ],
  },
  {
    id: "p2",
    phase: "Phase 2",
    title: "How Teams Work",
    weeks: "Week 3–4",
    color: TEAL,
    items: [
      { id: "p2-1", label: "Sprint & standup" },
      { id: "p2-2", label: "Backlog grooming / refinement" },
      { id: "p2-3", label: "Sprint planning" },
      { id: "p2-4", label: "Retro (retrospective)" },
      { id: "p2-5", label: "Story points" },
      { id: "p2-6", label: "Epic vs. Story vs. Task" },
      { id: "p2-7", label: "Definition of Done" },
    ],
  },
  {
    id: "p3",
    phase: "Phase 3",
    title: "Architecture & Systems Talk",
    weeks: "Week 5–6",
    color: PLUM,
    items: [
      { id: "p3-1", label: "API" },
      { id: "p3-2", label: "Frontend vs. backend" },
      { id: "p3-3", label: "Database" },
      { id: "p3-4", label: "Server & client" },
      { id: "p3-5", label: "Cloud (AWS/Azure/GCP)" },
      { id: "p3-6", label: "Microservices vs. monolith" },
      { id: "p3-7", label: "Latency & downtime" },
      { id: "p3-8", label: "Deploy & CI/CD" },
    ],
  },
  {
    id: "p4",
    phase: "Phase 4",
    title: "Team-Specific & Tooling",
    weeks: "Week 7–8",
    color: MUSTARD,
    items: [
      { id: "p4-1", label: "List every tool your team names" },
      { id: "p4-2", label: 'Watch a "5 min explained" video for each tool' },
      { id: "p4-3", label: "Get a 15-min stack tour from a teammate" },
    ],
  },
];

const ROLE_COLORS = { Developer: SLATE, "System Analyst": PLUM, QA: TEAL };

const ACTIVITIES = [
  { id: "dev-1", role: "Developer", label: "Create a project folder in VS Code" },
  { id: "dev-2", role: "Developer", label: "Open the integrated terminal and run a command" },
  { id: "dev-3", role: "Developer", label: "Initialize Git (git init) in a folder" },
  { id: "dev-4", role: "Developer", label: "Create a GitHub repo and push your first commit" },
  { id: "dev-5", role: "Developer", label: "Clone an existing repo to your machine" },
  { id: "dev-6", role: "Developer", label: "Run your code and check the console for errors" },
  { id: "dev-7", role: "Developer", label: "Write and run a simple unit test" },
  { id: "dev-8", role: "Developer", label: "Fix a small bug and open a pull request" },
  { id: "dev-9", role: "Developer", label: "Review a teammate's PR and leave a comment" },
  { id: "sa-1", role: "System Analyst", label: "Write a user story with acceptance criteria" },
  { id: "sa-2", role: "System Analyst", label: "Create a process/flow diagram for a feature" },
  { id: "sa-3", role: "System Analyst", label: "Document requirements for a small feature" },
  { id: "sa-4", role: "System Analyst", label: "Run a mock stakeholder interview and take notes" },
  { id: "sa-5", role: "System Analyst", label: "Sketch a wireframe for a screen" },
  { id: "sa-6", role: "System Analyst", label: "Map the data flow between two systems" },
  { id: "qa-1", role: "QA", label: "Write a test case for a feature" },
  { id: "qa-2", role: "QA", label: "Execute manual test cases and log results" },
  { id: "qa-3", role: "QA", label: "File a bug report with clear repro steps" },
  { id: "qa-4", role: "QA", label: "Retest and verify a bug fix" },
  { id: "qa-5", role: "QA", label: "Run a regression checklist before release" },
  { id: "qa-6", role: "QA", label: "Use browser dev tools to inspect a failing request" },
  { id: "qa-7", role: "QA", label: "Write a simple automated test script" },
];

export default function LearningClient() {
  const [entries, setEntries] = useState(null);
  const [section, setSection] = useState("notebook");
  const [tab, setTab] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ term: "", context: "", meaning: "", relatedIds: [], category: "Other" });
  const [error, setError] = useState("");
  const [highlightId, setHighlightId] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        setEntries(res ? JSON.parse(res.value) : []);
      } catch {
        setEntries([]);
      }
    })();
  }, []);

  async function persist(next) {
    setEntries(next);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setError("Couldn't save — your change may not persist.");
      setTimeout(() => setError(""), 3000);
    }
  }

  function addEntry() {
    if (!form.term.trim()) return;
    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    const entry = {
      id: newId,
      term: form.term.trim(),
      context: form.context.trim(),
      meaning: form.meaning.trim(),
      confidence: 1,
      dateAdded: now,
      lastReviewed: now,
      archived: false,
      relatedIds: [...form.relatedIds],
      category: form.category || "Other",
    };
    const updatedOthers = entries.map((e) =>
      form.relatedIds.includes(e.id)
        ? { ...e, relatedIds: Array.from(new Set([...(e.relatedIds || []), newId])) }
        : e
    );
    persist([entry, ...updatedOthers]);
    setForm({ term: "", context: "", meaning: "", relatedIds: [], category: "Other" });
    setShowForm(false);
  }

  function updateEntry(id, patch) {
    persist(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function setConfidence(id, level) {
    updateEntry(id, { confidence: level, lastReviewed: new Date().toISOString() });
  }

  function toggleArchive(id, archived) {
    updateEntry(id, { archived });
  }

  function linkEntries(idA, idB) {
    if (idA === idB) return;
    persist(
      entries.map((e) => {
        if (e.id === idA) return { ...e, relatedIds: Array.from(new Set([...(e.relatedIds || []), idB])) };
        if (e.id === idB) return { ...e, relatedIds: Array.from(new Set([...(e.relatedIds || []), idA])) };
        return e;
      })
    );
  }

  function unlinkEntries(idA, idB) {
    persist(
      entries.map((e) => {
        if (e.id === idA) return { ...e, relatedIds: (e.relatedIds || []).filter((id) => id !== idB) };
        if (e.id === idB) return { ...e, relatedIds: (e.relatedIds || []).filter((id) => id !== idA) };
        return e;
      })
    );
  }

  function jumpTo(id) {
    setSection("notebook");
    setTab("active");
    setHighlightId(id);
    setTimeout(() => {
      document.getElementById(`entry-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    setTimeout(() => setHighlightId(null), 1600);
  }

  const entriesById = useMemo(() => {
    const map = {};
    (entries || []).forEach((e) => (map[e.id] = e));
    return map;
  }, [entries]);

  const { active, needsReview, readyToArchive, archived } = useMemo(() => {
    const list = entries || [];
    const active = list.filter((e) => !e.archived);
    const needsReview = active.filter((e) => e.confidence <= 2 && daysSince(e.dateAdded) >= 14);
    const readyToArchive = active.filter((e) => e.confidence === 5 && daysSince(e.lastReviewed) >= 21);
    const archived = list.filter((e) => e.archived);
    return { active, needsReview, readyToArchive, archived };
  }, [entries]);

  const totalLinks = useMemo(() => {
    const seen = new Set();
    let count = 0;
    active.forEach((e) =>
      (e.relatedIds || []).forEach((rid) => {
        const key = [e.id, rid].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          count++;
        }
      })
    );
    return count;
  }, [active]);

  const visible = useMemo(() => {
    const list =
      tab === "active" ? active : tab === "review" ? needsReview : tab === "archive" ? readyToArchive : archived;
    const filtered = list.filter((e) => {
      const matchesCategory = categoryFilter === "All" || (e.category || "Other") === categoryFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q || e.term.toLowerCase().includes(q) || e.meaning.toLowerCase().includes(q) || e.context.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
    return [...filtered].sort((a, b) => {
      if (tab === "active") {
        if (a.confidence !== b.confidence) return a.confidence - b.confidence;
        return new Date(b.dateAdded) - new Date(a.dateAdded);
      }
      return new Date(b.dateAdded) - new Date(a.dateAdded);
    });
  }, [tab, active, needsReview, readyToArchive, archived, search, categoryFilter]);

  if (entries === null) {
    return (
      <div style={{ background: PAPER }} className="min-h-screen flex items-center justify-center">
        <p style={{ color: MUTED, fontFamily: "var(--font-jetbrains-mono), monospace" }} className="text-sm">
          loading notebook…
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: PAPER, minHeight: "100vh" }}>
      <style>{`
        .fraunces { font-family: var(--font-fraunces), serif; }
        .mono { font-family: var(--font-jetbrains-mono), monospace; }
        .sans { font-family: var(--font-inter), sans-serif; }
        .dot-btn { transition: transform 0.12s ease; }
        .dot-btn:hover { transform: scale(1.25); }
        .card-enter { animation: slideIn 0.25s ease; }
        .highlight-ring { animation: ringPulse 1.6s ease; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ringPulse { 0% { box-shadow: 0 0 0 0 rgba(178,58,46,0.45); } 60% { box-shadow: 0 0 0 6px rgba(178,58,46,0); } 100% { box-shadow: 0 0 0 0 rgba(178,58,46,0); } }
      `}</style>

      <div className="max-w-2xl mx-auto px-6 py-12 sans">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={18} style={{ color: STAMP_RED }} />
              <span className="mono text-xs tracking-widest uppercase" style={{ color: MUTED }}>
                dev-speak — plain english
              </span>
            </div>
            <h1 className="fraunces text-4xl font-semibold" style={{ color: INK }}>
              The Phrasebook
            </h1>
          </div>
          <div className="mono text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: RULE, color: MUTED }}>
            {active.length} entr{active.length === 1 ? "y" : "ies"}
          </div>
        </div>
        <p className="sans text-sm mb-6" style={{ color: MUTED }}>
          Every unfamiliar term goes in here the moment you hear it. Link related terms so the pieces connect.
        </p>

        {/* Section nav */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl border" style={{ borderColor: RULE, background: CARD, width: "fit-content" }}>
          {[
            { id: "notebook", label: "Notebook" },
            { id: "roadmap", label: "Roadmap" },
            { id: "activities", label: "Activities" },
            { id: "quiz", label: "Quiz" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="mono text-xs px-4 py-2 rounded-lg transition-colors"
              style={{
                background: section === s.id ? INK : "transparent",
                color: section === s.id ? CARD : MUTED,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === "roadmap" && <RoadmapTracker entries={active} />}
        {section === "activities" && <ActivitiesTab />}
        {section === "quiz" && <QuizMode entries={active} onReview={setConfidence} />}

        {section === "notebook" && (
        <>
        {/* Stats strip */}
        <div className="flex gap-3 mb-8">
          <StatChip label="needs review" value={needsReview.length} color={STAMP_RED} active={tab === "review"} onClick={() => setTab("review")} />
          <StatChip label="ready to archive" value={readyToArchive.length} color={TEAL} active={tab === "archive"} onClick={() => setTab("archive")} />
          <StatChip label="archived" value={archived.length} color={MUTED} active={tab === "archived"} onClick={() => setTab("archived")} />
          <StatChip label="map" value={totalLinks} color={TEAL} active={tab === "map"} onClick={() => setTab("map")} />
          {tab !== "active" && (
            <button onClick={() => setTab("active")} className="mono text-xs px-3 py-2 rounded-lg" style={{ color: MUTED }}>
              ← back to all
            </button>
          )}
        </div>

        {/* Capture form */}
        {tab === "active" && (
          <div className="mb-8">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed sans text-sm font-medium transition-colors"
                style={{ borderColor: RULE, color: INK }}
              >
                <Plus size={16} style={{ color: STAMP_RED }} />
                New entry — heard something you didn't catch?
              </button>
            ) : (
              <div className="card-enter rounded-xl p-5 border" style={{ background: CARD, borderColor: RULE }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="mono text-xs uppercase tracking-wide" style={{ color: MUTED }}>
                    capture
                  </span>
                  <button onClick={() => setShowForm(false)}>
                    <X size={16} style={{ color: MUTED }} />
                  </button>
                </div>
                <input
                  autoFocus
                  value={form.term}
                  onChange={(e) => setForm({ ...form, term: e.target.value })}
                  placeholder="The term (e.g. sprint, blocker, rebase)"
                  className="fraunces w-full text-xl mb-3 bg-transparent outline-none border-b pb-2"
                  style={{ color: INK, borderColor: RULE }}
                />
                <input
                  value={form.context}
                  onChange={(e) => setForm({ ...form, context: e.target.value })}
                  placeholder="Where you heard it (e.g. sprint planning)"
                  className="mono w-full text-sm mb-3 bg-transparent outline-none"
                  style={{ color: MUTED }}
                />
                <textarea
                  value={form.meaning}
                  onChange={(e) => setForm({ ...form, meaning: e.target.value })}
                  placeholder="Plain-English meaning, if you know it yet (optional)"
                  rows={2}
                  className="sans w-full text-sm mb-3 bg-transparent outline-none resize-none"
                  style={{ color: INK }}
                />
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, category: c })}
                      className="mono text-[11px] px-2.5 py-1 rounded-full border"
                      style={{
                        borderColor: form.category === c ? CATEGORY_COLORS[c] : RULE,
                        background: form.category === c ? CATEGORY_COLORS[c] + "1a" : "transparent",
                        color: form.category === c ? CATEGORY_COLORS[c] : MUTED,
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <ConnectPicker
                  label="Connects to (optional)"
                  selectedIds={form.relatedIds}
                  candidates={active}
                  onAdd={(id) => setForm({ ...form, relatedIds: [...form.relatedIds, id] })}
                  onRemove={(id) => setForm({ ...form, relatedIds: form.relatedIds.filter((x) => x !== id) })}
                />
                <button
                  onClick={addEntry}
                  disabled={!form.term.trim()}
                  className="sans text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-40 mt-3"
                  style={{ background: INK }}
                >
                  Add to notebook
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search + category filter */}
        {tab !== "map" && (
          <div className="mb-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your terms…"
              className="sans w-full text-sm px-4 py-2.5 rounded-lg border bg-transparent outline-none mb-2.5"
              style={{ borderColor: RULE, color: INK }}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter("All")}
                className="mono text-[11px] px-2.5 py-1 rounded-full border"
                style={{
                  borderColor: categoryFilter === "All" ? INK : RULE,
                  background: categoryFilter === "All" ? INK : "transparent",
                  color: categoryFilter === "All" ? CARD : MUTED,
                }}
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className="mono text-[11px] px-2.5 py-1 rounded-full border"
                  style={{
                    borderColor: categoryFilter === c ? CATEGORY_COLORS[c] : RULE,
                    background: categoryFilter === c ? CATEGORY_COLORS[c] + "1a" : "transparent",
                    color: categoryFilter === c ? CATEGORY_COLORS[c] : MUTED,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Entries */}
        {tab === "map" ? (
          <GraphView entries={active} onJump={jumpTo} />
        ) : visible.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="space-y-3">
            {visible.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                allActive={active}
                entriesById={entriesById}
                highlighted={highlightId === e.id}
                onSetConfidence={(lvl) => setConfidence(e.id, lvl)}
                onDefine={(meaning) => updateEntry(e.id, { meaning })}
                onArchive={() => toggleArchive(e.id, true)}
                onRestore={() => toggleArchive(e.id, false)}
                onLink={(otherId) => linkEntries(e.id, otherId)}
                onUnlink={(otherId) => unlinkEntries(e.id, otherId)}
                onJump={jumpTo}
              />
            ))}
          </div>
        )}
        </>
        )}

        {error && (
          <div className="fixed bottom-6 right-6 mono text-xs px-4 py-2 rounded-lg text-white" style={{ background: STAMP_RED }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 text-left px-3 py-2 rounded-lg border transition-colors"
      style={{ borderColor: active ? color : RULE, background: active ? color + "14" : "transparent" }}
    >
      <div className="fraunces text-lg font-semibold" style={{ color: value > 0 ? color : MUTED }}>
        {value}
      </div>
      <div className="mono text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
        {label}
      </div>
    </button>
  );
}

function EmptyState({ tab }) {
  const copy = {
    active: ["Notebook's empty", "Add the first term you didn't catch in a meeting."],
    review: ["Nothing stuck for two weeks", "Low-confidence terms older than 14 days show up here."],
    archive: ["Nothing to archive yet", "Terms you've known well for 3+ weeks land here."],
    archived: ["No archived terms", "Once you're confident on something, tuck it away here."],
  }[tab];
  return (
    <div className="text-center py-16">
      <Inbox size={28} className="mx-auto mb-3" style={{ color: RULE }} />
      <p className="fraunces text-lg mb-1" style={{ color: INK }}>{copy[0]}</p>
      <p className="sans text-sm" style={{ color: MUTED }}>{copy[1]}</p>
    </div>
  );
}

function GraphView({ entries, onJump }) {
  const width = 600;
  const height = 420;

  const { nodes, links } = useMemo(() => {
    const nodes = entries.map((e, i) => ({
      id: e.id,
      term: e.term,
      confidence: e.confidence,
      x: width / 2 + 130 * Math.cos((i / Math.max(entries.length, 1)) * 2 * Math.PI),
      y: height / 2 + 130 * Math.sin((i / Math.max(entries.length, 1)) * 2 * Math.PI),
    }));
    const seen = new Set();
    const links = [];
    const idSet = new Set(entries.map((e) => e.id));
    entries.forEach((e) => {
      (e.relatedIds || []).forEach((rid) => {
        if (!idSet.has(rid)) return;
        const key = [e.id, rid].sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        links.push({ source: e.id, target: rid });
      });
    });
    if (nodes.length > 0) {
      const sim = d3
        .forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((d) => d.id).distance(95).strength(0.7))
        .force("charge", d3.forceManyBody().strength(-260))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(38))
        .stop();
      for (let i = 0; i < 260; i++) sim.tick();
    }
    return { nodes, links };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Link2 size={28} className="mx-auto mb-3" style={{ color: RULE }} />
        <p className="fraunces text-lg mb-1" style={{ color: INK }}>Nothing to map yet</p>
        <p className="sans text-sm" style={{ color: MUTED }}>Add a few terms and connect them to see how they relate.</p>
      </div>
    );
  }

  const connectedIds = new Set();
  links.forEach((l) => {
    connectedIds.add(typeof l.source === "object" ? l.source.id : l.source);
    connectedIds.add(typeof l.target === "object" ? l.target.id : l.target);
  });

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: RULE,
        background: CARD,
        backgroundImage: `linear-gradient(${RULE} 1px, transparent 1px), linear-gradient(90deg, ${RULE} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={14} style={{ color: TEAL }} />
        <span className="mono text-xs uppercase tracking-wide" style={{ color: MUTED }}>
          connection map
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {links.map((l, i) => {
          const s = typeof l.source === "object" ? l.source : nodes.find((n) => n.id === l.source);
          const t = typeof l.target === "object" ? l.target : nodes.find((n) => n.id === l.target);
          if (!s || !t) return null;
          return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={TEAL} strokeWidth={1.5} opacity={0.45} />;
        })}
        {nodes.map((n) => {
          const isolated = !connectedIds.has(n.id);
          const fillMix = n.confidence / 5;
          return (
            <g key={n.id} onClick={() => onJump(n.id)} style={{ cursor: "pointer" }}>
              <circle
                cx={n.x}
                cy={n.y}
                r={isolated ? 15 : 22}
                fill={isolated ? CARD : MUSTARD}
                fillOpacity={isolated ? 0.7 : 0.25 + fillMix * 0.55}
                stroke={isolated ? RULE : MUSTARD}
                strokeWidth={1.5}
              />
              <text
                x={n.x}
                y={n.y + (isolated ? 28 : 36)}
                textAnchor="middle"
                style={{ fontFamily: "var(--font-fraunces), serif", fontSize: isolated ? 11 : 13, fill: INK }}
              >
                {n.term}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mono text-[10px] mt-2" style={{ color: MUTED }}>
        {links.length} connection{links.length === 1 ? "" : "s"} across {nodes.length} term{nodes.length === 1 ? "" : "s"} — click a node to jump to it
      </p>
    </div>
  );
}

function ConnectPicker({ label, selectedIds, candidates, onAdd, onRemove }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const options = candidates.filter(
    (c) => !selectedIds.includes(c.id) && c.term.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function onClickOutside(ev) {
      if (boxRef.current && !boxRef.current.contains(ev.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <span className="mono text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {selectedIds.map((id) => {
          const c = candidates.find((x) => x.id === id);
          if (!c) return null;
          return (
            <span
              key={id}
              className="mono text-xs px-2 py-1 rounded-full flex items-center gap-1"
              style={{ background: TEAL + "1a", color: TEAL }}
            >
              <Link2 size={10} /> {c.term}
              <button onClick={() => onRemove(id)}>
                <X size={10} />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="search a term…"
          className="mono text-xs bg-transparent outline-none px-1"
          style={{ color: INK, minWidth: 100 }}
        />
      </div>
      {open && query && options.length > 0 && (
        <div
          className="absolute z-10 mt-1 w-56 rounded-lg border shadow-sm overflow-hidden"
          style={{ background: CARD, borderColor: RULE }}
        >
          {options.slice(0, 6).map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onAdd(o.id);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 sans text-sm hover:opacity-70"
              style={{ color: INK }}
            >
              {o.term}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  allActive,
  entriesById,
  highlighted,
  onSetConfidence,
  onDefine,
  onArchive,
  onRestore,
  onLink,
  onUnlink,
  onJump,
}) {
  const [editingMeaning, setEditingMeaning] = useState(false);
  const [draft, setDraft] = useState(entry.meaning);
  const [connecting, setConnecting] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef(null);

  const stale = !entry.archived && entry.confidence <= 2 && daysSince(entry.dateAdded) >= 14;
  const archivable = !entry.archived && entry.confidence === 5 && daysSince(entry.lastReviewed) >= 21;
  const related = (entry.relatedIds || []).map((id) => entriesById[id]).filter(Boolean);

  useEffect(() => {
    function onClickOutside(ev) {
      if (pickerRef.current && !pickerRef.current.contains(ev.target)) setConnecting(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const options = allActive.filter(
    (c) => c.id !== entry.id && !(entry.relatedIds || []).includes(c.id) && c.term.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      id={`entry-${entry.id}`}
      className={"card-enter rounded-xl p-5 border relative " + (highlighted ? "highlight-ring" : "")}
      style={{ background: CARD, borderColor: stale ? STAMP_RED + "55" : RULE }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="fraunces text-xl font-semibold" style={{ color: INK }}>
              {entry.term}
            </h3>
            {entry.context && (
              <span className="mono text-xs" style={{ color: MUTED }}>
                — {entry.context}
              </span>
            )}
            <span
              className="mono text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: (CATEGORY_COLORS[entry.category] || MUTED) + "14",
                color: CATEGORY_COLORS[entry.category] || MUTED,
              }}
            >
              {entry.category || "Other"}
            </span>
          </div>

          {editingMeaning || !entry.meaning ? (
            <div className="mt-2 flex gap-2 items-start">
              <input
                autoFocus={editingMeaning}
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    onDefine(draft.trim());
                    setEditingMeaning(false);
                  }
                }}
                placeholder="Add its plain-English meaning →"
                className="sans text-sm flex-1 bg-transparent outline-none border-b"
                style={{ color: INK, borderColor: RULE }}
              />
              <button
                onClick={() => {
                  onDefine(draft.trim());
                  setEditingMeaning(false);
                }}
                className="mono text-xs px-2 py-1 rounded"
                style={{ color: TEAL }}
              >
                save
              </button>
            </div>
          ) : (
            <p
              className="sans text-sm mt-1.5 cursor-pointer"
              style={{ color: INK }}
              onClick={() => {
                setDraft(entry.meaning);
                setEditingMeaning(true);
              }}
              title="Click to edit"
            >
              {entry.meaning}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="mono text-[10px]" style={{ color: MUTED }}>
              {fmtDate(entry.dateAdded)}
            </span>
            {!entry.archived && (
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    className="dot-btn w-2.5 h-2.5 rounded-full"
                    onClick={() => onSetConfidence(lvl)}
                    style={{ background: lvl <= entry.confidence ? MUSTARD : RULE }}
                    title={`confidence ${lvl}`}
                  />
                ))}
              </div>
            )}
            {stale && (
              <span className="mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: STAMP_RED + "1a", color: STAMP_RED }}>
                ask someone
              </span>
            )}
          </div>

          {/* Connections */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {related.map((r) => (
              <span
                key={r.id}
                className="mono text-xs px-2 py-1 rounded-full flex items-center gap-1 cursor-pointer"
                style={{ background: TEAL + "14", color: TEAL }}
              >
                <span onClick={() => onJump(r.id)} className="flex items-center gap-1">
                  <Link2 size={10} /> {r.term}
                </span>
                {!entry.archived && (
                  <button onClick={() => onUnlink(r.id)}>
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            {!entry.archived && (
              <div ref={pickerRef} className="relative">
                <button
                  onClick={() => setConnecting((v) => !v)}
                  className="mono text-xs px-2 py-1 rounded-full border flex items-center gap-1"
                  style={{ borderColor: RULE, color: MUTED }}
                >
                  <Plus size={10} /> connect
                </button>
                {connecting && (
                  <div
                    className="absolute z-10 mt-1 w-52 rounded-lg border shadow-sm overflow-hidden"
                    style={{ background: CARD, borderColor: RULE }}
                  >
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="search a term…"
                      className="w-full px-3 py-2 mono text-xs bg-transparent outline-none border-b"
                      style={{ color: INK, borderColor: RULE }}
                    />
                    {options.slice(0, 6).map((o) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          onLink(o.id);
                          setQuery("");
                          setConnecting(false);
                        }}
                        className="w-full text-left px-3 py-2 sans text-sm hover:opacity-70"
                        style={{ color: INK }}
                      >
                        {o.term}
                      </button>
                    ))}
                    {options.length === 0 && (
                      <div className="px-3 py-2 sans text-xs" style={{ color: MUTED }}>
                        no matches
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {entry.archived ? (
          <button onClick={onRestore} title="Restore" className="shrink-0">
            <RotateCcw size={16} style={{ color: MUTED }} />
          </button>
        ) : (
          (archivable || entry.confidence === 5) && (
            <button onClick={onArchive} title="Archive" className="shrink-0">
              <Archive size={16} style={{ color: archivable ? TEAL : MUTED }} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

function RoadmapTracker({ entries }) {
  const [checked, setChecked] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(ROADMAP_KEY);
        setChecked(res ? JSON.parse(res.value) : {});
      } catch {
        setChecked({});
      }
    })();
  }, []);

  async function toggle(id) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try {
      await storage.set(ROADMAP_KEY, JSON.stringify(next));
    } catch {
      // best-effort; UI already updated
    }
  }

  const totalItems = ROADMAP.reduce((sum, p) => sum + p.items.length, 0);
  const doneItems = checked ? Object.values(checked).filter(Boolean).length : 0;

  if (checked === null) {
    return (
      <p className="mono text-sm" style={{ color: MUTED }}>
        loading roadmap…
      </p>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="fraunces text-lg font-semibold" style={{ color: INK }}>
            Overall progress
          </span>
          <span className="mono text-xs" style={{ color: MUTED }}>
            {doneItems} / {totalItems}
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: RULE }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${totalItems ? (doneItems / totalItems) * 100 : 0}%`, background: STAMP_RED }}
          />
        </div>
      </div>

      <div className="space-y-5">
        {ROADMAP.map((phase) => {
          const doneInPhase = phase.items.filter((it) => checked[it.id]).length;
          const catCount = entries.filter((e) => (e.category || "Other") === CATEGORY_FOR_PHASE[phase.id]).length;
          return (
            <div key={phase.id} className="rounded-xl border p-5" style={{ background: CARD, borderColor: RULE }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="mono text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: phase.color + "1a", color: phase.color }}
                  >
                    {phase.phase}
                  </span>
                  <span className="fraunces text-lg font-semibold" style={{ color: INK }}>
                    {phase.title}
                  </span>
                </div>
                <span className="mono text-[10px]" style={{ color: MUTED }}>
                  {phase.weeks}
                </span>
              </div>
              <p className="mono text-[10px] mb-3" style={{ color: MUTED }}>
                {doneInPhase}/{phase.items.length} checked · {catCount} term{catCount === 1 ? "" : "s"} logged in this category
              </p>
              <div className="space-y-1.5">
                {phase.items.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5"
                      style={{ accentColor: phase.color }}
                    />
                    <span
                      className="sans text-sm"
                      style={{ color: checked[item.id] ? MUTED : INK, textDecoration: checked[item.id] ? "line-through" : "none" }}
                    >
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ACTIVITIES_KEY = "learning-phrasebook-activities-progress";

function ActivitiesTab() {
  const [state, setState] = useState(null); // { [id]: { focused: bool, mastered: bool } }
  const [roleFilter, setRoleFilter] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(ACTIVITIES_KEY);
        setState(res ? JSON.parse(res.value) : {});
      } catch {
        setState({});
      }
    })();
  }, []);

  async function update(id, patch) {
    const next = { ...state, [id]: { ...(state[id] || { focused: false, mastered: false }), ...patch } };
    setState(next);
    try {
      await storage.set(ACTIVITIES_KEY, JSON.stringify(next));
    } catch {
      // best-effort
    }
  }

  if (state === null) {
    return (
      <p className="mono text-sm" style={{ color: MUTED }}>
        loading activities…
      </p>
    );
  }

  const roles = ["All", "Developer", "System Analyst", "QA"];
  const filtered = ACTIVITIES.filter((a) => roleFilter === "All" || a.role === roleFilter);
  const focused = ACTIVITIES.filter((a) => state[a.id]?.focused && !state[a.id]?.mastered);
  const masteredCount = ACTIVITIES.filter((a) => state[a.id]?.mastered).length;

  return (
    <div>
      <p className="sans text-sm mb-5" style={{ color: MUTED }}>
        Real tasks a Developer, System Analyst, and QA actually do. Star one to make it your current focus, check it off once you've mastered it.
      </p>

      {focused.length > 0 && (
        <div className="rounded-xl border p-4 mb-6" style={{ background: STAMP_RED + "0d", borderColor: STAMP_RED + "40" }}>
          <p className="mono text-[10px] uppercase tracking-wide mb-2" style={{ color: STAMP_RED }}>
            currently focusing on
          </p>
          <div className="space-y-1.5">
            {focused.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <span
                  className="mono text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: ROLE_COLORS[a.role] + "1a", color: ROLE_COLORS[a.role] }}
                >
                  {a.role}
                </span>
                <span className="sans text-sm" style={{ color: INK }}>
                  {a.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className="mono text-[11px] px-2.5 py-1 rounded-full border"
              style={{
                borderColor: roleFilter === r ? (ROLE_COLORS[r] || INK) : RULE,
                background: roleFilter === r ? (ROLE_COLORS[r] || INK) + "1a" : "transparent",
                color: roleFilter === r ? (ROLE_COLORS[r] || INK) : MUTED,
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="mono text-[10px]" style={{ color: MUTED }}>
          {masteredCount}/{ACTIVITIES.length} mastered
        </span>
      </div>

      <div className="space-y-2">
        {filtered.map((a) => {
          const s = state[a.id] || { focused: false, mastered: false };
          return (
            <div
              key={a.id}
              className="rounded-xl border p-3.5 flex items-center gap-3"
              style={{
                background: CARD,
                borderColor: s.mastered ? TEAL + "40" : RULE,
                opacity: s.mastered ? 0.7 : 1,
              }}
            >
              <button
                onClick={() => update(a.id, { mastered: !s.mastered, focused: s.mastered ? s.focused : false })}
                title={s.mastered ? "Mastered" : "Mark as mastered"}
                className="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center"
                style={{ borderColor: s.mastered ? TEAL : RULE, background: s.mastered ? TEAL : "transparent" }}
              >
                {s.mastered && <Check size={12} color={CARD} />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="mono text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: ROLE_COLORS[a.role] + "1a", color: ROLE_COLORS[a.role] }}
                  >
                    {a.role}
                  </span>
                  <span
                    className="sans text-sm"
                    style={{ color: s.mastered ? MUTED : INK, textDecoration: s.mastered ? "line-through" : "none" }}
                  >
                    {a.label}
                  </span>
                </div>
              </div>

              {!s.mastered && (
                <button
                  onClick={() => update(a.id, { focused: !s.focused })}
                  title={s.focused ? "Remove from focus" : "Make this my current focus"}
                  className="shrink-0"
                >
                  <Star size={16} fill={s.focused ? MUSTARD : "none"} color={s.focused ? MUSTARD : RULE} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CATEGORY_FOR_PHASE = {
  p1: "Core Vocab",
  p2: "Team Process",
  p3: "Architecture",
  p4: "Tooling",
};

function QuizMode({ entries, onReview }) {
  const [filterCategory, setFilterCategory] = useState("All");
  const [queue, setQueue] = useState(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState([]);

  const quizzable = entries.filter((e) => e.meaning && (filterCategory === "All" || (e.category || "Other") === filterCategory));

  function start() {
    const shuffled = [...quizzable].sort((a, b) => a.confidence - b.confidence);
    setQueue(shuffled);
    setIndex(0);
    setFlipped(false);
    setResults([]);
  }

  function rate(level) {
    const current = queue[index];
    onReview(current.id, level);
    setResults([...results, level]);
    setFlipped(false);
    setIndex(index + 1);
  }

  if (queue === null) {
    return (
      <div>
        <p className="sans text-sm mb-4" style={{ color: MUTED }}>
          Quizzes pull from terms that already have a meaning filled in. Pick a category or quiz everything, weakest terms first.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-5">
          <button
            onClick={() => setFilterCategory("All")}
            className="mono text-[11px] px-2.5 py-1 rounded-full border"
            style={{
              borderColor: filterCategory === "All" ? INK : RULE,
              background: filterCategory === "All" ? INK : "transparent",
              color: filterCategory === "All" ? CARD : MUTED,
            }}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className="mono text-[11px] px-2.5 py-1 rounded-full border"
              style={{
                borderColor: filterCategory === c ? CATEGORY_COLORS[c] : RULE,
                background: filterCategory === c ? CATEGORY_COLORS[c] + "1a" : "transparent",
                color: filterCategory === c ? CATEGORY_COLORS[c] : MUTED,
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {quizzable.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={28} className="mx-auto mb-3" style={{ color: RULE }} />
            <p className="fraunces text-lg mb-1" style={{ color: INK }}>
              Nothing to quiz yet
            </p>
            <p className="sans text-sm" style={{ color: MUTED }}>
              Add plain-English meanings to some terms first.
            </p>
          </div>
        ) : (
          <button
            onClick={start}
            className="sans text-sm font-medium px-5 py-2.5 rounded-lg text-white"
            style={{ background: INK }}
          >
            Start quiz — {quizzable.length} term{quizzable.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
    );
  }

  if (index >= queue.length) {
    const avg = results.length ? (results.reduce((a, b) => a + b, 0) / results.length).toFixed(1) : 0;
    return (
      <div className="text-center py-16">
        <p className="fraunces text-2xl font-semibold mb-2" style={{ color: INK }}>
          Session complete
        </p>
        <p className="sans text-sm mb-6" style={{ color: MUTED }}>
          Reviewed {results.length} term{results.length === 1 ? "" : "s"} · average confidence {avg}
        </p>
        <button
          onClick={() => setQueue(null)}
          className="sans text-sm font-medium px-5 py-2.5 rounded-lg text-white"
          style={{ background: INK }}
        >
          Back to quiz setup
        </button>
      </div>
    );
  }

  const current = queue[index];

  return (
    <div>
      <p className="mono text-xs mb-4" style={{ color: MUTED }}>
        Card {index + 1} of {queue.length}
      </p>
      <div
        onClick={() => setFlipped(!flipped)}
        className="rounded-xl border p-10 text-center cursor-pointer mb-5"
        style={{ background: CARD, borderColor: RULE, minHeight: 180 }}
      >
        {!flipped ? (
          <>
            <h3 className="fraunces text-3xl font-semibold mb-2" style={{ color: INK }}>
              {current.term}
            </h3>
            {current.context && (
              <p className="mono text-xs" style={{ color: MUTED }}>
                heard in {current.context}
              </p>
            )}
            <p className="sans text-xs mt-6" style={{ color: MUTED }}>
              tap to reveal meaning
            </p>
          </>
        ) : (
          <p className="sans text-lg" style={{ color: INK }}>
            {current.meaning}
          </p>
        )}
      </div>
      {flipped && (
        <div>
          <p className="mono text-[10px] uppercase tracking-wide mb-2 text-center" style={{ color: MUTED }}>
            how well did you know it?
          </p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                onClick={() => rate(lvl)}
                className="w-11 h-11 rounded-full mono text-sm font-medium"
                style={{ background: MUSTARD, opacity: 0.3 + lvl * 0.14, color: INK }}
              >
                {lvl}
              </button>
            ))}
          </div>
          <p className="mono text-[10px] text-center mt-2" style={{ color: MUTED }}>
            1 = still lost · 5 = nailed it
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: both pass. (The `.jsx` file is not type-checked, but `tsc` still validates the rest of the project after the new import path exists in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add app/learning/learning-client.jsx
git commit -m "$(cat <<'EOF'
feat(learning): add Dev Phrasebook client component

Notebook/Roadmap/Activities/Quiz + d3 connection map, localStorage-backed
with learning-phrasebook-* keys.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the route, nav item, and access guard

**Files:**
- Create: `app/learning/page.tsx`
- Modify: `app/app-shell.tsx` (nav sections)
- Modify: `lib/roles.ts` (`canAccessAppPath`)

**Interfaces:**
- Consumes: `LearningClient` default export from Task 2.
- Produces: a reachable, admin-gated `/learning` route.

- [ ] **Step 1: Create the route page**

Create `app/learning/page.tsx`:

```tsx
import LearningClient from "./learning-client";

export default function LearningPage() {
  return <LearningClient />;
}
```

- [ ] **Step 2: Add the "Personal" nav section**

In `app/app-shell.tsx`, find the end of the `navSections` array — the "Admin" section object that ends with:

```tsx
      },
    ],
  },
] as const;
```

Insert a new section object between the Admin section's closing `},` and the `] as const;`, so the array ends like this:

```tsx
      },
    ],
  },
  {
    label: "Personal",
    items: [
      {
        href: "/learning",
        label: "Learning Hub",
        allowedRoles: ["owner", "admin"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22,3H16a3,3,0,0,0-4,1.38A3,3,0,0,0,8,3H2A1,1,0,0,0,1,4V19a1,1,0,0,0,1,1H8a2,2,0,0,1,2,2h4a2,2,0,0,1,2-2h6a1,1,0,0,0,1-1V4A1,1,0,0,0,22,3ZM8,18H3V5H8a1,1,0,0,1,1,1V18.18A3,3,0,0,0,8,18Zm13,0H16a3,3,0,0,0-1,.18V6a1,1,0,0,1,1-1h5Z"/>
          </svg>
        ),
      },
    ],
  },
] as const;
```

- [ ] **Step 3: Add the route guard**

In `lib/roles.ts`, inside `canAccessAppPath`, add a new branch immediately after the existing `/users` block:

```ts
  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return ADMIN_ROLES.includes(normalizedRole);
  }

  if (pathname === "/learning" || pathname.startsWith("/learning/")) {
    return ADMIN_ROLES.includes(normalizedRole);
  }
```

- [ ] **Step 4: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: both pass with no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/learning/page.tsx app/app-shell.tsx lib/roles.ts
git commit -m "$(cat <<'EOF'
feat(learning): add /learning route, Personal nav section, admin guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Build and manual verification

**Files:** none (verification only; commit only if fixes are needed).

- [ ] **Step 1: Production build**

Run:
```bash
npm run build
```
Expected: build completes with no errors; `/learning` appears in the route list.

- [ ] **Step 2: Manual smoke test as an admin**

Run `npm run dev`, log in as an `owner`/`admin` account, then verify:
- A "Personal" section with a "Learning Hub" item appears in the sidebar; clicking it loads the Phrasebook (paper background, Fraunces heading "The Phrasebook", mono labels).
- **Notebook:** add a term → it appears; reload the page (F5) → the term persists.
- **Roadmap:** tick a checkbox → progress bar moves; reload → it stays checked.
- **Activities:** star an item (it shows under "currently focusing on"); mark one mastered; reload → both persist.
- **Quiz:** add a meaning to a term, start a quiz, flip a card, rate it → "Session complete" shows.
- **Connection map:** link two terms in Notebook, click the "map" stat → the d3 graph draws a line between the two nodes; click a node → it jumps back to that entry.
- Browser console shows no errors.

- [ ] **Step 3: Manual access-control test as a non-admin**

Log in as a `member` (or `reviewer`/`team_lead`) account, then verify:
- No "Personal" section / "Learning Hub" item in the sidebar.
- Visiting `/learning` directly redirects to `/dashboard` (blocked by `proxy.ts`).

- [ ] **Step 4: Confirm localStorage keys**

In the admin session, open DevTools → Application → Local Storage. Confirm keys are `learning-phrasebook-entries`, `learning-phrasebook-roadmap-progress`, `learning-phrasebook-activities-progress` (no bare `phrasebook-*` keys).

---

## Self-Review

**Spec coverage:**
- Admin-only tab in new "Personal" section → Task 3 (nav + guard). ✓
- Four sections + connection map preserved → Task 2 (full component). ✓
- localStorage persistence, namespaced keys → Task 2 (`storage` wrapper + `learning-phrasebook-*`). ✓
- Keep paper/notebook look, fonts via `next/font` → Task 1 (fonts) + Task 2 (`var(--font-*)`). ✓
- d3 connection map → Task 1 (install) + Task 2 (GraphView). ✓
- Route guard enforced server-side → Task 3 Step 3 + verified Task 4 Step 3 (proxy.ts already calls `canAccessAppPath`). ✓
- Non-goals (no DB/Convex, no sync, no restyle) → respected; nothing added. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. The two `// best-effort` comments are carried over verbatim from the working source, not placeholders. ✓

**Type/name consistency:** Component default export is `LearningClient` in Task 2 and imported as `LearningClient` in Task 3. Storage keys `STORAGE_KEY` / `ROADMAP_KEY` / `ACTIVITIES_KEY` all use the `learning-phrasebook-*` prefix. `ADMIN_ROLES` used in the guard matches the existing symbol in `lib/roles.ts`. ✓
