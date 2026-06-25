# Namespace Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add namespace selection/creation and namespace-scoped script, folder, run, and report storage.

**Architecture:** Keep UI paths namespace-relative and centralize namespace validation/key prefixing in `src/lib/namespaces.ts`. Server routes accept a namespace, prefix S3 object keys as `${namespace}/${relativePath}`, and strip that prefix before returning data to clients. `AppShell` owns the selected namespace and passes it through the existing explorer/editor/run/history workflow.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript strict mode, Jest, Testing Library, Playwright, MinIO S3-compatible client.

---

## Task 1: Namespace And S3 Configuration Foundation

**Files:**
- Create: `src/lib/namespaces.ts`
- Create: `src/lib/__tests__/namespaces.test.ts`
- Modify: `src/lib/minio.ts`
- Modify: `src/lib/__tests__/minio.test.ts`
- Create: `src/app/api/namespaces/route.ts`
- Create: `src/app/api/namespaces/__tests__/route.test.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write failing tests for namespace helpers**

Add tests in `src/lib/__tests__/namespaces.test.ts` covering:

```ts
import {
  DEFAULT_NAMESPACE,
  NAMESPACE_MARKER_OBJECT,
  getNamespaceFromRequest,
  normalizeNamespace,
  stripNamespacePrefix,
  toNamespacedKey,
} from "@/lib/namespaces";

describe("namespace helpers", () => {
  it("normalizes missing namespace to default", () => {
    expect(normalizeNamespace(undefined)).toBe(DEFAULT_NAMESPACE);
    expect(normalizeNamespace("")).toBe(DEFAULT_NAMESPACE);
    expect(normalizeNamespace("  team-a  ")).toBe("team-a");
  });

  it("rejects invalid namespace path segments", () => {
    expect(() => normalizeNamespace("team/a")).toThrow("Invalid namespace");
    expect(() => normalizeNamespace("../team")).toThrow("Invalid namespace");
    expect(() => normalizeNamespace("team a")).toThrow("Invalid namespace");
  });

  it("prefixes and strips storage keys", () => {
    expect(toNamespacedKey("team-a", "folder/script.ts")).toBe(
      "team-a/folder/script.ts"
    );
    expect(stripNamespacePrefix("team-a", "team-a/folder/script.ts")).toBe(
      "folder/script.ts"
    );
    expect(stripNamespacePrefix("team-a", "team-b/folder/script.ts")).toBeNull();
  });

  it("reads namespace from URL query strings", () => {
    const req = new Request("http://localhost/api/files?namespace=team-a");
    expect(getNamespaceFromRequest(req)).toBe("team-a");
  });

  it("uses a namespace marker object", () => {
    expect(NAMESPACE_MARKER_OBJECT("team-a")).toBe("team-a/.namespace");
  });
});
```

Run:

```bash
npx jest src/lib/__tests__/namespaces.test.ts --runInBand
```

Expected: FAIL because `src/lib/namespaces.ts` does not exist.

- [ ] **Step 2: Implement namespace helpers**

Create `src/lib/namespaces.ts` with:

```ts
export const DEFAULT_NAMESPACE = "default";

const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export class NamespaceError extends Error {
  constructor(message = "Invalid namespace") {
    super(message);
    this.name = "NamespaceError";
  }
}

export function normalizeNamespace(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_NAMESPACE;
  if (typeof value !== "string") throw new NamespaceError();
  const namespace = value.trim();
  if (!namespace) return DEFAULT_NAMESPACE;
  if (
    !NAMESPACE_PATTERN.test(namespace) ||
    namespace.includes("/") ||
    namespace.includes("\\") ||
    namespace === "." ||
    namespace === ".." ||
    namespace.includes("..")
  ) {
    throw new NamespaceError();
  }
  return namespace;
}

export function getNamespaceFromRequest(request: Request): string {
  return normalizeNamespace(new URL(request.url).searchParams.get("namespace"));
}

export function toNamespacedKey(namespaceValue: unknown, relativePath: string): string {
  const namespace = normalizeNamespace(namespaceValue);
  const path = relativePath.split("/").filter(Boolean).join("/");
  return path ? `${namespace}/${path}` : `${namespace}/`;
}

export function stripNamespacePrefix(namespaceValue: unknown, key: string): string | null {
  const namespace = normalizeNamespace(namespaceValue);
  const prefix = `${namespace}/`;
  if (!key.startsWith(prefix)) return null;
  return key.slice(prefix.length);
}

