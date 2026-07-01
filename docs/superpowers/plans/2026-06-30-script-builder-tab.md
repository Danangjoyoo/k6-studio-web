# Script Builder Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a form-driven "Builder" tab that generates a k6 script and loads it into the Editor as an unsaved scratch buffer.

**Architecture:** A pure generator (`src/lib/script-builder.ts`) turns a typed form model into a k6 JS string. A reducer (`src/components/builder/builder-state.ts`) owns the form state. `BuilderTab` renders the form and calls a new `openDraftInEditor(content, suggestedName)` on `ScriptWorkspaceContext`, which stores a `draft` and switches the active view to the Editor. `EditorTab` renders the draft as an untitled buffer with a "Save as" dialog that POSTs to the existing files API.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript (strict), Tailwind 4, shadcn/Base UI primitives in `src/components/ui/`, lucide-react icons, Monaco editor, Jest + React Testing Library.

## Global Constraints

- Generated script's first line is exactly `// Built by Script Builder` (JS line comment — NOT `#`).
- k6 scripts are JavaScript run on goja: no Node-only globals (`URLSearchParams` is unavailable — build query strings manually).
- New main view id is the literal string `"builder"`; tab order is `Builder · Editor · Live dashboard · Test history` (Builder first).
- `MainView` parse fallback stays `"editor"` (preserve existing deep links). Builder is reachable via the tab and `?view=builder`. The draft buffer is never serialized to the URL.
- Use `@/` imports. Use existing `src/components/ui/` primitives and `lucide-react` icons. Match the dark control-room styling and `globals.css` tokens.
- Reorder uses native HTML5 drag-and-drop (the pattern already used in `src/components/file-explorer/FileItem.tsx`), not a new dependency.
- Scenario execution: every step runs in list order each iteration; API requests wrapped in `group()`, sleep emitted as a bare `sleep(seconds)`.
- GraphQL requests are POST with body `JSON.stringify({ query, variables })` and always send `Content-Type: application/json`.
- Visual reference (markup/styling/interactions): [`docs/designs/2026-06-30-script-builder-interactive-mockup.html`](../../designs/2026-06-30-script-builder-interactive-mockup.html). Spec: [`docs/superpowers/specs/2026-06-30-script-builder-tab-design.md`](../specs/2026-06-30-script-builder-tab-design.md).
- Verify with `npx jest <path>` (focused), then `npx jest`, `npx tsc --noEmit`, `npm run lint`.

---

## Task 1: Generator model + options scaffold

**Files:**
- Create: `src/lib/script-builder.ts`
- Test: `src/lib/__tests__/script-builder.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4, 9):

```ts
export type DurationUnit = "s" | "m" | "h";
export interface Stage { duration: string; unit: DurationUnit; target: string; }
export interface Threshold { metric: string; condition: string; }
export interface KeyValue { k: string; v: string; }
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RestRequest {
  reqType: "rest";
  method: HttpMethod;
  path: string;
  bodies: string[];          // raw payload strings; one picked per iteration
  headerSets: KeyValue[][];  // each entry is a header SET; one set picked
  querySets: KeyValue[][];   // each entry is a query SET; one set picked
}
export interface GraphqlRequest {
  reqType: "graphql";
  path: string;
  query: string;
  variables: string[];       // raw JSON strings; one picked per iteration
  headerSets: KeyValue[][];
}
export interface RequestStep { type: "request"; collapsed?: boolean; request: RestRequest | GraphqlRequest; }
export interface SleepStep { type: "sleep"; duration: string; unit: DurationUnit; }
export type Step = RequestStep | SleepStep;

export interface BuilderForm {
  host: string;
  stages: Stage[];
  thresholds: Threshold[];
  steps: Step[];
}

export function generateScript(form: BuilderForm): string;
export function normalizeHost(host: string): string;       // exported for tests
export function formatDuration(s: Stage): string;           // exported for tests
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/script-builder.test.ts
import {
  generateScript,
  normalizeHost,
  formatDuration,
  type BuilderForm,
} from "@/lib/script-builder";

function baseForm(overrides: Partial<BuilderForm> = {}): BuilderForm {
  return {
    host: "example.com",
    stages: [{ duration: "30", unit: "m", target: "50" }],
    thresholds: [],
    steps: [],
    ...overrides,
  };
}

