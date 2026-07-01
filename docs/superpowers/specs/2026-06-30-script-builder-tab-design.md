# Script Builder Tab — Design

Date: 2026-06-30
Status: Approved (design); pending implementation plan

Interactive reference mockup (open in a browser):
[`docs/designs/2026-06-30-script-builder-interactive-mockup.html`](../../designs/2026-06-30-script-builder-interactive-mockup.html)
— a throwaway vanilla-JS prototype of the form, the REST/GraphQL toggle,
drag-reorder, and a live "Open in Editor" code preview. It demonstrates the
intended UX and the generated-script shape; it is not the implementation.

## Summary

Add a fourth main view, **Builder**, placed first in the tab bar:
`Builder · Editor · Live dashboard · Test history`.

The Builder is a **form-driven k6 script generator**. It holds only its own
in-memory form state, persists nothing, and has a single output action:
**Open in Editor**, which loads the generated script into the Editor tab as an
**unsaved scratch buffer**. From there the existing Editor save/run workflow
takes over (the user names and saves the file to MinIO if they want to keep it).

The generated script always begins with the marker line:

```js
// Built by Script Builder
```

(Marker uses `//`, not `#`, because k6 scripts are JavaScript and `#` is a
syntax error.)

## Goals

- Let users author a runnable k6 script without writing code.
- Keep the Builder stateless beyond its form — no new persistence, no new API.
- Reuse the existing Editor/save/run pipeline for everything after generation.
- Produce idiomatic, **goja-safe** k6 JS (no Node-only globals).

## Non-Goals

- No persistence of Builder form state (no localStorage, no MinIO).
- No live code-preview pane (the output is the Editor buffer).
- No direct "Save as" from the Builder; saving happens in the Editor.
- No round-trip parsing (Editor → Builder). Builder is one-directional.

## Form Model

The Builder renders one scrollable, dense form (control-room styling, matching
`globals.css` tokens and `src/components/ui/` primitives). Sections:

### 1. Target
- **Host** (required): full origin. Protocol optional — defaults to `http://`
  when omitted (e.g. `example.com` → `http://example.com`). Used as `BASE_URL`.

### 2. Load profile → `options.stages`
- Repeatable, **reorderable** **stage** rows (drag grip handle), each:
  `duration` (number) + `unit` (`seconds | minutes | hours`) + `target` (VUs).
- Defaults to one row; the last row cannot be removed. Units convert to k6
  duration strings: `s` / `m` / `h` (e.g. `30` + `minutes` → `"30m"`). Stage
  order is preserved in the emitted `options.stages` array.

### 3. Thresholds → `options.thresholds`
- Repeatable rows, each: `metric` (select of common metrics:
  `http_req_duration`, `http_req_failed`, `http_reqs`, `iteration_duration`,
  `checks`) + `condition` (free text, e.g. `p(95)<500`, `rate<0.01`).
- Multiple conditions for the same metric are merged into one array entry:
  `{ "http_req_duration": ["p(95)<500", "max<1000"] }`.
- Empty → `options.thresholds` is omitted entirely.

### 4. Scenario steps
An **ordered, reorderable list of steps** (drag grip handle). Two add actions:
**Add API request** and **Add sleep**. A step is a discriminated union:

**Sleep step** (standalone): `duration` (number) + `unit`
(`seconds | minutes | hours`), converted to seconds → `sleep(n)`. Sleep is no
longer a per-request field; it is its own step you can place anywhere in the
order.

**API request step** has a **request type** toggle: **REST | GraphQL**.

- **REST**: `method` (`GET | POST | PUT | PATCH | DELETE`) + `path`
  (appended to `BASE_URL`), plus three sample-set sub-sections:
  - **Body**: each sample is one full payload (free text / JSON). One picked at
    random per iteration. Emitted only for body methods
    (`POST`/`PUT`/`PATCH`); ignored for `GET`/`DELETE`.
  - **Headers**: each sample is a **set** of key/value rows. One *set* picked at
    random per iteration.
  - **Query params**: each sample is a **set** of key/value rows. One *set*
    picked at random per iteration and encoded onto the URL.
