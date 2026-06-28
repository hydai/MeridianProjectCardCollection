# shadcn/ui Refactor — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED at execution time:** Invoke the `shadcn` skill before Task 3 to confirm the *current* shadcn CLI command, package names, and Tailwind-v4 component conventions. shadcn evolves; the skill is the authoritative source for exact commands/versions. This plan pins the approach and the wiring; the skill pins the CLI specifics.

**Goal:** Install Tailwind v4 + shadcn/ui and bridge the existing dark-gold editorial design tokens into shadcn's semantic theme, with **no visible UI change** — laying the foundation for the per-view migration in later phases.

**Architecture:** Add Tailwind v4 via `@tailwindcss/vite`. Keep the 1,900 lines of legacy CSS intact and coexisting. Resolve the one token-name collision (`--accent`) by renaming legacy gold `--accent`→`--primary`. Expose brand tokens to Tailwind via `@theme inline` that aliases the legacy `:root` variables (single source of truth, no value duplication). Add `cn()`, `components.json`, and the first two themed primitives (Button, Card) as proof.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`, shadcn/ui (new-york style), class-variance-authority, clsx, tailwind-merge, lucide-react, Vite 6, Vitest 4, React 18, Biome.

## Global Constraints

- **Tailwind v4** with `@tailwindcss/vite` (CSS-first config). No `tailwind.config.js` unless a task requires it.
- **Dark-only.** Brand palette lives in `:root`; do not add a `.dark` block or a theme switcher.
- **shadcn base style = `new-york`.**
- **Path alias:** `@/*` → `src/client/*` (must resolve in TS, Vite build, and Vitest).
- **Preserve brand:** serif fonts (Noto Serif TC / Cormorant Garamond), `--rarity-r/sr/ssr/ur`, radial-gradient body background, `rise` animation — values unchanged.
- **Do NOT touch:** `src/client/collection.ts`, `src/client/api.ts`, `src/shared/**`, `src/worker/**`, `migrations/**`, `seed/**`.
- **No visual change in Phase 0.** Legacy CSS still drives every page. shadcn primitives are added but not yet wired into live pages.
- **Per commit:** run `npm run lint` (Biome), `npm run typecheck`, `npm test` (worker + client), `npm run build` — all green. Then `lineguard <changed files>`.
- **Commits:** Conventional Commits; end every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (repo convention).
- **Note on TDD:** Foundation/config tasks are gated by build/typecheck/existing-tests + a manual visual smoke check (CSS theming cannot be meaningfully asserted in jsdom). Tasks that add real logic (`cn()`) or components (Button/Card) get real Vitest tests.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `package.json` | dependencies | Modify (add deps) |
| `vite.config.ts` | Vite plugins + `@` alias | Modify |
| `vitest.client.config.ts` | client test plugins + `@` alias | Modify |
| `tsconfig.json` | TS `@` path mapping | Modify |
| `src/client/index.css` | Tailwind import + token bridge + legacy CSS | Modify |
| `src/client/admin/admin.css` | legacy admin CSS (rename `--accent` only) | Modify |
| `src/client/lib/utils.ts` | `cn()` helper | Create |
| `components.json` | shadcn config | Create |
| `src/client/components/ui/button.tsx` | Button primitive | Create (via shadcn CLI) |
| `src/client/components/ui/card.tsx` | Card primitive | Create (via shadcn CLI) |
| `test/client/lib/utils.test.ts` | `cn()` tests | Create |
| `test/client/components/ui.test.tsx` | Button/Card render tests | Create |
| `biome.json` | lint/format config | Modify (only if shadcn UI trips lint) |

---

## Task 1: Install Tailwind v4 and wire into Vite + Vitest

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vite.config.ts`
- Modify: `vitest.client.config.ts`
- Modify: `src/client/index.css:1` (prepend Tailwind import)

**Interfaces:**
- Produces: Tailwind utility classes compile in `vite build` and `vite dev`. The `@tailwindcss/vite` plugin is registered. No new exports.

- [ ] **Step 1: Install Tailwind v4 + Vite plugin**

Run:
```bash
npm install -D tailwindcss @tailwindcss/vite
```
Expected: `package.json` devDependencies gains `tailwindcss` (^4) and `@tailwindcss/vite` (^4); install exits 0.

- [ ] **Step 2: Register the Tailwind plugin in Vite**

Modify `vite.config.ts` to:
```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist" },
});
```

- [ ] **Step 3: Register the Tailwind plugin in the client Vitest config**

Modify `vitest.client.config.ts` to:
```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ["test/client/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/client/setup.ts"],
  },
});
```

- [ ] **Step 4: Import Tailwind at the top of `index.css`**

Edit `src/client/index.css` — insert as the very first line, above the existing `/* Design system ported... */` comment:
```css
@import "tailwindcss";

