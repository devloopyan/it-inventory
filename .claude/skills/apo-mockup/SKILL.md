---
name: apo-mockup
description: Use when the user wants HTML mockups for a feature in the IT Inventory System — generates a single self-contained HTML file with ≥3 layout-distinct variants in sticky tabs, styled with the live APO Linear-style design tokens from app/globals.css. Triggers on phrases like "mockup", "mock up", "design options", "variants for the X page", "show me what X could look like".
---

# APO Mockup

Generate a single self-contained HTML file with 3+ visually distinct design variants for a feature, styled with the current APO (Linear-inspired) design tokens of this repo. Output goes to `docs/designs/`.

## When to use

Triggers:
- "mockup …", "mock up …", "mockups for …"
- "design options for …", "variants for …"
- "show me what X could look like"
- "explore a few directions for …"

Don't use for:
- Production component code (edit the Next.js app + `app/globals.css` directly).
- Single-design previews where there's nothing to choose between — if there's only one direction, just describe it.

## Checklist

Create a TodoWrite item per step and tick them off as you go.

1. **Probe the feature with 2–3 targeted questions** (single AskUserQuestion call, batched):
   - Who is the primary user (Owner, Admin, Reviewer, Team Lead, Member) and what is the *one* thing they need to do here?
   - What data / content must be visible at first glance?
   - What's the surrounding context — full page, modal, side panel, embedded dashboard section?
2. **Read live design tokens** from `app/globals.css` — the `:root { … }` block (the APO violet system: `--color-primary-700: #5e5ce6`, the ink ramp `--ink-900..100`, `--color-canvas`, `--color-border-strong`, `--radius-control`, etc.). Use the snapshot in this skill only as a fallback if the file is unreadable.
3. **Skim existing mockups for convention + naming.** Glance at `docs/designs/` to mirror filename style and avoid duplicating a recent topic.
4. **Sketch the three approaches in chat — one sentence each — and confirm before writing HTML.** The variants must differ in layout / information architecture, not styling. If two sketches feel like the same idea reworded, replace one.
5. **Write the HTML** to `docs/designs/YYYY-MM-DD-<topic>-mockups.html` using `scaffold.html` in this skill directory. Inject the live tokens into `:root`, fill in three (or more) `.design-panel`s, and update the top bar + tab labels.
6. **Self-check** (see below). Fix anything that fails before reporting done.
7. **Report the path.** Offer the open command (`start docs/designs/…` on Windows) — the user runs it themselves.

## HTML scaffold rules

Every generated file must:

- Be a single `.html` file. No external CSS, no external JS, no CDNs, no frameworks, no build step.
- Open `<style>` with a `:root { … }` block that **mirrors the actual tokens read in step 2**. Required: `--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--border`, `--muted`, `--muted-foreground`, `--accent-soft`, `--accent-ink`, `--ring`, `--radius`, the ink ramp (`--ink-900..100`), and the feedback set (`--ok`, `--warn`, `--destructive`) if you render statuses.
- Top bar shows: project (`it-inventory-system`), feature name, generation date.
- Sticky design tabs immediately below the top bar. Tabs are `<button role="tab">`, panels are `role="tabpanel"`, active state on click and on ←/→ arrow keys, focus ring uses `--ring`.
- Each `.design-panel` opens with a **rationale card**: variant name (≤4 words), one-sentence positioning, one-sentence tradeoff, what it optimizes for.
- Variants differ in **layout / information architecture**. Example axes to pick from:
  - dense-table-first vs card-grid vs timeline
  - KPI-led vs action-led vs progress-led
  - single-column scroll vs split-pane vs full-bleed dashboard
  - master-detail vs stacked sections vs tabbed sub-views