export function namespacePrefix(namespaceValue: unknown): string {
  return `${normalizeNamespace(namespaceValue)}/`;
}

export const NAMESPACE_MARKER = ".namespace";

export function NAMESPACE_MARKER_OBJECT(namespaceValue: unknown): string {
  return `${normalizeNamespace(namespaceValue)}/${NAMESPACE_MARKER}`;
}
```

Run the helper test again. Expected: PASS.

- [ ] **Step 3: Write failing tests for AWS-style S3 env parsing**

Extend `src/lib/__tests__/minio.test.ts` to reset modules between env changes and assert:

```ts
describe("getMinioClient env parsing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses AWS_S3_ENDPOINT host:port without MINIO_PORT", async () => {
    process.env.AWS_S3_ENDPOINT = "minio:9000";
    process.env.AWS_S3_ACCESS_KEY = "access";
    process.env.AWS_S3_SECRET_KEY = "secret";
    process.env.AWS_S3_USE_SSL = "false";
    const { getMinioClient } = await import("@/lib/minio");
    const client = getMinioClient() as unknown as {
      host: string;
      port: number;
      protocol: string;
      accessKey: string;
      secretKey: string;
    };
    expect(client.host).toBe("minio");
    expect(client.port).toBe(9000);
    expect(client.protocol).toBe("http:");
    expect(client.accessKey).toBe("access");
    expect(client.secretKey).toBe("secret");
  });

  it("parses URL endpoints and exports AWS_S3_BUCKET as scripts bucket", async () => {
    process.env.AWS_S3_BUCKET = "custom-scripts";
    process.env.AWS_S3_ENDPOINT = "https://s3.local:9443";
    process.env.AWS_S3_USE_SSL = "true";
    const { getMinioClient, SCRIPTS_BUCKET } = await import("@/lib/minio");
    const client = getMinioClient() as unknown as { host: string; port: number; protocol: string };
    expect(SCRIPTS_BUCKET).toBe("custom-scripts");
    expect(client.host).toBe("s3.local");
    expect(client.port).toBe(9443);
    expect(client.protocol).toBe("https:");
  });
});
```

Run:

```bash
npx jest src/lib/__tests__/minio.test.ts --runInBand
```

Expected: FAIL because `src/lib/minio.ts` still reads `MINIO_*`.

- [ ] **Step 4: Implement AWS-style S3 env parsing**

Update `src/lib/minio.ts`:

```ts
const endpointValue =
  process.env.AWS_S3_ENDPOINT ??
  (process.env.MINIO_ENDPOINT && process.env.MINIO_PORT
    ? `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
    : process.env.MINIO_ENDPOINT) ??
  "localhost:9000";

function parseEndpoint(value: string) {
  const withProtocol = value.includes("://") ? value : `http://${value}`;
  const url = new URL(withProtocol);
  const useSSLFromEndpoint = url.protocol === "https:";
  const useSSL =
    process.env.AWS_S3_USE_SSL !== undefined
      ? process.env.AWS_S3_USE_SSL === "true"
      : process.env.MINIO_USE_SSL !== undefined
        ? process.env.MINIO_USE_SSL === "true"
        : useSSLFromEndpoint;
  return {
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : useSSL ? 443 : 80,
    useSSL,
  };
}
```

Use:

```ts
export const SCRIPTS_BUCKET = process.env.AWS_S3_BUCKET ?? "k6-scripts";
export const REPORTS_BUCKET = process.env.AWS_S3_REPORTS_BUCKET ?? "k6-reports";
```

The MinIO client must use `AWS_S3_ACCESS_KEY` / `AWS_S3_SECRET_KEY` with fallback to old `MINIO_*` names. Run the MinIO test again. Expected: PASS.

- [ ] **Step 5: Write failing tests for namespace API**

Create `src/app/api/namespaces/__tests__/route.test.ts` covering:

```ts
import { EventEmitter } from "events";
import { GET, POST } from "@/app/api/namespaces/route";
import { SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = { listObjects: jest.fn(), putObject: jest.fn() };

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  ensureBuckets: () => mockEnsureBuckets(),
}));

function objectStream(names: string[]) {
  const stream = new EventEmitter();
  queueMicrotask(() => {
    for (const name of names) stream.emit("data", { name });
    stream.emit("end");
  });
  return stream;
}