/* Design system ported from the meridian-cards artifact. */
```
Leave the rest of the file unchanged.

- [ ] **Step 5: Verify the build compiles Tailwind**

Run:
```bash
npm run build
```
Expected: build succeeds, exits 0, emits `dist/`. (Tailwind now scans the client and injects its layers.)

- [ ] **Step 6: Verify existing tests still pass**

Run:
```bash
npm test
```
Expected: all worker + client tests PASS (no behavior changed).

- [ ] **Step 7: Visual smoke check (preflight regression)**

Run `npm run dev`, open `/` and `/admin`. Confirm hero, tabs, tables, buttons, and rarity colors look **identical** to before.
- If preflight reset caused a visible shift (e.g., heading sizes/button backgrounds), switch the import in `index.css` to exclude preflight:
  ```css
  @layer theme, base, components, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
  ```
  (omits `tailwindcss/preflight`, so legacy `* { margin:0; padding:0 }` reset stays authoritative). Re-run Step 5–6 and re-check.

- [ ] **Step 8: Commit**

```bash
lineguard vite.config.ts vitest.client.config.ts src/client/index.css
git add package.json package-lock.json vite.config.ts vitest.client.config.ts src/client/index.css
git commit -m "$(cat <<'EOF'
build: add Tailwind v4 via @tailwindcss/vite (coexists with legacy CSS)

Register @tailwindcss/vite in vite + client vitest configs and @import
"tailwindcss" at the top of index.css. Legacy CSS still drives the UI; no
visual change. Foundation for the shadcn migration.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `@/*` path alias (TS + Vite + Vitest)

**Files:**
- Modify: `tsconfig.json` (`compilerOptions.baseUrl` + `paths`)
- Modify: `vite.config.ts` (`resolve.alias`)
- Modify: `vitest.client.config.ts` (`resolve.alias`)
- Test: `test/client/lib/alias.test.ts` (temporary resolve probe — deleted in Step 6)

**Interfaces:**
- Produces: `import x from "@/..."` resolves to `src/client/...` in typecheck, build, and tests. Consumed by every shadcn component/import in later tasks (e.g. `@/lib/utils`, `@/components/ui/button`).

- [ ] **Step 1: Add the TS path mapping**

Modify `tsconfig.json` `compilerOptions` — add `baseUrl` and `paths` (keep all existing keys):
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noUnusedLocals": false,
    "baseUrl": ".",
    "paths": { "@/*": ["src/client/*"] }
  },
  "include": ["src/client", "src/shared", "test/client"]
}
```

- [ ] **Step 2: Add the Vite alias**

Modify `vite.config.ts`:
```ts
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(__dirname, "src/client") } },
  build: { outDir: "dist" },
});
```

- [ ] **Step 3: Add the Vitest alias**

Modify `vitest.client.config.ts`:
```ts
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(__dirname, "src/client") } },
  test: {
    include: ["test/client/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/client/setup.ts"],
  },
});
```

- [ ] **Step 4: Write a temporary resolve probe test**

Create `test/client/lib/alias.test.ts`:
```ts
import { describe, expect, it } from "vitest";
// Resolves only if the "@" alias maps to src/client.
import { RARITIES } from "@/collection";

describe("@ alias", () => {
  it("resolves @/ to src/client", () => {
    expect(RARITIES).toContain("R");
  });
});
```

- [ ] **Step 5: Run the probe + typecheck**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/lib/alias.test.ts && npm run typecheck
```
Expected: the alias test PASSES and `typecheck` exits 0 (all three tsconfigs clean).

- [ ] **Step 6: Delete the probe and re-verify**

```bash
rm test/client/lib/alias.test.ts
npm test
```
Expected: full suite PASS without the probe. (The probe proved resolution; real `@/` imports arrive in Task 3.)

- [ ] **Step 7: Commit**