describe("script-builder scaffold", () => {
  it("normalizes host, defaulting protocol to http", () => {
    expect(normalizeHost("example.com")).toBe("http://example.com");
    expect(normalizeHost("https://x.io")).toBe("https://x.io");
    expect(normalizeHost("  http://y.io ")).toBe("http://y.io");
  });

  it("formats duration from value + unit", () => {
    expect(formatDuration({ duration: "30", unit: "m", target: "1" })).toBe("30m");
    expect(formatDuration({ duration: "5", unit: "s", target: "1" })).toBe("5s");
  });

  it("emits the marker, imports, BASE_URL, stages and an empty default fn", () => {
    const out = generateScript(baseForm());
    expect(out.startsWith("// Built by Script Builder\n")).toBe(true);
    expect(out).toContain(`import http from "k6/http";`);
    expect(out).toContain(`import { group, sleep } from "k6";`);
    expect(out).toContain(`const BASE_URL = "http://example.com";`);
    expect(out).toContain(`{ duration: "30m", target: 50 },`);
    expect(out).toContain("export default function () {");
  });

  it("merges thresholds by metric and omits the key when empty", () => {
    expect(generateScript(baseForm())).not.toContain("thresholds:");
    const out = generateScript(
      baseForm({
        thresholds: [
          { metric: "http_req_duration", condition: "p(95)<500" },
          { metric: "http_req_duration", condition: "max<1000" },
          { metric: "http_req_failed", condition: "rate<0.01" },
          { metric: "http_reqs", condition: "   " },
        ],
      })
    );
    expect(out).toContain(`http_req_duration: ["p(95)<500", "max<1000"],`);
    expect(out).toContain(`http_req_failed: ["rate<0.01"],`);
    expect(out).not.toContain("http_reqs:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/script-builder.test.ts`
Expected: FAIL — cannot find module `@/lib/script-builder`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/script-builder.ts
export type DurationUnit = "s" | "m" | "h";
export interface Stage { duration: string; unit: DurationUnit; target: string; }
export interface Threshold { metric: string; condition: string; }
export interface KeyValue { k: string; v: string; }
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RestRequest {
  reqType: "rest";
  method: HttpMethod;
  path: string;
  bodies: string[];
  headerSets: KeyValue[][];
  querySets: KeyValue[][];
}
export interface GraphqlRequest {
  reqType: "graphql";
  path: string;
  query: string;
  variables: string[];
  headerSets: KeyValue[][];
}
export interface RequestStep { type: "request"; collapsed?: boolean; request: RestRequest | GraphqlRequest; }
export interface SleepStep { type: "sleep"; duration: string; unit: DurationUnit; }
export type Step = RequestStep | SleepStep;

export interface BuilderForm {
  host: string;
  stages: Stage[];
  thresholds: Threshold[];
  steps: Step[];
}

export function normalizeHost(host: string): string {
  const trimmed = host.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function formatDuration(s: Stage): string {
  return `${(s.duration || "0").trim()}${s.unit}`;
}

function mergeThresholds(thresholds: Threshold[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of thresholds) {
    const condition = t.condition.trim();
    if (!condition) continue;
    (out[t.metric] = out[t.metric] ?? []).push(condition);
  }
  return out;
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

export function generateScript(form: BuilderForm): string {
  const lines: string[] = [];
  lines.push("// Built by Script Builder", "");
  lines.push(`import http from "k6/http";`);
  lines.push(`import { group, sleep } from "k6";`, "");
  lines.push(`const BASE_URL = ${JSON.stringify(normalizeHost(form.host))};`, "");

  lines.push("export const options = {");
  lines.push("  stages: [");
  for (const s of form.stages) {
    lines.push(`    { duration: ${JSON.stringify(formatDuration(s))}, target: ${Number(s.target) || 0} },`);
  }
  lines.push("  ],");
  const merged = mergeThresholds(form.thresholds);
  const metrics = Object.keys(merged);
  if (metrics.length > 0) {
    lines.push("  thresholds: {");
    for (const metric of metrics) {
      lines.push(`    ${metric}: [${merged[metric].map((c) => JSON.stringify(c)).join(", ")}],`);
    }
    lines.push("  },");
  }
  lines.push("};", "");

  // Step emission added in Tasks 2 & 3.
  lines.push("export default function () {");
  lines.push("}");

  return collapseBlankLines(lines.join("\n")) + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/script-builder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/script-builder.ts src/lib/__tests__/script-builder.test.ts
git commit -m "feat: add k6 script-builder generator scaffold"
```

---

## Task 2: Generator — REST request + sleep emission

**Files:**
- Modify: `src/lib/script-builder.ts`
- Test: `src/lib/__tests__/script-builder.test.ts`

**Interfaces:**
- Consumes: `generateScript`, types from Task 1.
- Produces: emission of `pick`/`qs` helpers, per-step `bodiesN`/`headerSetsN`/`querySetsN` decls, REST `group(...)` calls, and bare `sleep(n)` calls — relied on by Tasks 3 and 9.

- [ ] **Step 1: Write the failing test (append to the suite)**

```ts
describe("script-builder REST + sleep", () => {
  it("emits a POST with random body/header/query and a sleep step in order", () => {
    const out = generateScript({
      host: "https://api.test",
      stages: [{ duration: "1", unit: "m", target: "10" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: {
            reqType: "rest",
            method: "POST",
            path: "/users",
            bodies: [`{ "a": 1 }`, `{ "a": 2 }`],
            headerSets: [[{ k: "Content-Type", v: "application/json" }]],
            querySets: [[{ k: "page", v: "1" }]],
          },
        },
        { type: "sleep", duration: "2", unit: "s" },
      ],
    });
    expect(out).toContain("function pick(arr) {");
    expect(out).toContain("function qs(params) {");
    expect(out).toContain(`const bodies0 = [JSON.stringify({ "a": 1 }), JSON.stringify({ "a": 2 })];`);
    expect(out).toContain(`const headerSets0 = [{ "Content-Type": "application/json" }];`);
    expect(out).toContain(`const querySets0 = [{ page: "1" }];`);
    expect(out).toContain(`group("POST /users", () => {`);
    expect(out).toContain("const query = qs(querySets0[0]);");
    expect(out).toContain("const url = `${BASE_URL}/users` + (query ? `?${query}` : \"\");");
    expect(out).toContain("http.post(url, pick(bodies0), { headers: headerSets0[0] });");
    // sleep is its own step, AFTER the request
    expect(out.indexOf("sleep(2);")).toBeGreaterThan(out.indexOf("http.post("));
  });

  it("omits body for GET and emits a minimal request when no samples", () => {
    const out = generateScript({
      host: "x.io",
      stages: [{ duration: "1", unit: "s", target: "1" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: { reqType: "rest", method: "GET", path: "/ping", bodies: ["{}"], headerSets: [], querySets: [] },
        },
      ],
    });
    expect(out).toContain("http.get(`${BASE_URL}/ping`);");
    expect(out).not.toContain("bodies0");
    expect(out).not.toContain("function qs");
  });

  it("drops a zero-duration sleep step", () => {
    const out = generateScript({
      host: "x.io",
      stages: [{ duration: "1", unit: "s", target: "1" }],
      thresholds: [],
      steps: [{ type: "sleep", duration: "0", unit: "s" }],
    });
    expect(out).not.toContain("sleep(");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/script-builder.test.ts -t "REST + sleep"`
Expected: FAIL — body shows the empty default function, none of the expected substrings present.

- [ ] **Step 3: Write minimal implementation**

Replace the `generateScript` body between the `lines.push("};", "");` line and the final `return` with step emission. Add helper functions and rewrite the default-function assembly:

```ts
function jsKey(k: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
}
function jsObjectLiteral(rows: KeyValue[]): string {
  const entries = rows
    .filter((r) => r.k.trim() !== "")
    .map((r) => `${jsKey(r.k)}: ${JSON.stringify(r.v)}`);
  return `{ ${entries.join(", ")} }`;
}
function nonEmptySets(sets: KeyValue[][]): KeyValue[][] {
  return sets
    .map((set) => set.filter((r) => r.k.trim() !== ""))
    .filter((set) => set.length > 0);
}
function isJson(text: string): boolean {
  try { JSON.parse(text); return true; } catch { return false; }
}
function pickExpr(name: string, count: number): string {
  return count > 1 ? `pick(${name})` : `${name}[0]`;
}
function secondsOf(value: string, unit: DurationUnit): number {
  const n = parseFloat(value) || 0;
  return unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n;
}

interface Emit { usePick: boolean; useQs: boolean; decls: string[]; calls: string[]; }

function emitRest(req: RestRequest, i: number, e: Emit): void {
  const hasBody =
    ["POST", "PUT", "PATCH"].includes(req.method) &&
    req.bodies.some((b) => b.trim() !== "");
  const bodies = req.bodies.filter((b) => b.trim() !== "");
  const headerSets = nonEmptySets(req.headerSets);
  const querySets = nonEmptySets(req.querySets);

  if (hasBody) {
    e.usePick = e.usePick || bodies.length > 1;
    const items = bodies.map((b) => (isJson(b) ? `JSON.stringify(${b.trim()})` : JSON.stringify(b)));
    e.decls.push(`const bodies${i} = [${items.join(", ")}];`);
  }
  if (headerSets.length) {
    e.usePick = e.usePick || headerSets.length > 1;
    e.decls.push(`const headerSets${i} = [${headerSets.map(jsObjectLiteral).join(", ")}];`);
  }
  if (querySets.length) {
    e.usePick = e.usePick || querySets.length > 1;
    e.useQs = true;
    e.decls.push(`const querySets${i} = [${querySets.map(jsObjectLiteral).join(", ")}];`);
  }

  e.calls.push(`  // step ${i} — REST ${req.method} ${req.path}`);
  e.calls.push(`  group(${JSON.stringify(`${req.method} ${req.path}`)}, () => {`);
  let urlExpr = "`${BASE_URL}" + req.path + "`";
  if (querySets.length) {
    e.calls.push(`    const query = qs(${pickExpr(`querySets${i}`, querySets.length)});`);
    urlExpr = "`${BASE_URL}" + req.path + "` + (query ? `?${query}` : \"\")";
  }
  e.calls.push(`    const url = ${urlExpr};`);
  const args = ["url"];
  args.push(hasBody ? pickExpr(`bodies${i}`, bodies.length) : "null");
  if (headerSets.length) args.push(`{ headers: ${pickExpr(`headerSets${i}`, headerSets.length)} }`);
  e.calls.push(`    http.${req.method.toLowerCase()}(${args.join(", ")});`);
  e.calls.push("  });", "");
}

function emitSleep(step: SleepStep, i: number, e: Emit): void {
  const seconds = secondsOf(step.duration, step.unit);
  if (seconds <= 0) return;
  e.calls.push(`  // step ${i} — sleep`, `  sleep(${seconds});`, "");
}
```

Then rewrite the tail of `generateScript` (replacing the empty default-fn block):

```ts
  const e: Emit = { usePick: false, useQs: false, decls: [], calls: [] };
  form.steps.forEach((step, i) => {
    if (step.type === "sleep") emitSleep(step, i, e);
    else if (step.request.reqType === "rest") emitRest(step.request, i, e);
    // GraphQL handled in Task 3
  });

  if (e.usePick) {
    lines.push("function pick(arr) {", "  return arr[Math.floor(Math.random() * arr.length)];", "}", "");
  }
  if (e.useQs) {
    lines.push(
      "function qs(params) {",
      "  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join(\"&\");",
      "}",
      ""
    );
  }
  if (e.decls.length) lines.push(...e.decls, "");

  lines.push("export default function () {");
  lines.push(...(e.calls.length ? e.calls : ["  // no steps yet"]));
  lines.push("}");

  return collapseBlankLines(lines.join("\n")) + "\n";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/script-builder.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/script-builder.ts src/lib/__tests__/script-builder.test.ts
git commit -m "feat: emit REST requests and sleep steps in script-builder"
```

---

## Task 3: Generator — GraphQL request emission

**Files:**
- Modify: `src/lib/script-builder.ts`
- Test: `src/lib/__tests__/script-builder.test.ts`

**Interfaces:**
- Consumes: `Emit`, helpers, types from Tasks 1–2.
- Produces: `gqlQueryN`/`gqlVarsN` decls and a GraphQL `group(...)` POST call.

- [ ] **Step 1: Write the failing test (append)**

```ts
describe("script-builder GraphQL", () => {
  it("emits a POST graphql request with picked variables and forced content-type", () => {
    const out = generateScript({
      host: "https://api.test",
      stages: [{ duration: "1", unit: "m", target: "10" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: {
            reqType: "graphql",
            path: "/graphql",
            query: "query Q($l: Int!) { users(limit: $l) { id } }",
            variables: [`{ "l": 10 }`, `{ "l": 50 }`],
            headerSets: [[{ k: "Authorization", v: "Bearer T" }]],
          },
        },
      ],
    });
    expect(out).toContain(`const gqlQuery0 = "query Q($l: Int!) { users(limit: $l) { id } }";`);
    expect(out).toContain(`const gqlVars0 = [{ "l": 10 }, { "l": 50 }];`);
    expect(out).toContain(`group("GraphQL /graphql", () => {`);
    expect(out).toContain("const body = JSON.stringify({ query: gqlQuery0, variables: pick(gqlVars0) });");
    expect(out).toContain(`const headers = { "Content-Type": "application/json", ...headerSets0[0] };`);
    expect(out).toContain("http.post(`${BASE_URL}/graphql`, body, { headers });");
  });

  it("uses empty variables object when there are no variable samples", () => {
    const out = generateScript({
      host: "x.io",
      stages: [{ duration: "1", unit: "s", target: "1" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: { reqType: "graphql", path: "/gql", query: "{ ping }", variables: [], headerSets: [] },
        },
      ],
    });
    expect(out).toContain("variables: {} });");
    expect(out).toContain(`const headers = { "Content-Type": "application/json" };`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/script-builder.test.ts -t "GraphQL"`
Expected: FAIL — GraphQL branch not implemented, expected substrings absent.

- [ ] **Step 3: Write minimal implementation**

Add the emitter:

```ts
function emitGraphql(req: GraphqlRequest, i: number, e: Emit): void {
  const variables = req.variables.filter((v) => v.trim() !== "");
  const headerSets = nonEmptySets(req.headerSets);

  e.decls.push(`const gqlQuery${i} = ${JSON.stringify(req.query)};`);
  if (variables.length) {
    e.usePick = e.usePick || variables.length > 1;
    const items = variables.map((v) => (isJson(v) ? v.trim() : JSON.stringify(v)));
    e.decls.push(`const gqlVars${i} = [${items.join(", ")}];`);
  }
  if (headerSets.length) {
    e.usePick = e.usePick || headerSets.length > 1;
    e.decls.push(`const headerSets${i} = [${headerSets.map(jsObjectLiteral).join(", ")}];`);
  }

  const varsExpr = variables.length ? pickExpr(`gqlVars${i}`, variables.length) : "{}";
  const headersExpr = headerSets.length
    ? `{ "Content-Type": "application/json", ...${pickExpr(`headerSets${i}`, headerSets.length)} }`
    : `{ "Content-Type": "application/json" }`;

  e.calls.push(`  // step ${i} — GraphQL ${req.path}`);
  e.calls.push(`  group(${JSON.stringify(`GraphQL ${req.path}`)}, () => {`);
  e.calls.push(`    const body = JSON.stringify({ query: gqlQuery${i}, variables: ${varsExpr} });`);
  e.calls.push(`    const headers = ${headersExpr};`);
  e.calls.push("    http.post(`${BASE_URL}" + req.path + "`, body, { headers });");
  e.calls.push("  });", "");
}
```

Wire it into the `forEach` in `generateScript`:

```ts
    if (step.type === "sleep") emitSleep(step, i, e);
    else if (step.request.reqType === "rest") emitRest(step.request, i, e);
    else emitGraphql(step.request, i, e);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/script-builder.test.ts`
Expected: PASS (all generator tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/script-builder.ts src/lib/__tests__/script-builder.test.ts
git commit -m "feat: emit GraphQL requests in script-builder"
```

---

## Task 4: Builder form reducer

**Files:**
- Create: `src/components/builder/builder-state.ts`
- Test: `src/components/builder/__tests__/builder-state.test.ts`

**Interfaces:**
- Consumes: types from `@/lib/script-builder`.
- Produces (consumed by Task 9):

```ts
export function initialBuilderForm(): BuilderForm;
export type BuilderAction =
  | { type: "setHost"; value: string }
  | { type: "addStage" } | { type: "removeStage"; index: number }
  | { type: "moveStage"; from: number; to: number }
  | { type: "addThreshold" } | { type: "removeThreshold"; index: number }
  | { type: "addRequestStep" } | { type: "addSleepStep" }
  | { type: "removeStep"; index: number } | { type: "moveStep"; from: number; to: number }
  | { type: "toggleCollapse"; index: number }
  | { type: "setRequestType"; index: number; reqType: "rest" | "graphql" }
  | { type: "updatePath"; path: string; value: string }      // generic dot-path setter
  | { type: "pushSample"; path: string }                      // push "" or empty set/row
  | { type: "removeSample"; path: string; index: number }
  | { type: "reset" };
export function builderReducer(state: BuilderForm, action: BuilderAction): BuilderForm;
```

The `updatePath`/`pushSample`/`removeSample` actions use a dot path into the form (e.g. `steps.0.request.bodies.1`, `steps.0.request.headerSets.0`, `steps.0.request.headerSets.0.2.k`, `stages.1.target`). `pushSample` pushes `""` to a string array, `[{ k:"", v:"" }]` to a set array, and `{ k:"", v:"" }` to a row array — chosen by inspecting the existing element type.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/builder/__tests__/builder-state.test.ts
import {
  initialBuilderForm,
  builderReducer,
} from "@/components/builder/builder-state";

describe("builderReducer", () => {
  it("seeds a sensible default form", () => {
    const f = initialBuilderForm();
    expect(f.host).toMatch(/^https?:\/\//);
    expect(f.stages.length).toBeGreaterThanOrEqual(1);
    expect(f.steps.length).toBeGreaterThanOrEqual(1);
  });

  it("adds and reorders steps", () => {
    let f = initialBuilderForm();
    f = builderReducer(f, { type: "addSleepStep" });
    const n = f.steps.length;
    expect(f.steps[n - 1]).toMatchObject({ type: "sleep" });
    f = builderReducer(f, { type: "moveStep", from: n - 1, to: 0 });
    expect(f.steps[0]).toMatchObject({ type: "sleep" });
  });

  it("never removes the last stage", () => {
    let f = initialBuilderForm();
    while (f.stages.length > 1) f = builderReducer(f, { type: "removeStage", index: 0 });
    f = builderReducer(f, { type: "removeStage", index: 0 });
    expect(f.stages.length).toBe(1);
  });

  it("switches request type and preserves shared fields", () => {
    let f = initialBuilderForm();
    f = builderReducer(f, { type: "addRequestStep" });
    const idx = f.steps.length - 1;
    f = builderReducer(f, { type: "setRequestType", index: idx, reqType: "graphql" });
    const step = f.steps[idx];
    expect(step.type === "request" && step.request.reqType).toBe("graphql");
  });

  it("updates a value at a dot path and pushes/removes samples", () => {
    let f = initialBuilderForm();
    f = builderReducer(f, { type: "updatePath", path: "host", value: "api.x" });
    expect(f.host).toBe("api.x");
    f = builderReducer(f, { type: "updatePath", path: "stages.0.target", value: "99" });
    expect(f.stages[0].target).toBe("99");

    f = builderReducer(f, { type: "addRequestStep" }); // a REST step at the end
    const i = f.steps.length - 1;
    const before = (f.steps[i] as any).request.bodies.length;
    f = builderReducer(f, { type: "pushSample", path: `steps.${i}.request.bodies` });
    expect((f.steps[i] as any).request.bodies.length).toBe(before + 1);
    f = builderReducer(f, { type: "removeSample", path: `steps.${i}.request.bodies`, index: 0 });
    expect((f.steps[i] as any).request.bodies.length).toBe(before);
  });

  it("reset returns a fresh default form", () => {
    let f = initialBuilderForm();
    f = builderReducer(f, { type: "updatePath", path: "host", value: "changed" });
    f = builderReducer(f, { type: "reset" });
    expect(f.host).toBe(initialBuilderForm().host);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/builder/__tests__/builder-state.test.ts`
Expected: FAIL — cannot find module `builder-state`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/builder/builder-state.ts
import type {
  BuilderForm,
  RequestStep,
  RestRequest,
  GraphqlRequest,
  Step,
} from "@/lib/script-builder";

export function initialBuilderForm(): BuilderForm {
  return {
    host: "https://example.com",
    stages: [
      { duration: "30", unit: "m", target: "50" },
      { duration: "2", unit: "m", target: "50" },
    ],
    thresholds: [
      { metric: "http_req_duration", condition: "p(95)<500" },
      { metric: "http_req_failed", condition: "rate<0.01" },
    ],
    steps: [newRestStep(), { type: "sleep", duration: "1", unit: "s" }],
  };
}

function newRestStep(): RequestStep {
  const request: RestRequest = {
    reqType: "rest",
    method: "GET",
    path: "/api/v1/resource",
    bodies: [""],
    headerSets: [[{ k: "", v: "" }]],
    querySets: [[{ k: "", v: "" }]],
  };
  return { type: "request", collapsed: false, request };
}

function newGraphqlRequest(): GraphqlRequest {
  return {
    reqType: "graphql",
    path: "/graphql",
    query: "query {\n  __typename\n}",
    variables: ["{}"],
    headerSets: [[{ k: "", v: "" }]],
  };
}

export type BuilderAction =
  | { type: "setHost"; value: string }
  | { type: "addStage" } | { type: "removeStage"; index: number }
  | { type: "moveStage"; from: number; to: number }
  | { type: "addThreshold" } | { type: "removeThreshold"; index: number }
  | { type: "addRequestStep" } | { type: "addSleepStep" }
  | { type: "removeStep"; index: number } | { type: "moveStep"; from: number; to: number }
  | { type: "toggleCollapse"; index: number }
  | { type: "setRequestType"; index: number; reqType: "rest" | "graphql" }
  | { type: "updatePath"; path: string; value: string }
  | { type: "pushSample"; path: string }
  | { type: "removeSample"; path: string; index: number }
  | { type: "reset" };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getAt(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], root);
}

function setAt(root: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = root as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]] as Record<string, unknown>;
  node[keys[keys.length - 1]] = value;
}

function move<T>(arr: T[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}

function pushDefaultSample(target: unknown[]): void {
  // Decide what to push by inspecting the existing element type:
  //   set array   (KeyValue[][]) → push a new set [{ k:"", v:"" }]
  //   row array   (KeyValue[])   → push a new row { k:"", v:"" }
  //   payload arr (string[])     → push ""
  const first = target[0];
  if (Array.isArray(first)) target.push([{ k: "", v: "" }]);
  else if (first && typeof first === "object") target.push({ k: "", v: "" });
  else target.push("");
}

export function builderReducer(state: BuilderForm, action: BuilderAction): BuilderForm {
  const next = clone(state);
  switch (action.type) {
    case "setHost": next.host = action.value; return next;
    case "addStage": next.stages.push({ duration: "1", unit: "m", target: "10" }); return next;
    case "removeStage":
      if (next.stages.length > 1) next.stages.splice(action.index, 1);
      return next;
    case "moveStage": move(next.stages, action.from, action.to); return next;
    case "addThreshold":
      next.thresholds.push({ metric: "http_req_duration", condition: "p(95)<500" });
      return next;
    case "removeThreshold": next.thresholds.splice(action.index, 1); return next;
    case "addRequestStep": next.steps.push(newRestStep()); return next;
    case "addSleepStep": next.steps.push({ type: "sleep", duration: "1", unit: "s" }); return next;
    case "removeStep": next.steps.splice(action.index, 1); return next;
    case "moveStep": move(next.steps, action.from, action.to); return next;
    case "toggleCollapse": {
      const step = next.steps[action.index];
      if (step.type === "request") step.collapsed = !step.collapsed;
      return next;
    }
    case "setRequestType": {
      const step = next.steps[action.index];
      if (step.type !== "request") return next;
      step.request = action.reqType === "graphql" ? newGraphqlRequest() : newRestStep().request;
      return next;
    }
    case "updatePath": setAt(next, action.path, action.value); return next;
    case "pushSample": pushDefaultSample(getAt(next, action.path) as unknown[]); return next;
    case "removeSample": (getAt(next, action.path) as unknown[]).splice(action.index, 1); return next;
    case "reset": return initialBuilderForm();
    default: return state;
  }
}

export type { Step };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/builder/__tests__/builder-state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/builder/builder-state.ts src/components/builder/__tests__/builder-state.test.ts
git commit -m "feat: add Builder form reducer"
```

---

## Task 5: Add "builder" to navigation state

**Files:**
- Modify: `src/lib/navigation-state.ts:5` (the `MainView` union) and `src/lib/navigation-state.ts:18-22` (the `MAIN_VIEWS` set)
- Test: `src/lib/__tests__/navigation-state.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces: `MainView` now includes `"builder"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/navigation-state.test.ts
import { parseNavigationState, buildNavigationSearch } from "@/lib/navigation-state";

describe("navigation-state builder view", () => {
  it("parses ?view=builder", () => {
    expect(parseNavigationState("?view=builder").view).toBe("builder");
  });
  it("round-trips builder view", () => {
    const search = buildNavigationSearch({
      namespace: "default", view: "builder", script: null, report: null, reportTab: "summary",
    });
    expect(parseNavigationState(search).view).toBe("builder");
  });
  it("still falls back to editor for unknown views", () => {
    expect(parseNavigationState("?view=nope").view).toBe("editor");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/navigation-state.test.ts`
Expected: FAIL — `view` is `"editor"` for `?view=builder`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/navigation-state.ts`, change the type:

```ts
export type MainView = "builder" | "editor" | "live-dashboard" | "test-history";
```

and the set:

```ts
const MAIN_VIEWS = new Set<MainView>([
  "builder",
  "editor",
  "live-dashboard",
  "test-history",
]);
```

(Leave `parseMainView`'s fallback as `"editor"`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/navigation-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/navigation-state.ts src/lib/__tests__/navigation-state.test.ts
git commit -m "feat: add builder view to navigation state"
```

---

## Task 6: Draft buffer on ScriptWorkspaceContext

**Files:**
- Modify: `src/contexts/ScriptWorkspaceContext.tsx`
- Test: `src/contexts/__tests__/ScriptWorkspaceContext.test.tsx` (create)

**Interfaces:**
- Consumes: existing provider props.
- Produces (consumed by Tasks 8 & 9), added to `ScriptWorkspaceValue`:

```ts
draft: { content: string; suggestedName: string } | null;
openDraftInEditor: (content: string, suggestedName: string) => void;
clearDraft: () => void;
```

The provider gains an optional prop `onRequestEditorView?: () => void`, called by `openDraftInEditor` so the host can switch the active tab to the Editor.

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import {
  ScriptWorkspaceProvider,
  useScriptWorkspace,
} from "@/contexts/ScriptWorkspaceContext";

beforeEach(() => {
  // status poll fetch — return empty runs
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ runs: [], capacity: 1 }),
  }) as unknown as typeof fetch;
});

function Probe({ onReady }: { onReady: (ws: ReturnType<typeof useScriptWorkspace>) => void }) {
  const ws = useScriptWorkspace();
  onReady(ws);
  return <div data-testid="draft">{ws.draft?.content ?? "none"}</div>;
}

it("stores and clears a draft and requests the editor view", () => {
  const onRequestEditorView = jest.fn();
  let ws!: ReturnType<typeof useScriptWorkspace>;
  render(
    <ScriptWorkspaceProvider
      namespace="default"
      selectedFile={null}
      onSelectFile={() => {}}
      onRequestEditorView={onRequestEditorView}
    >
      <Probe onReady={(w) => (ws = w)} />
    </ScriptWorkspaceProvider>
  );
  expect(screen.getByTestId("draft")).toHaveTextContent("none");
  act(() => ws.openDraftInEditor("// code", "built.ts"));
  expect(onRequestEditorView).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("draft")).toHaveTextContent("// code");
  act(() => ws.clearDraft());
  expect(screen.getByTestId("draft")).toHaveTextContent("none");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx`
Expected: FAIL — `openDraftInEditor` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `ScriptWorkspaceContext.tsx`:

1. Extend `ScriptWorkspaceValue` with the three members above.
2. Add `onRequestEditorView` to the provider's prop type.
3. Inside the provider, add state + callbacks:

```ts
const [draft, setDraft] = useState<{ content: string; suggestedName: string } | null>(null);

const openDraftInEditor = useCallback(
  (content: string, suggestedName: string) => {
    setDraft({ content, suggestedName });
    onRequestEditorView?.();
  },
  [onRequestEditorView]
);
const clearDraft = useCallback(() => setDraft(null), []);
```

4. Add `draft`, `openDraftInEditor`, `clearDraft` to the `useMemo` value object **and** its dependency array.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ScriptWorkspaceContext.tsx src/contexts/__tests__/ScriptWorkspaceContext.test.tsx
git commit -m "feat: add draft buffer to script workspace context"
```

---

## Task 7: ScriptEditor scratch-content support

**Files:**
- Modify: `src/components/editor/ScriptEditor.tsx`
- Test: `src/components/editor/__tests__/ScriptEditor.test.tsx` (create or append)

**Interfaces:**
- Produces: `ScriptEditorProps` gains `filename?: string` (now optional) and `initialContent?: string`. When `filename` is empty/undefined, the editor seeds from `initialContent` and does NOT fetch; `save()` becomes a no-op (the host handles save-as). `getContent()` is unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import ScriptEditor from "@/components/editor/ScriptEditor";

jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <textarea data-testid="monaco" readOnly value={value} />,
}));

it("seeds from initialContent without fetching when filename is empty", () => {
  const fetchSpy = jest.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { getByTestId } = render(<ScriptEditor initialContent="// draft body" />);
  expect(getByTestId("monaco")).toHaveValue("// draft body");
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/editor/__tests__/ScriptEditor.test.tsx`
Expected: FAIL — type error / `filename` required, or fetch called.

- [ ] **Step 3: Write minimal implementation**

In `ScriptEditor.tsx`:

```ts
export interface ScriptEditorProps {
  filename?: string;
  initialContent?: string;
  namespace?: string;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
}
```

Update the component signature to default `filename = ""` and accept `initialContent`. Replace the load effect:

```ts
useEffect(() => {
  if (!filename) {
    const seed = initialContent ?? "";
    setContent(seed);
    contentRef.current = seed;
    onSaveStatusChange?.("unsaved");
    return;
  }
  async function load() {
    const requestId = ++loadRequestIdRef.current;
    const res = await fetch(fileUrl(filename, namespace));
    const data = (await res.json()) as { name: string; content: string };
    if (requestId !== loadRequestIdRef.current) return;
    setContent(data.content);
    contentRef.current = data.content;
    onSaveStatusChange?.("saved");
  }
  void load();
}, [filename, initialContent, namespace, onSaveStatusChange]);
```

And guard `save()`:

```ts
async function save() {
  if (!filename) return; // scratch buffer: host handles "Save as"
  onSaveStatusChange?.("saving");
  await fetch(fileUrl(filename, namespace), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: contentRef.current }),
  });
  onSaveStatusChange?.("saved");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/editor/__tests__/ScriptEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ScriptEditor.tsx src/components/editor/__tests__/ScriptEditor.test.tsx
git commit -m "feat: support scratch initialContent in ScriptEditor"
```

---

## Task 8: EditorTab draft mode + Save-as dialog

**Files:**
- Create: `src/components/editor/SaveDraftDialog.tsx`
- Modify: `src/components/tabs/EditorTab.tsx`
- Test: `src/components/tabs/__tests__/EditorTab.test.tsx` (append cases)

**Interfaces:**
- Consumes: `draft`, `clearDraft`, `setSelectedFile`, `namespace` from context (Task 6); `resolveScriptFilename` from `@/components/file-explorer/NewFileDialog`.
- Produces: when `filename` is null and `draft` exists, EditorTab renders the draft buffer; "Save script" → SaveDraftDialog → POST `/api/files` `{ namespace, name, content }` → on 201 `setSelectedFile(name)` + `clearDraft()`. "Run test" is disabled in draft mode.

- [ ] **Step 1: Write the failing test (append to EditorTab suite)**

Add `draft`, `clearDraft`, `setSelectedFile`, `openDraftInEditor` to the existing `mockWorkspace` object, then:

```tsx
it("renders a draft as an unsaved buffer when no file is selected", () => {
  mockWorkspace.draft = { content: "// Built by Script Builder", suggestedName: "built.ts" };
  render(<EditorTab filename={null} />);
  expect(screen.getByText(/untitled/i)).toBeInTheDocument();
  // Run is disabled until saved
  expect(screen.getByRole("button", { name: /run test/i })).toBeDisabled();
});
```

(Reset `mockWorkspace.draft = null` in `beforeEach`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/tabs/__tests__/EditorTab.test.tsx -t "draft"`
Expected: FAIL — EditorTab shows the EmptyState (filename null) instead of the draft buffer.

- [ ] **Step 3: Write minimal implementation**

Create `SaveDraftDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { resolveScriptFilename } from "@/components/file-explorer/NewFileDialog";

export default function SaveDraftDialog({
  open, suggestedName, onOpenChange, onSave,
}: {
  open: boolean;
  suggestedName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (filename: string) => Promise<void>;
}) {
  const [name, setName] = useState(suggestedName);
  useEffect(() => { if (open) setName(suggestedName); }, [open, suggestedName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave(resolveScriptFilename(name));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-panel-raised">
        <DialogHeader>
          <DialogTitle>Save generated script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="path/to/script.ts"
            className="font-mono text-xs"
          />
          <Button type="submit" size="sm" className="gap-1.5 self-end text-xs">
            <Save className="h-3.5 w-3.5" /> Save script
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

In `EditorTab.tsx`:
1. Pull `draft`, `clearDraft`, `setSelectedFile` from `useScriptWorkspace()`.
2. Replace the early `if (!filename) return <EmptyState … />` with:

```tsx
if (!filename && !draft) {
  return (
    <EmptyState
      icon={Code2}
      title="Select a file"
      description="Choose a script from the sidebar, or create one. Then edit and run your load test."
    />
  );
}
const isDraft = !filename && !!draft;
```

3. Add local state `const [saveDraftOpen, setSaveDraftOpen] = useState(false);` and a save handler:

```tsx
async function handleSaveDraft(name: string) {
  const content = editorRef.current?.getContent() ?? draft?.content ?? "";
  const res = await fetch(withBasePath("/api/files"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ namespace, name, content }),
  });
  if (res.ok) {
    clearDraft();
    setSelectedFile(name);
  }
}
```

(Import `withBasePath` from `@/lib/base-path`.)

4. In the toolbar, when `isDraft`: render the title as `untitled · draft`, point "Save script" at `() => setSaveDraftOpen(true)`, and disable "Run test" (`disabled={isDraft || …existing…}`). When not draft, keep existing behavior.
5. Render `<ScriptEditor>` with draft-aware props:

```tsx
<ScriptEditor
  ref={editorRef}
  namespace={namespace}
  filename={isDraft ? undefined : filename!}
  initialContent={isDraft ? draft!.content : undefined}
  onSaveStatusChange={setSaveStatus}
/>
```

6. Render `<SaveDraftDialog open={saveDraftOpen} suggestedName={draft?.suggestedName ?? "script.ts"} onOpenChange={setSaveDraftOpen} onSave={handleSaveDraft} />`.
7. Use a stable Terminal `resetKey` (e.g. `filename ?? "__draft__"`); in draft mode the terminal shows an empty session.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/tabs/__tests__/EditorTab.test.tsx`
Expected: PASS (existing + new draft cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/SaveDraftDialog.tsx src/components/tabs/EditorTab.tsx src/components/tabs/__tests__/EditorTab.test.tsx
git commit -m "feat: render Builder draft as unsaved Editor buffer with save-as"
```

---

## Task 9: Builder tab UI

**Files:**
- Create: `src/components/builder/BuilderTab.tsx`
- Create: `src/components/builder/SampleSetEditor.tsx`
- Test: `src/components/builder/__tests__/BuilderTab.test.tsx`

**Interfaces:**
- Consumes: `builderReducer`, `initialBuilderForm` (Task 4); `generateScript` (Tasks 1–3); `openDraftInEditor` from context (Task 6).
- Produces: a self-contained tab. On **Open in Editor**, calls `openDraftInEditor(generateScript(form), suggestedName)` where `suggestedName` defaults to `"built-by-builder.ts"`.

Use the saved interactive mockup ([`docs/designs/2026-06-30-script-builder-interactive-mockup.html`](../../designs/2026-06-30-script-builder-interactive-mockup.html)) as the exact markup/styling reference. Use `src/components/ui/` primitives where natural (`Button`, `Input`) and lucide icons (`Hammer`, `Plus`, `Trash2`, `X`, `Clock`, `GripVertical`, `ChevronDown`, `ChevronRight`, `RotateCcw`, `Code2`). Reorder uses native HTML5 DnD like `src/components/file-explorer/FileItem.tsx` (`draggable`, `onDragStart`/`onDragOver`/`onDrop`), dispatching `moveStage`/`moveStep`.

This task's component is large but logic-light (it dispatches reducer actions and renders). The behavioral contract that MUST be covered by tests:

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import BuilderTab from "@/components/builder/BuilderTab";

const openDraftInEditor = jest.fn();
jest.mock("@/contexts/ScriptWorkspaceContext", () => ({
  useScriptWorkspace: () => ({ openDraftInEditor }),
}));

describe("BuilderTab", () => {
  beforeEach(() => openDraftInEditor.mockClear());

  it("Open in Editor sends generated script starting with the marker", () => {
    render(<BuilderTab />);
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    expect(openDraftInEditor).toHaveBeenCalledTimes(1);
    const [content, name] = openDraftInEditor.mock.calls[0];
    expect(content.startsWith("// Built by Script Builder")).toBe(true);
    expect(name).toMatch(/\.ts$/);
  });

  it("adds a sleep step", () => {
    render(<BuilderTab />);
    const before = screen.getAllByText(/sleep/i).length;
    fireEvent.click(screen.getByRole("button", { name: /add sleep/i }));
    expect(screen.getAllByText(/sleep/i).length).toBeGreaterThan(before);
  });

  it("toggles a request to GraphQL", () => {
    render(<BuilderTab />);
    const gqlButtons = screen.getAllByRole("button", { name: /graphql/i });
    fireEvent.click(gqlButtons[0]);
    expect(screen.getByText(/query \/ mutation/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/builder/__tests__/BuilderTab.test.tsx`
Expected: FAIL — cannot find module `BuilderTab`.

- [ ] **Step 3: Write minimal implementation**

Create `SampleSetEditor.tsx` — renders the numbered key/value "set" samples and the payload (textarea) samples, emitting `updatePath`/`pushSample`/`removeSample` actions via a passed `dispatch`. Create `BuilderTab.tsx` with `useReducer(builderReducer, undefined, initialBuilderForm)`, the toolbar (Reset → `{type:"reset"}`, Open in Editor → `openDraftInEditor(generateScript(form), "built-by-builder.ts")`), and the four sections (Target, Load profile, Thresholds, Scenario steps) plus the two add buttons (`addRequestStep`, `addSleepStep`).

Implement the markup/styling per the mockup. Required, behavior-bearing wiring:
- Every text/select input calls `dispatch({ type: "updatePath", path, value })` on change, with `path` being the dot path into the form (e.g. `host`, `stages.0.target`, `steps.0.request.method`, `steps.0.request.path`, `steps.0.request.query`, `steps.0.request.bodies.1`, `steps.0.request.headerSets.0.0.k`).
- REST↔GraphQL segmented control dispatches `setRequestType`.
- Collapse chevron dispatches `toggleCollapse`.
- Add/remove buttons dispatch the matching list actions.
- Each stage row and each step row is `draggable`; `onDragStart` stores its index, `onDrop` dispatches `moveStage`/`moveStep`.
- Render labels/structure so the test queries above resolve (button names "Open in Editor", "Add sleep", "GraphQL"; the text "Query / mutation" appears for GraphQL requests).

(The mockup file is the line-level reference for class names and SVG icons; translate its `render*` functions into React components driven by `state`/`dispatch`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/builder/__tests__/BuilderTab.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/builder/BuilderTab.tsx src/components/builder/SampleSetEditor.tsx src/components/builder/__tests__/BuilderTab.test.tsx
git commit -m "feat: add Builder tab UI"
```

---

## Task 10: Wire Builder into the app shell

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Test: `src/components/layout/__tests__/AppShell.test.tsx` (append)

**Interfaces:**
- Consumes: `BuilderTab` (Task 9), `onRequestEditorView` provider prop (Task 6), `MainView` "builder" (Task 5).

- [ ] **Step 1: Write the failing test (append)**

```tsx
it("shows the Builder tab first and switches to it", () => {
  // (Use the suite's existing render helper / mocks.)
  render(<AppShell />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs[0]).toHaveTextContent(/builder/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/layout/__tests__/AppShell.test.tsx -t "Builder tab"`
Expected: FAIL — no Builder tab.

- [ ] **Step 3: Write minimal implementation**

In `AppShell.tsx`:
1. Import `BuilderTab` and the `Hammer` icon from `lucide-react`.
2. Update `isMainView` to also accept `"builder"`.
3. Add a `TabsTrigger value="builder"` as the FIRST trigger (before Editor), styled identically to the others, with `<Hammer className="h-3.5 w-3.5" />` + label `Builder`.
4. Add the matching `TabsContent value="builder"` rendering `<BuilderTab />`.
5. Pass `onRequestEditorView={() => setActiveView("editor")}` to `<ScriptWorkspaceProvider>` (the provider already receives `onSelectFile`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/layout/__tests__/AppShell.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/__tests__/AppShell.test.tsx
git commit -m "feat: add Builder tab to app shell and wire draft handoff"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npx jest`
Expected: PASS (all suites, including the new ones).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`, open `http://localhost:3000/k6`, click **Builder**, build a small scenario, click **Open in Editor**, confirm the buffer opens with `// Built by Script Builder`, **Save script** as `built.ts`, then **Run test**.

- [ ] **Step 5: Commit any lint/type fixups**

```bash
git add -A
git commit -m "chore: verification fixups for Builder tab"
```