describe("/api/namespaces", () => {
  beforeEach(() => {
    mockEnsureBuckets.mockReset();
    mockClient.listObjects.mockReset();
    mockClient.putObject.mockReset();
  });

  it("lists unique namespaces and includes default", async () => {
    mockClient.listObjects.mockReturnValue(
      objectStream(["team-a/api.ts", "team-a/.namespace", "team-b/load.ts"])
    );
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      namespaces: ["default", "team-a"],
      current: "default",
    });
    expect(mockClient.listObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, "", true);
  });

  it("creates a namespace marker", async () => {
    const response = await POST(
      new Request("http://localhost/api/namespaces", {
        method: "POST",
        body: JSON.stringify({ name: "team-a" }),
      })
    );
    expect(response.status).toBe(201);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/.namespace",
      expect.any(Buffer),
      0,
      { "Content-Type": "application/octet-stream" }
    );
  });
});
```

Run:

```bash
npx jest src/app/api/namespaces/__tests__/route.test.ts --runInBand
```

Expected: FAIL because the route does not exist.

- [ ] **Step 6: Implement namespace API and env files**

Create `src/app/api/namespaces/route.ts` with `GET` and `POST` using `ensureBuckets`, `getMinioClient`, `SCRIPTS_BUCKET`, `normalizeNamespace`, and `NAMESPACE_MARKER_OBJECT`.

Update `.env.example` to:

```text
AWS_S3_BUCKET=k6-scripts
AWS_S3_ENDPOINT=localhost:9000
AWS_S3_ACCESS_KEY=minioadmin
AWS_S3_SECRET_KEY=minioadmin
AWS_S3_USE_SSL=false
```

Update only the app service in `docker-compose.yml` to:

```yaml
environment:
  AWS_S3_BUCKET: k6-scripts
  AWS_S3_ENDPOINT: http://minio:9000
  AWS_S3_ACCESS_KEY: minioadmin
  AWS_S3_SECRET_KEY: minioadmin
  AWS_S3_USE_SSL: "false"
```

Keep `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` on the MinIO service.

Run:

```bash
npx jest src/lib/__tests__/namespaces.test.ts src/lib/__tests__/minio.test.ts src/app/api/namespaces/__tests__/route.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/lib/namespaces.ts src/lib/__tests__/namespaces.test.ts src/lib/minio.ts src/lib/__tests__/minio.test.ts src/app/api/namespaces/route.ts src/app/api/namespaces/__tests__/route.test.ts .env.example docker-compose.yml
git commit -m "feat: add namespace storage foundation"
```

## Task 2: Namespace Server Routes

**Files:**
- Modify: `src/app/api/files/route.ts`
- Modify: `src/app/api/files/[...path]/route.ts`
- Modify: `src/app/api/files/folder/route.ts`
- Modify: `src/app/api/files/rename/route.ts`
- Modify: `src/app/api/files/move/route.ts`
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/app/api/reports/[name]/route.ts`
- Modify: `src/lib/files-move.ts`
- Modify tests under `src/app/api/files/**/__tests__/`
- Modify: `src/app/api/reports/__tests__/route.test.ts`
- Create: `src/app/api/reports/[name]/__tests__/route.test.ts` if no direct report serving tests exist.

- [ ] **Step 1: Write failing route tests for namespace scoping**

Add focused tests before implementation:

- `GET /api/files?namespace=team-a` calls `listObjects(SCRIPTS_BUCKET, "team-a/", true)` and returns tree paths without `team-a/`.
- `POST /api/files` with `{ namespace: "team-a", name: "api/smoke.ts" }` writes `team-a/api/smoke.ts`.
- `GET /api/files/api/smoke.ts?namespace=team-a` reads `team-a/api/smoke.ts` but returns `{ name: "api/smoke.ts" }`.
- `DELETE /api/files/folder` with `{ namespace: "team-a", path: "api" }` lists/removes under `team-a/api/`.
- `POST /api/files/rename` with namespace moves scripts and reports with `team-a/` storage keys while returning relative `from` and `to`.
- `POST /api/files/move` with namespace rejects duplicate names only inside that namespace.
- `GET /api/reports?namespace=team-a` lists `team-a/` but returns relative report names.
- `GET /api/reports/api%2Fsmoke.ts-1.html?namespace=team-a` reads `team-a/api/smoke.ts-1.html`.

Run focused tests after adding each test. Expected: FAIL because routes still operate at bucket root.

- [ ] **Step 2: Add namespaced list helpers inside routes or a small local helper**

Use `namespacePrefix`, `stripNamespacePrefix`, and `toNamespacedKey` from `src/lib/namespaces.ts`.

For list routes, use:

```ts
const namespace = getNamespaceFromRequest(request);
const prefix = namespacePrefix(namespace);
const stream = client.listObjects(SCRIPTS_BUCKET, prefix, true);
const paths: string[] = [];
// For each obj.name:
const relative = stripNamespacePrefix(namespace, obj.name);
if (relative && relative !== ".keep" && relative !== ".namespace") paths.push(relative);
```

For path routes, compute:

```ts
const relativeName = path.join("/");
const storageKey = toNamespacedKey(namespace, relativeName);
```

- [ ] **Step 3: Update move execution for namespace-prefixed keys**

Modify `executeMovePlan` to accept an optional namespace:

```ts
export async function executeMovePlan(
  client: MoveClient,
  plan: MovePlan,
  namespace?: string
): Promise<void> {
  const scriptKey = (path: string) =>
    namespace ? toNamespacedKey(namespace, path) : path;
  const reportKey = scriptKey;
  // copyObject destination and sourceObject use scriptKey/reportKey.
  // removeObjects receives prefixed keys when namespace is supplied.
}
```

Keep the default unprefixed behavior so existing pure unit tests for `files-move.ts` do not all need rewriting. In route tests, assert prefixed copy/remove calls when `namespace` is supplied.

- [ ] **Step 4: Update move and rename routes to scope active-run protection**

For `getStatus()`:

```ts
const status = getStatus();
const activeRunningScript =
  status.running && status.namespace === namespace ? status.script : null;
```

List only namespace-prefixed objects, strip them before building move plans, execute with the namespace.

- [ ] **Step 5: Update reports routes**

`GET /api/reports` must accept `Request`, list `REPORTS_BUCKET` with `namespacePrefix(namespace)`, strip the prefix, drop `.keep` and `.namespace`, and return relative names.

`GET /api/reports/[name]` must accept the request, get namespace from query, decode the route param as Next already provides it, and read `toNamespacedKey(namespace, name)`.

- [ ] **Step 6: Run focused server tests**

```bash
npx jest src/app/api/files src/app/api/reports src/lib/__tests__/namespaces.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/app/api/files src/app/api/reports src/lib/files-move.ts
git commit -m "feat: scope file and report routes by namespace"
```

## Task 3: Namespace-Aware Runs And Workspace State

**Files:**
- Modify: `src/lib/run-lock.ts`
- Modify: `src/lib/__tests__/run-lock.test.ts`
- Modify: `src/app/api/run/route.ts`
- Modify or create: `src/app/api/run/__tests__/route.test.ts`
- Modify: `src/contexts/ScriptWorkspaceContext.tsx`
- Modify: `src/contexts/__tests__/ScriptWorkspaceContext.test.tsx`
- Modify: `src/components/tabs/EditorTab.tsx`
- Modify: `src/components/tabs/__tests__/EditorTab.test.tsx`

- [ ] **Step 1: Write failing run-lock tests**

Add tests that:

```ts
expect(tryAcquire("smoke.ts", "team-a")).toBe(true);
expect(getStatus()).toMatchObject({
  running: true,
  script: "smoke.ts",
  namespace: "team-a",
});
```

Also test `_reset()` returns `namespace: null`. Run:

```bash
npx jest src/lib/__tests__/run-lock.test.ts --runInBand
```

Expected: FAIL until `RunStatus` supports namespace.

- [ ] **Step 2: Implement namespace in run lock**

Update `RunStatus`:

```ts
export interface RunStatus {
  running: boolean;
  namespace: string | null;
  script: string | null;
  startedAt: number | null;
  activeRunners: number;
  capacity: 1;
}
```

Update `tryAcquire(script: string, namespace = DEFAULT_NAMESPACE)`.

- [ ] **Step 3: Write failing run route tests**

Add tests for `POST /api/run`:

- Sends `{ namespace: "team-a", filename: "api/smoke.ts" }`.
- Calls `tryAcquire("api/smoke.ts", "team-a")`.
- Reads `SCRIPTS_BUCKET` key `team-a/api/smoke.ts`.
- Saves report under `REPORTS_BUCKET` key matching `team-a/api/smoke.ts-*.html`.
- SSE `done` message exposes relative `reportName`, e.g. `api/smoke.ts-1790000000000.html`.

Run the focused test. Expected: FAIL.

- [ ] **Step 4: Implement namespaced run route**

In `src/app/api/run/route.ts`, parse:

```ts
const { filename, namespace: namespaceInput } = await request.json();
const namespace = normalizeNamespace(namespaceInput);
```

Use `toNamespacedKey(namespace, filename)` for script read and report write. Pass `namespace` into `tryAcquire`.