- **GraphQL**: `endpoint path` (POST is fixed) + a single `query` / mutation
  string, plus:
  - **Variables**: each sample is one variables object (JSON). One picked at
    random per iteration. The request body is
    `JSON.stringify({ query, variables: pick(...) })`.
  - **Headers**: same set-of-rows semantics as REST. `Content-Type:
    application/json` is always emitted for GraphQL (merged with the picked set).
- Any sample-set with zero samples omits its corresponding generated code.

## Execution Semantics

Per VU iteration, the default function runs **every step in list order**.
- **API request step** → wrapped in a k6 `group()` named
  `"<METHOD> <path>"` (REST) or `"GraphQL <path>"` (GraphQL). Inside: pick the
  random body/variables/header-set/query-set (each independently) and issue the
  request.
- **Sleep step** → a bare `sleep(seconds)` call at that position in the order.

## Generated Script Shape

```js
// Built by Script Builder
import http from "k6/http";
import { group, sleep } from "k6";

const BASE_URL = "https://example.com";

export const options = {
  stages: [
    { duration: "30m", target: 50 },
    { duration: "2m", target: 50 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function qs(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// step 0 — REST POST /api/v1/users
const bodies0 = [
  JSON.stringify({ name: "Alice", plan: "pro" }),
  JSON.stringify({ name: "Bob", plan: "free" }),
];
const headerSets0 = [{ "Content-Type": "application/json" }];
const querySets0 = [{ page: "1" }];

// step 2 — GraphQL POST /graphql
const gqlQuery2 = `query Users($limit: Int!) { users(limit: $limit) { id name } }`;
const gqlVars2 = [{ limit: 10 }, { limit: 50 }];
const headerSets2 = [{ Authorization: "Bearer TOKEN" }];

export default function () {
  // step 0 — REST request
  group("POST /api/v1/users", () => {
    const query = qs(pick(querySets0));
    const url = `${BASE_URL}/api/v1/users` + (query ? `?${query}` : "");
    http.post(url, pick(bodies0), { headers: pick(headerSets0) });
  });

  // step 1 — sleep
  sleep(1);

  // step 2 — GraphQL request
  group("GraphQL /graphql", () => {
    const body = JSON.stringify({ query: gqlQuery2, variables: pick(gqlVars2) });
    const headers = { "Content-Type": "application/json", ...pick(headerSets2) };
    http.post(`${BASE_URL}/graphql`, body, { headers });
  });
}
```

Notes:
- `qs()` and `pick()` helpers are emitted only when used.
- REST body samples are wrapped in `JSON.stringify(...)` when they parse as JSON;
  otherwise emitted as raw strings. (Generation detail; resolved in the plan.)
- GraphQL variables samples are object literals embedded directly; the body is
  `JSON.stringify({ query, variables })`.
- Query string is built manually (goja has no `URLSearchParams`).
- Step ordering in the default function exactly matches the form's step order.

## Architecture

```
Builder tab (form)  --Open in Editor-->  scratch buffer  -->  Editor tab
   |                                          |
   | pure form state (React)                  | ScriptWorkspaceContext draft
   v                                          v
generateScript(form): string  (pure, unit-tested)
```

### Components (`src/components/builder/`)
- `BuilderTab.tsx` — toolbar (title, Reset, **Open in Editor**) + scrollable form;
  owns form state via a `useReducer` model (a reducer suits add/remove/reorder
  of nested lists).
- Sub-components kept small and focused: `TargetSection`, `StagesSection`,
  `ThresholdsSection`, `StepList`, `RequestStepCard` (with the REST/GraphQL
  toggle), `SleepStep`, and `SampleSetEditor` (reused for body/variables payload
  lists and header/query key-value sets).
