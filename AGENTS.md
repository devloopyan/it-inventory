# AGENTS.md — Coding Rules & Learning Guide for it-inventory-system

> Always read this file before doing anything in this project.
> This file exists to help me write clean, safe, beginner-friendly code — and to help me understand what is happening at every step.

---

## About This Project

- **Project name:** it-inventory-system
- **My level:** Complete beginner — explain things simply
- **My goals:**
  - Understand what I am doing, not just copy code
  - Write clean, readable, and maintainable code
  - Follow safe coding practices
  - Avoid messy "vibe coding" (making random changes without understanding them)

---

## Tech Stack

> Fill this in once you know it — for example:
> - Language: JavaScript / TypeScript / Python
> - Framework: Express / Next.js / Django
> - Database: PostgreSQL / MySQL / SQLite
> - Other tools: Prisma / Sequelize / etc.

---

## Rules — Before Changing Any Code

Before touching anything, always do all of these steps in order:

1. **Inspect the repo** — summarize what matters in simple English. What does this project do? What are the main folders and files?
2. **Check git status** — show any uncommitted changes. If there are uncommitted changes, warn me and suggest I commit or stash them first before we continue.
3. **Identify the tech stack** — tell me the language, framework, database, and tools being used, in plain terms.
4. **How to run the app** — tell me the exact commands to run and test the app locally.
5. **Relevant files** — tell me which files are likely involved in my request and explain why each one matters.
6. **Short plan** — break the work into small steps before starting. Show me the plan.
7. **Risk level** — tell me if this change is: `low risk`, `medium risk`, or `high risk` — and explain why.
8. **Warn me about problems** — point out anything that could lead to messy code, unsafe changes, or things I might regret later.
9. **Dependency check** — if this task requires a new package, tell me the package name, what it does, who maintains it, and why we need it. Wait for my approval before installing anything.

> ⛔ Do NOT edit any file until I say **"go"**.

---

## Rules — While Helping Me

- **Explain, don't just do** — I want to understand what is happening and why. Teach me as we go.
- **Avoid jargon** — if you must use a technical term, explain it simply right after.
- **One step at a time** — show one step, then wait for me to confirm before moving to the next.
- **Clean over fast** — always prefer readable and maintainable code over shortcuts.
- **Follow existing patterns** — match the style already used in the project unless there is a good reason not to. If you break the pattern, explain why.
- **Small and focused changes** — do one thing at a time. Do not bundle unrelated changes together.
- **Flag messy ideas** — if my idea would lead to messy or confusing code, say so clearly and suggest a cleaner option instead.

### Safe Coding Rules (Always Follow These)

- ❌ Never hardcode passwords, API keys, or secrets in the code — always use environment variables (like `.env` files)
- ❌ Never use `eval()` — it runs arbitrary code and is dangerous
- ❌ Never build database queries by joining strings — use parameterized queries or an ORM to prevent SQL injection
- ❌ Never skip input validation — always check that user input is what you expect before using it
- ❌ Never install a new package without telling me first, explaining what it does, and waiting for my approval
- ❌ Never add code that makes external network requests without explaining where the data is being sent and why
- ❌ Never disable or bypass security rules such as ESLint rules or TypeScript strict checks
- ❌ Never add tracking scripts, analytics, or third-party embeds without asking me first
- ✅ Always handle errors — never leave a function that can fail without a `try/catch` or error handler
- ✅ Always use the least amount of access needed — don't give a function more power than it needs
- ✅ Keep dependencies minimal — only add a new package if there is no simple way to do it with what is already installed
- ✅ If you see anything in the existing code that looks suspicious, unsafe, or out of place, point it out immediately even if I did not ask

---

## Rules — After Making Changes

After any change is made, always do all of these:

1. **Plain English summary** — what changed and why, in simple terms
2. **File list** — list every file that changed and explain what each one does
3. **How to test** — give me exact step-by-step instructions to verify the change works
4. **Commands to run** — tell me if I need to run lint, build, tests, or other checks, with the exact commands
5. **Security check** — flag any security concerns in the new code, even small or minor ones
6. **Risks and edge cases** — what could go wrong? Are there any follow-up things to clean up?
7. **Did the code stay clean?** — tell me honestly whether the change followed existing patterns and stayed readable
8. **How to undo** — give me the exact git command to reverse this change if something goes wrong
9. **Next step** — suggest the next best thing to do after this

---

## Git Hygiene

- Always check git status before starting work
- Suggest making a commit before any medium or high risk change
- Keep commits small and descriptive — one change per commit
- Use clear commit messages like: `add: inventory search filter` or `fix: login error on empty password`

---

## Deployment & Staging Workflow

**`main` = production.** Do NOT commit straight to `main`. Every change goes through this loop:

1. **Branch** off main — `git checkout -b feat/<short-name>`.
2. **Build & test on the Convex DEV deployment** — run `npx convex dev` (a separate sandbox database, safe to break) and `npm run dev`. Try the change with throwaway data first.
3. **Open a Pull Request** into `main` on GitHub. Vercel auto-builds a **Preview URL** for the branch — open it to see the change on a staging site before merging.
4. **Merge to `main` only when it works.** That triggers the production deploy.

### ⚠️ Convex must deploy together with the frontend

Vercel's default build (`next build`) does NOT push the Convex backend (schema + functions) to production. If only the frontend deploys, prod breaks — new code calls functions/fields that aren't on the prod backend yet.

**Fix once:** set the Vercel **Build Command** to:

```
npx convex deploy --cmd 'npm run build'
```

and add the production **`CONVEX_DEPLOY_KEY`** env var in Vercel. Then every prod deploy pushes backend + frontend together (and preview branches can use Convex preview deployments).

Until that's configured, run `npx convex deploy` manually after merging any schema or function change.

---

## Learning Notes

> This section is for me to write down things I learn as I go.
> Add notes here as I understand new concepts.

- **Environment variables** — variables stored outside the code (in a `.env` file) so secrets like passwords never end up in the code
- **Git status** — shows which files have been changed since the last commit
- **SQL injection** — a type of attack where someone puts code into a form field to manipulate your database. Parameterized queries prevent this.
- **Linting** — a tool that checks your code for common mistakes and style issues before you run it
- **Dependencies / packages** — external code libraries your project uses. Each one is a potential security risk if it is unmaintained, unknown, or malicious. Always know what you are installing and why.
- **npm install** — the command that installs a new package. Never let this run without knowing what package is being added and why.

---

## Quick Reference — Common Git Commands

```bash
# See what has changed
git status

# Save current changes temporarily (without committing)
git stash

# Undo the last commit but keep the changes
git reset --soft HEAD~1

# Undo a file back to the last commit
git checkout -- filename.js

# See the history of commits
git log --oneline
```

---

*This file was created to help me learn and code safely. Update it as the project grows.*