- [ ] **Step 5: Write failing context tests**

Extend `ScriptWorkspaceProvider` props with `namespace`. Tests should assert:

- `runScript("a.js")` posts `{ filename: "a.js", namespace: "team-a" }`.
- Status polling stores `globalRunningNamespace`.
- Sessions for the same script name in different namespaces do not share terminal output.

Expected: FAIL until provider accepts namespace.

- [ ] **Step 6: Implement workspace namespace state**

`ScriptWorkspaceProvider` accepts `namespace: string` and exposes:

```ts
globalRunningNamespace: string | null;
```

Key sessions internally by `${namespace}\0${filename}`. Keep the public `getSession(filename)` signature unchanged and resolve through the current provider namespace.

`runScript(filename)` sends namespace in the request body.

- [ ] **Step 7: Update EditorTab running logic**

Use:

```ts
const anotherScriptRunning =
  globalRunning &&
  (globalRunningNamespace !== currentNamespace || globalRunningScript !== filename);
```

Expose `namespace` from context if needed, or compare against the provider namespace in the context value.

- [ ] **Step 8: Run focused tests**

```bash
npx jest src/lib/__tests__/run-lock.test.ts src/contexts/__tests__/ScriptWorkspaceContext.test.tsx src/components/tabs/__tests__/EditorTab.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/lib/run-lock.ts src/lib/__tests__/run-lock.test.ts src/app/api/run src/contexts/ScriptWorkspaceContext.tsx src/contexts/__tests__/ScriptWorkspaceContext.test.tsx src/components/tabs/EditorTab.tsx src/components/tabs/__tests__/EditorTab.test.tsx
git commit -m "feat: track namespace in run state"
```

## Task 4: Namespace Selector And Client API Propagation

**Files:**
- Create: `src/components/layout/NamespaceSelector.tsx`
- Create: `src/components/layout/__tests__/NamespaceSelector.test.tsx`
- Modify: `src/components/layout/AppHeader.tsx`
- Modify: `src/components/layout/__tests__/AppHeader.test.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/__tests__/AppShell.test.tsx`
- Modify: `src/components/file-explorer/FileExplorer.tsx`
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`
- Modify: `src/components/editor/ScriptEditor.tsx`
- Modify: `src/components/editor/__tests__/ScriptEditor.test.tsx`
- Modify: `src/components/tabs/EditorTab.tsx`
- Modify: `src/components/tabs/TestHistoryTab.tsx`
- Modify: `src/components/tabs/__tests__/TestHistoryTab.test.tsx`
- Modify: `src/components/tabs/LiveDashboardTab.tsx` only if prop/test text needs namespace-specific wording.

- [ ] **Step 1: Write failing NamespaceSelector tests**

Create tests for:

- Fetches `/api/namespaces` and renders `default`.
- Calls `onNamespaceChange("team-a")` when selecting an existing option.
- Posts `{ name: "team-b" }` to `/api/namespaces`, refreshes the list, and selects `team-b`.
- Shows an inline error when the API returns `400`.

Run:

```bash
npx jest src/components/layout/__tests__/NamespaceSelector.test.tsx --runInBand
```

Expected: FAIL because the component does not exist.

- [ ] **Step 2: Implement NamespaceSelector**

Use existing `Button`, `Input`, and `Dialog` primitives. A native `<select>` is acceptable and avoids adding a new UI primitive. Keep it compact:

```tsx
<label className="flex items-center gap-1.5">
  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
    Namespace
  </span>
  <select aria-label="Namespace" value={namespace} onChange={...} />
</label>
```

Add a small plus button with a dialog for creating namespaces.

- [ ] **Step 3: Write failing AppShell/AppHeader integration tests**

Update mocks in `AppShell.test.tsx` to capture:

- `namespace` passed to `ScriptWorkspaceProvider`.
- `namespace` passed to `FileExplorer`.
- `namespace` passed to `EditorTab` or context-driven components if explicit props are used.
- `globalRunningScript` passed to `FileExplorer` is `null` when `globalRunningNamespace !== selectedNamespace`.
- Changing namespace clears selected file.

Update `AppHeader.test.tsx` to render namespace selector props and assert the active runner badge displays `team-a/folder/script.ts` in the title/text when running.

- [ ] **Step 4: Implement AppShell and AppHeader wiring**

`AppShell` owns:

```ts
const [selectedNamespace, setSelectedNamespace] = useState(DEFAULT_NAMESPACE);
```

After mount, hydrate from localStorage key `k6-studio-namespace`; write changes back to localStorage. On namespace change, set selected file to `null`.

Pass `selectedNamespace` to `ScriptWorkspaceProvider`.

Compute:

```ts
const runningScriptForExplorer =
  globalRunningNamespace === selectedNamespace ? globalRunningScript : null;