```bash
lineguard tsconfig.json vite.config.ts vitest.client.config.ts
git add tsconfig.json vite.config.ts vitest.client.config.ts
git commit -m "$(cat <<'EOF'
build: add @/* path alias to src/client (TS, Vite, Vitest)

Wire the alias in all three resolvers so shadcn-style "@/..." imports resolve
consistently in typecheck, build, and client tests.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: shadcn dependencies, `cn()` helper, and `components.json`

**Files:**
- Modify: `package.json` (deps: class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css)
- Create: `src/client/lib/utils.ts`
- Create: `components.json`
- Test: `test/client/lib/utils.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` exported from `@/lib/utils` — merges class names and resolves Tailwind conflicts (last wins). Consumed by every shadcn component.

> **Invoke the `shadcn` skill now** to confirm the current package set and whether `npx shadcn@latest init` should generate `components.json` for you. The steps below are the manual equivalent; prefer the skill/CLI output if it differs, then keep `cn()` and the config aligned to the values below.

- [ ] **Step 1: Install shadcn runtime deps**

Run:
```bash
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install -D tw-animate-css
```
Expected: install exits 0; `package.json` updated.

- [ ] **Step 2: Write the failing `cn()` test**

Create `test/client/lib/utils.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("lets the last conflicting Tailwind class win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("merges conditional objects", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/lib/utils.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/utils'`.

- [ ] **Step 4: Implement `cn()`**

Create `src/client/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run it to verify it passes**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/lib/utils.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 6: Create `components.json`**

Create `components.json` at the repo root:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/client/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 7: Typecheck + full test**

Run:
```bash
npm run typecheck && npm test
```
Expected: typecheck exits 0; all tests PASS.

- [ ] **Step 8: Commit**

```bash
lineguard src/client/lib/utils.ts test/client/lib/utils.test.ts components.json
git add package.json package-lock.json src/client/lib/utils.ts test/client/lib/utils.test.ts components.json
git commit -m "$(cat <<'EOF'
feat: add cn() helper and shadcn components.json (new-york, @ aliases)

Install class-variance-authority/clsx/tailwind-merge/lucide-react, add the
cn() class merger with tests, and configure shadcn to emit into
@/components/ui with index.css as the theme target.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Token-bridge theme (resolve `--accent` collision + expose brand tokens)

**Files:**
- Modify: `src/client/index.css` (rename `--accent`→`--primary`; add shadcn token bridge)
- Modify: `src/client/admin/admin.css` (rename `--accent`→`--primary` only)

**Interfaces:**
- Produces: Tailwind utilities `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`, `ring-ring`, `bg-rarity-r|sr|ssr|ur`, and `font-sans|serif|accent|mono` — all resolving to the existing brand values. Consumed by shadcn components (Task 5) and every later-phase view.

> **Collision background:** legacy `--accent` (gold) and shadcn's `--accent` (muted hover bg) share a name but differ in meaning. Legacy gold is semantically shadcn's `--primary`, so rename legacy `--accent`→`--primary` first; the name then frees up for shadcn, and legacy/shadcn `--primary` unify. `--border` is shared but identical in value, so it is left as one token.

- [ ] **Step 1: Rename `--accent-dim`→`--primary-dim` in `index.css` (do this BEFORE `--accent`)**

In `src/client/index.css`, replace **all** `--accent-dim` with `--primary-dim`.
(Order matters: `--accent-dim` contains the substring `--accent`; renaming it first prevents the next step from mangling it.)
Expected: 2 occurrences updated (1 definition in `:root`, 1 `var(--accent-dim)` use).

- [ ] **Step 2: Rename `--accent`→`--primary` in `index.css`**

In `src/client/index.css`, replace **all** remaining `--accent` with `--primary`.
Expected: 16 occurrences updated (1 `:root` definition `--accent: #c9a14a` → `--primary: #c9a14a`, plus 15 `var(--accent)` uses).
Verify none remain:
```bash
grep -c -- "--accent" src/client/index.css
```
Expected: `0`.

- [ ] **Step 3: Rename `--accent-dim`→`--primary-dim`, then `--accent`→`--primary` in `admin.css`**

In `src/client/admin/admin.css`, replace **all** `--accent-dim`→`--primary-dim` first, then **all** `--accent`→`--primary`.
Expected: 13 `--accent` occurrences updated (12 `var(--accent)` + 1 `var(--accent-dim)`).
Verify:
```bash
grep -c -- "--accent" src/client/admin/admin.css
```
Expected: `0`.

- [ ] **Step 4: Insert the shadcn token bridge into `index.css`**

In `src/client/index.css`, immediately **after** the existing legacy `:root { ... }` block (the one that now defines `--primary: #c9a14a`, `--bg`, `--text`, `--surface`, `--border`, `--r-color`…), insert:

```css
/* ---- shadcn token bridge (Phase 0) ---- */
/* Semantic tokens alias the legacy brand tokens above — single source of
   truth, no value duplication. Dark-only: defined on :root, no .dark. */
@custom-variant dark (&:is(.dark *));

:root {
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--surface);
  --card-foreground: var(--text);
  --popover: var(--surface-elevated);
  --popover-foreground: var(--text);
  /* --primary is already defined above (legacy gold, renamed). */
  --primary-foreground: var(--bg);
  --secondary: var(--surface-elevated);
  --secondary-foreground: var(--text);
  --muted: var(--bg-subtle);
  --muted-foreground: var(--text-secondary);
  --accent: var(--surface-elevated);
  --accent-foreground: var(--text);
  --destructive: var(--ur-color);
  --destructive-foreground: var(--text);
  /* --border is already defined above (#2a2520) and is shared as-is. */
  --input: var(--border);
  --ring: var(--primary);
  --radius: 0.5rem;

  /* brand extensions exposed under shadcn-friendly names */
  --rarity-r: var(--r-color);
  --rarity-sr: var(--sr-color);
  --rarity-ssr: var(--ssr-color);
  --rarity-ur: var(--ur-color);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-rarity-r: var(--rarity-r);
  --color-rarity-sr: var(--rarity-sr);
  --color-rarity-ssr: var(--rarity-ssr);
  --color-rarity-ur: var(--rarity-ur);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  --font-sans: "IBM Plex Sans TC", "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-serif: "Noto Serif TC", serif;
  --font-accent: "Cormorant Garamond", serif;
  --font-mono: "JetBrains Mono", monospace;
}
/* ---- end shadcn token bridge ---- */
```

- [ ] **Step 5: Build + full test**

Run:
```bash
npm run build && npm test
```
Expected: build exits 0; all tests PASS. (Renaming a custom property + all its uses is value-preserving.)

- [ ] **Step 6: Visual smoke check (theme parity)**

Run `npm run dev`; on `/` and `/admin` confirm the gold accents, borders, hero, tabs, tables, and rarity colors are **unchanged**. The gold must still appear everywhere it did before (proves the `--accent`→`--primary` rename caught every reference).

- [ ] **Step 7: Commit**

```bash
lineguard src/client/index.css src/client/admin/admin.css
git add src/client/index.css src/client/admin/admin.css
git commit -m "$(cat <<'EOF'
feat: bridge brand tokens to shadcn semantic theme (dark-only)

Rename legacy gold --accent/--accent-dim to --primary/--primary-dim to free
the name for shadcn, then add a :root semantic layer + @theme inline that
aliases the existing brand tokens (background/foreground/card/primary/muted/
border/ring, rarity-*, fonts). Value-preserving; no visual change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add themed Button + Card primitives and the Phase 0 acceptance gate

**Files:**
- Create: `src/client/components/ui/button.tsx` (via shadcn CLI)
- Create: `src/client/components/ui/card.tsx` (via shadcn CLI)
- Create: `test/client/components/ui.test.tsx`
- Modify: `biome.json` (only if Step 4 lint fails on generated UI)

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; theme tokens from Task 4.
- Produces: `Button` (variants `default | secondary | ghost | outline | destructive | link`, sizes `default | sm | lg | icon`) and `Card` family — both styled from the bridged tokens. Consumed by all later-phase views.

> **Invoke the `shadcn` skill** to run the current add command. The canonical way to create these is the CLI, not hand-authoring.

- [ ] **Step 1: Generate Button + Card via the shadcn CLI**

Run:
```bash
npx shadcn@latest add button card
```
Expected: creates `src/client/components/ui/button.tsx` and `src/client/components/ui/card.tsx` importing `@/lib/utils`. If the CLI prompts to overwrite `index.css`, **decline** (the theme is already bridged in Task 4).

- [ ] **Step 2: Write Button/Card render tests**

Create `test/client/components/ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

describe("Button", () => {
  it("renders as a button with its label", () => {
    render(<Button>新增</Button>);
    expect(screen.getByRole("button", { name: "新增" })).toBeInTheDocument();
  });
  it("applies the primary (default) background utility", () => {
    render(<Button>金</Button>);
    expect(screen.getByRole("button", { name: "金" }).className).toContain("bg-primary");
  });
  it("applies the ghost variant", () => {
    render(<Button variant="ghost">幽靈</Button>);
    const cls = screen.getByRole("button", { name: "幽靈" }).className;
    expect(cls).not.toContain("bg-primary");
  });
});

describe("Card", () => {
  it("renders title and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>面板</CardTitle>
        </CardHeader>
        <CardContent>內容</CardContent>
      </Card>,
    );
    expect(screen.getByText("面板")).toBeInTheDocument();
    expect(screen.getByText("內容")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the component tests**

Run:
```bash
npx vitest run --config vitest.client.config.ts test/client/components/ui.test.tsx
```
Expected: all tests PASS. (If the generated Button uses `data-slot`/variant class names that differ, align the assertions to the generated `bg-primary` utility — it is part of the `new-york` default variant.)

- [ ] **Step 4: Lint the generated components**

Run:
```bash
npm run lint
```
Expected: PASS. If Biome flags the generated UI (e.g. `noExplicitAny`, import style), add an override to `biome.json` rather than editing generated files — insert at the top level:
```json
"overrides": [
  { "includes": ["src/client/components/ui/**"], "linter": { "rules": { "recommended": false } } }
]
```
Then re-run `npm run lint` (expected PASS).

- [ ] **Step 5: Full Phase 0 acceptance gate**

Run, in order:
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
Expected: every command exits 0. Then a final visual smoke check: `/` and `/admin` are visually unchanged vs. pre-Phase-0.

Phase 0 acceptance checklist:
- [ ] Tailwind v4 compiles in build + dev.
- [ ] `@/` resolves in TS, Vite, Vitest.
- [ ] `cn()` tested and green.
- [ ] `components.json` present; shadcn CLI emits into `@/components/ui`.
- [ ] Brand tokens exposed as Tailwind utilities (`bg-primary`, `bg-rarity-ur`, `font-serif`, …).
- [ ] `grep -- "--accent"` returns 0 in both CSS files.
- [ ] Button + Card render themed; tests pass.
- [ ] No visual change to `/` or `/admin`.

- [ ] **Step 6: Commit**

```bash
lineguard src/client/components/ui/button.tsx src/client/components/ui/card.tsx test/client/components/ui.test.tsx biome.json
git add src/client/components/ui/button.tsx src/client/components/ui/card.tsx test/client/components/ui.test.tsx biome.json package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: add themed Button and Card shadcn primitives (new-york)

First shadcn primitives, generated into @/components/ui and themed from the
bridged brand tokens. Render tests cover variants/structure. Not yet wired
into live pages — Phase 0 foundation is complete.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage (Phase 0 scope of `2026-06-28-shadcn-ui-refactor-design.md` §5.1, §5.2, §5.4 Phase 0):**
- Tailwind v4 + `@tailwindcss/vite` → Task 1. ✓
- `@/*` path alias (tsconfig + vite) → Task 2 (also Vitest, required for tests). ✓
- shadcn `components.json` + `cn()` + deps → Task 3. ✓
- Token bridge (`:root` rename + `@theme inline`, dark-only, rarity + fonts) → Task 4. ✓
- `--accent` collision (identified during planning) → Task 4 Steps 1–3. ✓
- Base primitives (Button, Card) → Task 5. ✓
- "No visual change in Phase 0" → smoke checks in Tasks 1, 4, 5. ✓
- Biome may reformat/flag UI → Task 5 Step 4. ✓
- Phases 1–5 (shell, public views, specialized views, admin, cleanup) → **out of scope here**; each gets its own just-in-time plan once primitives/APIs are concrete.

**2. Placeholder scan:** No TBD/TODO. shadcn component bodies are produced by the CLI (the canonical, exact method) rather than pasted, with the `shadcn` skill cited for current specifics — this is a concrete instruction, not a placeholder. Every config edit shows full file content.

**3. Type consistency:** `cn(...inputs: ClassValue[]): string` defined in Task 3, consumed by Task 5 components and tests. `@/lib/utils`, `@/components/ui/button`, `@/components/ui/card` import paths match `components.json` aliases and the Task 2 alias. `--primary` (post-rename) is the single gold token referenced by both legacy CSS and `@theme inline`. No signature drift.

## Execution Handoff

This is the foundation plan only. Phases 1–5 will each get their own plan written just-in-time (after Phase 0 lands and the real shadcn component APIs are in the repo), per the incremental decision in the spec.