- Sample data is realistic and drawn from this app's domain. Never `Lorem ipsum`, never "John Doe". Use plausible IT-inventory content: asset tags (e.g. `IT-LAP-0142`), hardware/digital inventory, travel orders and approval chains (Team Leader → Reviewer → Fleet Admin), equipment borrowing, conference-room bookings, teams (IT, HR/Admin, OSMD, CMRT, EEDT), monitoring tickets and internet-outage logs.
- Typography: `system-ui, -apple-system, "Segoe UI", sans-serif` for body (the app uses Inter via next/font, which isn't loadable in a static file — rely on the system fallback, do not fetch Google Fonts); `ui-monospace, "SF Mono", Menlo, monospace` for data/meta.
- All buttons, chips, inputs styled via token vars only — no raw hex in variant markup. Allowed exception: data-viz colors via `--chart-1` through `--chart-5`.
- Minimum 3 variants. Allow 4 if the feature naturally has more directions. Never fewer than 3.

## Token snapshot (fallback only — read app/globals.css first)

```
--background / --color-canvas:     #fafafa
--foreground / --color-text-primary: #1c1c22
--card / --color-surface-base:     #ffffff
--primary / --color-primary-700:   #5e5ce6   /* violet — the only saturated accent */
--primary-foreground:              #ffffff
--accent-ink / --color-primary-600: #4b49c2  /* hover/active */
--muted / --color-surface-subtle:  #f4f4f5
--muted-foreground / --text-secondary: #6b6b74
--accent / --color-surface-elevated: #ececef
--accent-soft:                     rgba(94, 92, 230, 0.12)
--border / --color-border-strong:  rgba(11, 11, 15, 0.08)
--border-subtle:                   rgba(11, 11, 15, 0.04)
--ui-border / --ink-200:           #dcdce0
--ring / --color-focus-ring:       #5e5ce6
--radius-control:                  7px
ink ramp --ink-900..100: #0b0b0f, #1c1c22, #2e2e36, #6b6b74, #8a8a93, #b5b5bc, #dcdce0, #ebebee
--ok #1f9d55 / --warn #b8860b / --destructive #c23d3d / --info #225c86
font-sans: system-ui, -apple-system, "Segoe UI", sans-serif
```

## Self-check (before reporting done)

Walk through each item and call out the results in your final message:

- [ ] File opens in a browser with no JS errors (the `<script>` block parses; tabs and arrow-key handlers wired up).
- [ ] Tabs switch panels on click. Active state visible. Arrow keys (←/→) move focus and switch panels.
- [ ] ≥3 panels present.
- [ ] Each panel has a rationale card (name + positioning + tradeoff + optimizes-for).
- [ ] No hex colors in panel markup outside the `:root` block. Exception: `--chart-1..5`.
- [ ] Variants are visibly different layouts. If two read as "the same thing with different spacing", replace one.
- [ ] Tokens in `:root` match the values currently in `app/globals.css` (not stale).
- [ ] Sample data is plausible IT-inventory content (assets, travel orders, equipment borrowing, conference rooms, teams). No Lorem ipsum, no John Doe.
- [ ] Filename follows `docs/designs/YYYY-MM-DD-<topic>-mockups.html`.

## Anti-patterns

Do **not**:

- Add CDN links (Google Fonts, Chart.js, FontAwesome). The file must work fully offline.
- Use React, Vue, Alpine, or any framework. Vanilla HTML + CSS + ~10 lines of JS only.
- Include a dark-mode toggle — the app's default surface is the light theme.
- Default to a generic shadcn / SaaS look (gray-on-white cards, purple gradients, floating orbs). This is paper-white (`#fafafa`/`#ffffff`) with a single Linear-style violet accent (`#5e5ce6`) and hairline borders.
- Use illustrations, stock-photo placeholders, or emoji-heavy copy.
- Produce three "variants" that are the same layout in three colors — the point is genuine layout alternatives.
- Generate code without first sketching the three directions in chat.

## Files in this skill

- `SKILL.md` — this file.
- `scaffold.html` — the working HTML template. Copy it, fill the `:root` tokens and three panels, and write to `docs/designs/`.