const activeDashboard =
  globalRunning &&
  globalRunningNamespace === selectedNamespace &&
  globalRunningScript === selectedFile &&
  selectedFile !== null;
```

Pass the namespace selector into `AppHeader`.

- [ ] **Step 5: Write failing client fetch propagation tests**

Add/update tests:

- `FileExplorer` initial fetch calls `/api/files?namespace=team-a`.
- File create/move/rename/folder/delete bodies include `namespace: "team-a"` or URLs include `?namespace=team-a`.
- `ScriptEditor` fetches and saves `/api/files/path.ts?namespace=team-a`.
- `TestHistoryTab` fetches `/api/reports?namespace=team-a` and iframes `/api/reports/<encoded>?namespace=team-a`.

- [ ] **Step 6: Implement client fetch propagation**

Use helper functions in components where useful:

```ts
function namespaceQuery(namespace: string) {
  return `namespace=${encodeURIComponent(namespace)}`;
}
```

For path APIs:

```ts
fetch(`/api/files/${encodeApiPath(path)}?${namespaceQuery(namespace)}`)
```

For JSON body mutations:

```ts
body: JSON.stringify({ namespace, ...payload })
```

Ensure `FileExplorer` resets tree, selection, expanded folders, and status when `namespace` changes.

- [ ] **Step 7: Run focused component tests**

```bash
npx jest src/components/layout/__tests__/NamespaceSelector.test.tsx src/components/layout/__tests__/AppHeader.test.tsx src/components/layout/__tests__/AppShell.test.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx src/components/editor/__tests__/ScriptEditor.test.tsx src/components/tabs/__tests__/TestHistoryTab.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/components/layout src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx src/components/editor/ScriptEditor.tsx src/components/editor/__tests__/ScriptEditor.test.tsx src/components/tabs src/contexts/ScriptWorkspaceContext.tsx
git commit -m "feat: add namespace selector to workspace"
```

## Task 5: End-To-End Coverage And Final Verification

**Files:**
- Modify: `e2e/k6-studio.spec.ts`
- Modify: `playwright.config.ts` only if timing needs adjustment.
- Modify docs only if implementation diverges from this plan.

- [ ] **Step 1: Add namespace E2E fixture helpers**

Add a helper that creates a namespace through the UI or API. Prefer UI for one test and API for setup-only paths.

- [ ] **Step 2: Add focused namespace isolation E2E test**

Test flow:

1. Load app.
2. Create namespace `team-e2e`.
3. Create script `namespace-smoke.ts` in `team-e2e`.
4. Assert script appears in explorer.
5. Switch back to `default`.
6. Assert `namespace-smoke.ts` is absent.
7. Switch to `team-e2e`.
8. Assert `namespace-smoke.ts` is present and selectable.

- [ ] **Step 3: Add active-run namespace dashboard/movement assertion if feasible**

If the full k6 run time budget allows, start a short run in `team-e2e`, switch to `default`, and assert the live dashboard iframe is not mounted. If this makes E2E too slow or flaky, cover this behavior with unit tests only and document the reason in the final summary.

- [ ] **Step 4: Run focused E2E**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "namespace"
```

Expected: PASS after implementation.

- [ ] **Step 5: Run full verification**

```bash
npx jest
npx tsc --noEmit
npm run lint
npm run build
docker compose down -v
docker compose up --build -d
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --project=chromium
```

Expected: all commands pass. If a command fails, write or update a failing test for the issue first, fix it, rerun the focused command, then rerun this full set.

- [ ] **Step 6: Commit Task 5**

```bash
git add e2e/k6-studio.spec.ts playwright.config.ts docs/superpowers/specs/2026-06-25-namespace-storage-design.md docs/superpowers/plans/2026-06-25-namespace-storage.md
git commit -m "test: cover namespace workspace flow"
```

## Plan Self-Review

- Spec coverage: namespace selector, create/select, S3 key structure, env rename, run/dashboard namespace matching, report preservation, and verification are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or unresolved option remains in the implementation steps.
- Type consistency: `namespace`, `globalRunningNamespace`, `DEFAULT_NAMESPACE`, `toNamespacedKey`, and `stripNamespacePrefix` are used consistently across tasks.