- **Reordering** (stages and steps) reuses the existing drag pattern from
  `src/components/file-explorer/` (see the file-explorer drag/bulk-move design)
  rather than adding a new DnD dependency; each draggable row carries a grip
  handle and a keyboard-accessible move affordance.

### Pure generator (`src/lib/script-builder.ts`)
- `generateScript(form: BuilderForm): string` — no React, no I/O. Fully
  unit-testable; this is where the bulk of test coverage lives.
- Owns host normalization, duration formatting, threshold merging, random-pick
  emission, body/query/header rules, and the `// Built by Script Builder` header.

### Editor scratch-buffer integration (the one cross-cutting change)
Today `EditorTab` requires a saved `filename` (shows EmptyState when null) and
`ScriptEditor` loads content from MinIO. The Builder needs to hand the Editor
**unsaved content with no backing file**. Approach:

- Add a `draft` concept to `ScriptWorkspaceContext`:
  `{ content: string; suggestedName: string } | null`, with
  `openDraftInEditor(content, suggestedName)` and `clearDraft()`.
- `AppShell` exposes a new `"builder"` `MainView`; "Open in Editor" calls
  `openDraftInEditor(...)` then switches `activeView` to `"editor"`.
- `EditorTab` renders the draft when present and no file is selected: shows the
  content in `ScriptEditor` as an untitled, unsaved buffer; **Save script**
  opens a "Save as" dialog (name + folder) that writes to MinIO via the existing
  files API, then selects the new file and clears the draft.
- Selecting a real file clears the draft (normal editing resumes).

This keeps the Builder dumb and one-directional while reusing the entire
existing save/run path.

### Navigation state (`src/lib/navigation-state.ts`)
- Extend `MainView` with `"builder"` and add it to `MAIN_VIEWS`.
- Builder is the default landing view candidate? No — keep `"editor"` as the
  parse fallback to preserve existing deep links; Builder is reachable via the
  tab and `?view=builder`. The draft buffer is **not** serialized to the URL
  (it is ephemeral and would not survive reload anyway).

## Edge Cases

- Host without protocol → prefix `http://`. Host with `https://` preserved.
- No stages → emit a single default stage? No: require at least one stage row in
  the form (cannot remove the last one), guaranteeing a valid `stages` array.
- Empty thresholds → omit `options.thresholds`.
- REST request with no samples → minimal request (`http.get(url)` etc.).
- `GET`/`DELETE` with body samples → body ignored (not emitted), with a small
  inline UI hint that body is unused for that method.
- GraphQL with no variables samples → `variables: {}` (or omitted) in the body.
- Sleep step with `0`/empty duration → no `sleep()` emitted for that step.
- Empty step list → valid default function with an empty body (or a single
  `sleep(1)` fallback; resolved in plan).
- Duplicate header/param keys within a set → last value wins (object semantics);
  acceptable for a generator.
- Reorder is pure list reindexing in the reducer; generated `// step N` comments
  and `group` names follow the new order.

## Testing

- **Unit (primary):** `script-builder.test.ts` covering: header marker, host
  normalization, duration formatting, stages/thresholds emission, REST per-method
  body rules, GraphQL body (`{query, variables}`) + forced `Content-Type`,
  random-pick helper emission, query encoding, standalone `sleep` step emission,
  empty-section omission, and **step ordering** (including sleep interleaved
  between requests).
- **Component:** `BuilderTab` add/remove/**reorder** of stages and steps, the
  REST↔GraphQL toggle, Reset, and that **Open in Editor** calls
  `openDraftInEditor` with the generated string.
- **Integration:** `EditorTab` renders a draft as an unsaved buffer and the
  "Save as" flow writes via the files API and clears the draft.
- Run `npx jest` (focused first) and `npx tsc --noEmit`.

## Out of Scope / Future

- Builder-side persistence or templates.
- Importing an existing script back into the Builder form.
- Per-scenario weighting / random single-scenario execution (we chose
  all-in-order).
```
