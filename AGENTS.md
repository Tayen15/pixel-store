# Multi-Agent Operating Model & Boundaries (AGENTS.md)

## 1. Overview & Principles

Pixel Store uses a specialized multi-agent architecture to maintain high code velocity, strict security, and zero architectural drift. Each agent operates strictly within its designated **File Domain** and adheres to the **Google Anti-Gravity Global Rules**.

---

## 2. Agent Domain Matrix

| Agent Role | Assigned File Domains | Core Responsibilities | Prohibited Actions |
| :--- | :--- | :--- | :--- |
| **Architect / Lead** | `docs/`, `package.json`, `tsconfig.json`, `astro.config.mjs`, Root configs | Overall system design, PRD, Tech Spec, DB schema migrations, dependency governance | Modifying UI components or direct business logic |
| **Backend Agent** | `src/actions/`, `src/pages/api/`, `src/db/`, `src/lib/` | Astro Actions, InsightXPro API client, Payment Gateway adapter, FX calculation engine, Zod schemas, SQLite/Drizzle queries | Editing JSX/TSX presentational components, touching CSS files |
| **Frontend Agent** | `src/pages/**/*.astro`, `src/components/`, `src/styles/` | UI/UX implementation, Astro layout/components, Clean Minimalist theme styling, interactive islands, responsive layouts, micro-interactions | Directly calling external APIs, bypassing Astro Actions, handling raw payment secrets |
| **Testing & QA Agent** | `tests/`, `vitest.config.ts`, e2e scripts | Unit tests for FX engine, Mock supplier API tests, payment webhook signature validation tests, checkout flow e2e | Changing production business logic without failing test proof |
| **Docs & Knowledge Agent**| `docs/`, `README.md`, `docs/changelog/` | Documentation synchronization, changelog maintenance, API contract guides | Writing executable application logic |

---

## 3. Strict Operating Rules for All Agents

### 3.1 Pre-Coding Context Loading (Mandatory Checklist)
Before modifying or creating any file, every agent MUST inspect:
1. `docs/architect.md` — Architectural patterns & security rules
2. `docs/tech-spec.md` — Database schemas, API types, action signatures
3. `docs/prd.md` — Product requirements & business constraints
4. `docs/changelog/pending.md` — Most recent changes
5. Current task scope in TaskMaster

### 3.2 Communication & Mutation Protocol
1. **Server Actions First**: All data mutations (checkout, admin updates, order polling) MUST go through Next.js Server Actions returning `ActionResponse<T>`.
2. **Route Handlers Strictly for Webhooks**: The `app/api/` route tree is reserved exclusively for payment gateway and external webhook receivers.
3. **No Barrels**: Never create or import through barrel `index.ts` files. Import components and utilities directly from their leaf paths.
4. **Zod Validation Required**: All incoming inputs to Server Actions and Route Handlers MUST be parsed and validated with Zod schemas stored in `lib/schemas/`.

---

## 4. Scope Creep & Cross-Boundary Protocol

If an agent while working on its domain identifies work required in another agent's domain:
1. **DO NOT** modify the file outside your assigned domain.
2. Log the requirement in `docs/changelog/pending.md`.
3. If using TaskMaster, register a subtask using `add_subtask --parent=[id] --title="[work]"`.
4. Delegate execution to the respective agent role.

---

## 5. Standard Status Indicators & Logging

Agents must annotate complex or pending sections using standardized status indicators:
- `// TODO: Standard task`
- `// FIXME: Bug needing attention`
- `// HACK: Temporary workaround with explanation`
- `// @owner: Requires product owner decision`
- `// TASK-[ID]: Reference to TaskMaster tracking ID`

Every change made by an agent must append an entry to `docs/changelog/pending.md` in the format:
```
[HH:MM] - [FILE] - [CHANGE] - [WHY]
```
