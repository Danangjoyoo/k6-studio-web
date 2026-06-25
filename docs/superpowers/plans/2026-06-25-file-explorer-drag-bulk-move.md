# File Explorer Drag Bulk Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag/drop moves, bulk selection, duplicate-safe all-or-nothing moves, active-run protection, and history preservation to the file explorer.

**Architecture:** Add a server-authoritative move API that preflights source objects, destination conflicts, active run state, and report-history movement before copying anything. Reuse the same move planning logic for inline rename hardening. Add lightweight native drag/drop and checkbox selection to the existing recursive file explorer without changing the editor/dashboard workflow.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript strict mode, MinIO SDK, Jest with jsdom/API route tests, Playwright Chromium E2E.

---

## File Structure

- Create `src/lib/files-move.ts`
  - Own path normalization, move planning, conflict detection, MinIO object listing, and report-history mapping shared by move and rename routes.
- Create `src/app/api/files/move/route.ts`
  - Own `POST /api/files/move`, call `getStatus()`, use `files-move` to preflight and execute copy/delete.
- Modify `src/app/api/files/rename/route.ts`
  - Replace blind copy/delete with the shared direct-move planner and active-run/history checks.
- Add `src/app/api/files/__tests__/moveRoute.test.ts`
  - Cover bulk move validation, duplicate rejection, active-run rejection, and history copy/delete behavior.
- Add or extend `src/app/api/files/__tests__/renameRoute.test.ts`
  - Cover duplicate rejection, active-run rejection, and history preservation for rename.
- Modify `src/components/file-explorer/FileItem.tsx`
  - Add checkbox and drag props while preserving click, double-click rename, and delete behavior.
- Modify `src/components/file-explorer/FolderItem.tsx`
  - Add checkbox, drop target, drag props, disabled move state, and visual drop state while preserving collapse, rename, create, and delete behavior.
- Modify `src/components/file-explorer/FileExplorer.tsx`
  - Own bulk selection, drag payload calculation, root/folder drop handling, move API call, error display, active-run disabled rows, and selected-file remap after a move.
- Modify `src/components/file-explorer/__tests__/FileExplorer.test.tsx`
  - Cover selection, drag payload, target folder/root behavior, rejection error, and active-run-disabled rows.
- Modify `src/components/layout/AppShell.tsx`
  - Pass `globalRunningScript` to `FileExplorer`; update selected file when a move response reports a selected file moved.
- Modify `e2e/k6-studio.spec.ts`
  - Add drag/drop move, duplicate rejection, history preservation, and active-run protection scenarios.

---

## Task 1: Move API Route And Shared Move Planner

**Files:**
- Create: `src/lib/files-move.ts`
- Create: `src/app/api/files/move/route.ts`
- Create: `src/app/api/files/__tests__/moveRoute.test.ts`

- [ ] **Step 1: Write failing move route tests**

Create `src/app/api/files/__tests__/moveRoute.test.ts`:

```ts
import { EventEmitter } from "events";
import { POST } from "@/app/api/files/move/route";
import { SCRIPTS_BUCKET, REPORTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockGetStatus = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  copyObject: jest.fn(),
  removeObjects: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  REPORTS_BUCKET: "k6-reports",
  ensureBuckets: () => mockEnsureBuckets(),
}));

jest.mock("@/lib/run-lock", () => ({
  getStatus: () => mockGetStatus(),
}));

function objectStream(names: string[]) {
  const stream = new EventEmitter();
  queueMicrotask(() => {
    for (const name of names) stream.emit("data", { name });
    stream.emit("end");
  });
  return stream;
}

function mockObjects(scripts: string[], reports: string[] = []) {
  mockClient.listObjects.mockImplementation((_bucket: string, prefix: string) => {
    const source = _bucket === SCRIPTS_BUCKET ? scripts : reports;
    return objectStream(source.filter((name) => name.startsWith(prefix)));
  });
}

function moveRequest(body: unknown) {
  return new Request("http://localhost/api/files/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockGetStatus.mockReset();
  mockGetStatus.mockReturnValue({
    running: false,
    script: null,
    startedAt: null,
    activeRunners: 0,
    capacity: 1,
  });
  mockClient.listObjects.mockReset();
  mockClient.copyObject.mockReset();
  mockClient.removeObjects.mockReset();
});

describe("POST /api/files/move", () => {
  it("moves a file into a folder after preflight", async () => {
    mockObjects(["source.ts", "target/.keep"]);

    const response = await POST(moveRequest({
      items: [{ path: "source.ts", type: "file" }],
      targetFolder: "target/",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      moved: [{ from: "source.ts", to: "target/source.ts", type: "file" }],
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "target/source.ts",
      `/${SCRIPTS_BUCKET}/source.ts`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "source.ts",
    ]);
  });

  it("rejects duplicate destination file before copy or delete", async () => {
    mockObjects(["source.ts", "target/source.ts"]);

    const response = await POST(moveRequest({
      items: [{ path: "source.ts", type: "file" }],
      targetFolder: "target/",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("destination"),
      conflicts: ["target/source.ts"],
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects the whole bulk move when one item conflicts", async () => {
    mockObjects(["a.ts", "b.ts", "target/b.ts"]);

    const response = await POST(moveRequest({
      items: [
        { path: "a.ts", type: "file" },
        { path: "b.ts", type: "file" },
      ],
      targetFolder: "target/",
    }));

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects moving a folder into its own descendant", async () => {
    mockObjects(["suite/.keep", "suite/load.ts"]);

    const response = await POST(moveRequest({
      items: [{ path: "suite/", type: "folder" }],
      targetFolder: "suite/nested/",
    }));

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects moving the active running script", async () => {
    mockObjects(["run.ts", "target/.keep"]);
    mockGetStatus.mockReturnValue({
      running: true,
      script: "run.ts",
      startedAt: "2026-06-25T00:00:00.000Z",
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(moveRequest({
      items: [{ path: "run.ts", type: "file" }],
      targetFolder: "target/",
    }));

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects moving a folder that contains the active running script", async () => {
    mockObjects(["suite/.keep", "suite/run.ts", "target/.keep"]);
    mockGetStatus.mockReturnValue({
      running: true,
      script: "suite/run.ts",
      startedAt: "2026-06-25T00:00:00.000Z",
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(moveRequest({
      items: [{ path: "suite/", type: "folder" }],
      targetFolder: "target/",
    }));

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("moves matching report history with a moved script", async () => {
    mockObjects(
      ["source.ts", "target/.keep"],
      ["source.ts-111.html", "other.ts-222.html"]
    );

    const response = await POST(moveRequest({
      items: [{ path: "source.ts", type: "file" }],
      targetFolder: "target/",
    }));

    expect(response.status).toBe(200);
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "target/source.ts-111.html",
      `/${REPORTS_BUCKET}/source.ts-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "source.ts-111.html",
    ]);
  });
});
```

- [ ] **Step 2: Run move route tests and verify red**

Run:

```bash
npx jest src/app/api/files/__tests__/moveRoute.test.ts --runInBand
```

Expected: FAIL because `src/app/api/files/move/route.ts` does not exist.

- [ ] **Step 3: Create shared move planner**

Create `src/lib/files-move.ts` with these exported types and functions:

```ts
import { REPORTS_BUCKET, SCRIPTS_BUCKET, getMinioClient } from "@/lib/minio";

export type MoveItemType = "file" | "folder";

export interface MoveItem {
  path: string;
  type: MoveItemType;
}

export interface MoveResult {
  from: string;
  to: string;
  type: MoveItemType;
}

export interface PlannedObjectMove {
  bucket: string;
  from: string;
  to: string;
}

export interface MovePlan {
  moved: MoveResult[];
  scriptObjectMoves: PlannedObjectMove[];
  reportObjectMoves: PlannedObjectMove[];
  scriptDeleteKeys: string[];
  reportDeleteKeys: string[];
}

export class MoveConflictError extends Error {
  constructor(
    message: string,
    readonly conflicts: string[],
    readonly status = 409
  ) {
    super(message);
  }
}

export function normalizeFolderPath(path: string | null | undefined): string {
  const value = (path ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return value ? `${value}/` : "";
}

export function normalizeMoveItem(item: MoveItem): MoveItem {
  if (!item || (item.type !== "file" && item.type !== "folder")) {
    throw new MoveConflictError("Move item type is invalid.", []);
  }
  const raw = item.path.trim().replace(/^\/+/, "");
  if (!raw || raw.includes("//")) {
    throw new MoveConflictError("Move item path is invalid.", []);
  }
  return item.type === "folder"
    ? { type: "folder", path: normalizeFolderPath(raw) }
    : { type: "file", path: raw.replace(/\/+$/, "") };
}

export function basenameOfPath(path: string, type: MoveItemType): string {
  const normalized = type === "folder"
    ? path.replace(/\/+$/, "")
    : path.replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

export function isInsideFolder(path: string, folderPath: string): boolean {
  const prefix = normalizeFolderPath(folderPath);
  return path.startsWith(prefix);
}

export function reportPrefix(scriptPath: string): string {
  return `${scriptPath}-`;
}

export async function listObjectNames(
  client: ReturnType<typeof getMinioClient>,
  bucket: string,
  prefix = ""
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = client.listObjects(bucket, prefix, true);
    const names: string[] = [];
    stream.on("data", (obj) => {
      if (obj.name) names.push(obj.name);
    });
    stream.on("end", () => resolve(names));
    stream.on("error", reject);
  });
}

function hasFolderAt(keys: string[], folderPath: string): boolean {
  const prefix = normalizeFolderPath(folderPath);
  return keys.some((key) => key.startsWith(prefix));
}

function hasFileAt(keys: string[], filePath: string): boolean {
  return keys.includes(filePath);
}

function assertNoNestedSelections(items: MoveItem[]) {
  const folders = items.filter((item) => item.type === "folder");
  for (const folder of folders) {
    for (const item of items) {
      if (item.path !== folder.path && item.path.startsWith(folder.path)) {
        throw new MoveConflictError(
          "Move rejected because a selected item is already inside a selected folder.",
          [item.path]
        );
      }
    }
  }
}

export interface BuildMovePlanInput {
  items: MoveItem[];
  targetFolder?: string | null;
  scriptKeys: string[];
  reportKeys: string[];
  runningScript?: string | null;
}

export function buildMovePlan(input: BuildMovePlanInput): MovePlan {
  const targetFolder = normalizeFolderPath(input.targetFolder);
  const items = input.items.map(normalizeMoveItem);
  if (items.length === 0) {
    throw new MoveConflictError("Move rejected because no items were supplied.", []);
  }
  assertNoNestedSelections(items);

  const sourceKeys = new Set<string>();
  const moved: MoveResult[] = [];
  const scriptObjectMoves: PlannedObjectMove[] = [];
  const movedScriptPathPairs: Array<{ from: string; to: string }> = [];
  const destinationKeys = new Set<string>();
  const conflicts = new Set<string>();

  for (const item of items) {
    if (item.type === "folder" && targetFolder.startsWith(item.path)) {
      conflicts.add(targetFolder);
      continue;
    }

    if (input.runningScript) {
      if (item.type === "file" && item.path === input.runningScript) {
        conflicts.add(item.path);
        continue;
      }
      if (item.type === "folder" && input.runningScript.startsWith(item.path)) {
        conflicts.add(item.path);
        continue;
      }
    }

    const baseName = basenameOfPath(item.path, item.type);
    const toPath = item.type === "folder"
      ? normalizeFolderPath(`${targetFolder}${baseName}`)
      : `${targetFolder}${baseName}`;

    moved.push({ from: item.path, to: toPath, type: item.type });

    if (item.type === "file") {
      if (!hasFileAt(input.scriptKeys, item.path)) conflicts.add(item.path);
      sourceKeys.add(item.path);
      scriptObjectMoves.push({ bucket: SCRIPTS_BUCKET, from: item.path, to: toPath });
      movedScriptPathPairs.push({ from: item.path, to: toPath });
      if (destinationKeys.has(toPath)) conflicts.add(toPath);
      destinationKeys.add(toPath);
      continue;
    }

    const folderSourceKeys = input.scriptKeys.filter((key) => key.startsWith(item.path));
    if (folderSourceKeys.length === 0) conflicts.add(item.path);
    for (const key of folderSourceKeys) {
      sourceKeys.add(key);
      const relative = key.slice(item.path.length);
      const toKey = `${toPath}${relative}`;
      scriptObjectMoves.push({ bucket: SCRIPTS_BUCKET, from: key, to: toKey });
      if (!key.endsWith("/.keep")) {
        movedScriptPathPairs.push({ from: key, to: toKey });
      }
      if (destinationKeys.has(toKey)) conflicts.add(toKey);
      destinationKeys.add(toKey);
    }
  }

  for (const move of scriptObjectMoves) {
    const existingDestination = input.scriptKeys.includes(move.to);
    const existingFolder = hasFolderAt(input.scriptKeys, `${move.to}/`);
    if ((existingDestination || existingFolder) && !sourceKeys.has(move.to)) {
      conflicts.add(move.to);
    }
  }

  for (const result of moved) {
    if (result.type === "folder") {
      const destinationPrefix = result.to;
      const existingFolder = input.scriptKeys.some((key) => key.startsWith(destinationPrefix));
      const existingFile = input.scriptKeys.includes(result.to.replace(/\/+$/, ""));
      if ((existingFolder || existingFile) && !sourceKeys.has(result.to)) {
        conflicts.add(result.to);
      }
    }
  }

  const reportObjectMoves: PlannedObjectMove[] = [];
  const reportDeleteKeys: string[] = [];
  const reportDestinationKeys = new Set<string>();
  for (const pair of movedScriptPathPairs) {
    const fromPrefix = reportPrefix(pair.from);
    const toPrefix = reportPrefix(pair.to);
    for (const reportKey of input.reportKeys) {
      if (!reportKey.startsWith(fromPrefix)) continue;
      const toReportKey = `${toPrefix}${reportKey.slice(fromPrefix.length)}`;
      if (input.reportKeys.includes(toReportKey) || reportDestinationKeys.has(toReportKey)) {
        conflicts.add(toReportKey);
      }
      reportDestinationKeys.add(toReportKey);
      reportObjectMoves.push({ bucket: REPORTS_BUCKET, from: reportKey, to: toReportKey });
      reportDeleteKeys.push(reportKey);
    }
  }

  if (conflicts.size > 0) {
    throw new MoveConflictError(
      "Move rejected because a destination already exists or a source is protected.",
      [...conflicts].sort()
    );
  }

  return {
    moved,
    scriptObjectMoves,
    reportObjectMoves,
    scriptDeleteKeys: [...sourceKeys],
    reportDeleteKeys,
  };
}

export async function executeMovePlan(
  client: ReturnType<typeof getMinioClient>,
  plan: MovePlan
) {
  for (const move of [...plan.scriptObjectMoves, ...plan.reportObjectMoves]) {
    await client.copyObject(move.bucket, move.to, `/${move.bucket}/${move.from}`);
  }
  if (plan.scriptDeleteKeys.length > 0) {
    await client.removeObjects(SCRIPTS_BUCKET, plan.scriptDeleteKeys);
  }
  if (plan.reportDeleteKeys.length > 0) {
    await client.removeObjects(REPORTS_BUCKET, plan.reportDeleteKeys);
  }
}
```

- [ ] **Step 4: Create move route**

Create `src/app/api/files/move/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  buildMovePlan,
  executeMovePlan,
  listObjectNames,
  MoveConflictError,
  type MoveItem,
} from "@/lib/files-move";
import {
  getMinioClient,
  SCRIPTS_BUCKET,
  REPORTS_BUCKET,
  ensureBuckets,
} from "@/lib/minio";
import { getStatus } from "@/lib/run-lock";

export async function POST(request: Request) {
  await ensureBuckets();
  const body = (await request.json()) as {
    items?: MoveItem[];
    targetFolder?: string | null;
  };

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }

  const client = getMinioClient();
  const [scriptKeys, reportKeys] = await Promise.all([
    listObjectNames(client, SCRIPTS_BUCKET),
    listObjectNames(client, REPORTS_BUCKET),
  ]);

  try {
    const status = getStatus();
    const plan = buildMovePlan({
      items: body.items,
      targetFolder: body.targetFolder,
      scriptKeys,
      reportKeys,
      runningScript: status.running ? status.script : null,
    });
    await executeMovePlan(client, plan);
    return NextResponse.json({ moved: plan.moved });
  } catch (error) {
    if (error instanceof MoveConflictError) {
      return NextResponse.json(
        { error: error.message, conflicts: error.conflicts },
        { status: error.status }
      );
    }
    throw error;
  }
}
```

- [ ] **Step 5: Run move route tests and verify green**

Run:

```bash
npx jest src/app/api/files/__tests__/moveRoute.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit move route**

Run:

```bash
git add src/lib/files-move.ts src/app/api/files/move/route.ts src/app/api/files/__tests__/moveRoute.test.ts
git commit -m "feat: add conflict-safe file move API"
```

---

## Task 2: Harden Rename With Conflicts, Active Run Protection, And History Preservation

**Files:**
- Modify: `src/app/api/files/rename/route.ts`
- Create: `src/app/api/files/__tests__/renameRoute.test.ts`
- Modify: `src/lib/files-move.ts`

- [ ] **Step 1: Write failing rename route tests**

Create `src/app/api/files/__tests__/renameRoute.test.ts`:

```ts
import { EventEmitter } from "events";
import { POST } from "@/app/api/files/rename/route";
import { REPORTS_BUCKET, SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockGetStatus = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  copyObject: jest.fn(),
  removeObject: jest.fn(),
  removeObjects: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  REPORTS_BUCKET: "k6-reports",
  ensureBuckets: () => mockEnsureBuckets(),
}));

jest.mock("@/lib/run-lock", () => ({
  getStatus: () => mockGetStatus(),
}));

function objectStream(names: string[]) {
  const stream = new EventEmitter();
  queueMicrotask(() => {
    for (const name of names) stream.emit("data", { name });
    stream.emit("end");
  });
  return stream;
}

function mockObjects(scripts: string[], reports: string[] = []) {
  mockClient.listObjects.mockImplementation((_bucket: string, prefix: string) => {
    const source = _bucket === SCRIPTS_BUCKET ? scripts : reports;
    return objectStream(source.filter((name) => name.startsWith(prefix)));
  });
}

function renameRequest(body: unknown) {
  return new Request("http://localhost/api/files/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockGetStatus.mockReset();
  mockGetStatus.mockReturnValue({
    running: false,
    script: null,
    startedAt: null,
    activeRunners: 0,
    capacity: 1,
  });
  mockClient.listObjects.mockReset();
  mockClient.copyObject.mockReset();
  mockClient.removeObject.mockReset();
  mockClient.removeObjects.mockReset();
});

describe("POST /api/files/rename", () => {
  it("rejects file rename when target exists", async () => {
    mockObjects(["source.ts", "target.ts"]);

    const response = await POST(renameRequest({
      from: "source.ts",
      to: "target.ts",
      type: "file",
    }));

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects renaming the active running file", async () => {
    mockObjects(["run.ts"]);
    mockGetStatus.mockReturnValue({
      running: true,
      script: "run.ts",
      startedAt: "2026-06-25T00:00:00.000Z",
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(renameRequest({
      from: "run.ts",
      to: "renamed.ts",
      type: "file",
    }));

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
  });

  it("preserves report history on file rename", async () => {
    mockObjects(["source.ts"], ["source.ts-111.html"]);

    const response = await POST(renameRequest({
      from: "source.ts",
      to: "renamed.ts",
      type: "file",
    }));

    expect(response.status).toBe(200);
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "renamed.ts-111.html",
      `/${REPORTS_BUCKET}/source.ts-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "source.ts-111.html",
    ]);
  });
});
```

- [ ] **Step 2: Run rename route tests and verify red**

Run:

```bash
npx jest src/app/api/files/__tests__/renameRoute.test.ts --runInBand
```

Expected: FAIL because the current rename route does not preflight conflicts or move report history.

- [ ] **Step 3: Extend move planner for direct rename**

Modify `src/lib/files-move.ts` to add `buildDirectMovePlan`:

```ts
export interface BuildDirectMovePlanInput {
  from: string;
  to: string;
  type: MoveItemType;
  scriptKeys: string[];
  reportKeys: string[];
  runningScript?: string | null;
}

export function buildDirectMovePlan(input: BuildDirectMovePlanInput): MovePlan {
  const fromItem = normalizeMoveItem({ path: input.from, type: input.type });
  const toPath = input.type === "folder"
    ? normalizeFolderPath(input.to)
    : input.to.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  if (!toPath || toPath.includes("//")) {
    throw new MoveConflictError("Rename target path is invalid.", []);
  }

  const conflicts = new Set<string>();
  if (input.runningScript) {
    if (fromItem.type === "file" && fromItem.path === input.runningScript) {
      conflicts.add(fromItem.path);
    }
    if (fromItem.type === "folder" && input.runningScript.startsWith(fromItem.path)) {
      conflicts.add(fromItem.path);
    }
  }

  if (fromItem.type === "folder" && toPath.startsWith(fromItem.path)) {
    conflicts.add(toPath);
  }

  const sourceKeys = fromItem.type === "file"
    ? input.scriptKeys.filter((key) => key === fromItem.path)
    : input.scriptKeys.filter((key) => key.startsWith(fromItem.path));

  if (sourceKeys.length === 0) {
    conflicts.add(fromItem.path);
  }

  const sourceKeySet = new Set(sourceKeys);
  const scriptObjectMoves: PlannedObjectMove[] = sourceKeys.map((fromKey) => {
    const toKey = fromItem.type === "folder"
      ? `${toPath}${fromKey.slice(fromItem.path.length)}`
      : toPath;
    return { bucket: SCRIPTS_BUCKET, from: fromKey, to: toKey };
  });

  if (fromItem.type === "file") {
    const targetFolderConflict = input.scriptKeys.some((key) => key.startsWith(`${toPath}/`));
    if ((input.scriptKeys.includes(toPath) || targetFolderConflict) && !sourceKeySet.has(toPath)) {
      conflicts.add(toPath);
    }
  } else {
    const targetFileConflict = input.scriptKeys.includes(toPath.replace(/\/+$/, ""));
    const targetFolderConflict = input.scriptKeys.some((key) => key.startsWith(toPath));
    if (targetFileConflict || targetFolderConflict) {
      conflicts.add(toPath);
    }
  }

  for (const move of scriptObjectMoves) {
    if (input.scriptKeys.includes(move.to) && !sourceKeySet.has(move.to)) {
      conflicts.add(move.to);
    }
  }

  const movedScriptPairs = scriptObjectMoves
    .filter((move) => !move.from.endsWith("/.keep"))
    .map((move) => ({ from: move.from, to: move.to }));

  const reportObjectMoves: PlannedObjectMove[] = [];
  const reportDeleteKeys: string[] = [];
  const reportDestinationKeys = new Set<string>();
  for (const pair of movedScriptPairs) {
    const fromPrefix = reportPrefix(pair.from);
    const toPrefix = reportPrefix(pair.to);
    for (const reportKey of input.reportKeys) {
      if (!reportKey.startsWith(fromPrefix)) continue;
      const toReportKey = `${toPrefix}${reportKey.slice(fromPrefix.length)}`;
      if (input.reportKeys.includes(toReportKey) || reportDestinationKeys.has(toReportKey)) {
        conflicts.add(toReportKey);
      }
      reportDestinationKeys.add(toReportKey);
      reportObjectMoves.push({ bucket: REPORTS_BUCKET, from: reportKey, to: toReportKey });
      reportDeleteKeys.push(reportKey);
    }
  }

  if (conflicts.size > 0) {
    throw new MoveConflictError(
      "Move rejected because a destination already exists or a source is protected.",
      [...conflicts].sort()
    );
  }

  return {
    moved: [{ from: fromItem.path, to: toPath, type: fromItem.type }],
    scriptObjectMoves,
    reportObjectMoves,
    scriptDeleteKeys: sourceKeys,
    reportDeleteKeys,
  };
}
```

- [ ] **Step 4: Replace rename route implementation**

Replace `src/app/api/files/rename/route.ts` with:

```ts
import { NextResponse } from "next/server";
import {
  buildDirectMovePlan,
  executeMovePlan,
  listObjectNames,
  MoveConflictError,
} from "@/lib/files-move";
import {
  getMinioClient,
  SCRIPTS_BUCKET,
  REPORTS_BUCKET,
  ensureBuckets,
} from "@/lib/minio";
import { getStatus } from "@/lib/run-lock";

export async function POST(request: Request) {
  await ensureBuckets();
  const { from, to, type } = (await request.json()) as {
    from: string;
    to: string;
    type: "file" | "folder";
  };

  if (!from || !to || (type !== "file" && type !== "folder")) {
    return NextResponse.json(
      { error: "from, to, and type are required" },
      { status: 400 }
    );
  }

  const client = getMinioClient();
  const [scriptKeys, reportKeys] = await Promise.all([
    listObjectNames(client, SCRIPTS_BUCKET),
    listObjectNames(client, REPORTS_BUCKET),
  ]);

  try {
    const status = getStatus();
    const plan = buildDirectMovePlan({
      from,
      to,
      type,
      scriptKeys,
      reportKeys,
      runningScript: status.running ? status.script : null,
    });
    await executeMovePlan(client, plan);
    return NextResponse.json({ from, to });
  } catch (error) {
    if (error instanceof MoveConflictError) {
      return NextResponse.json(
        { error: error.message, conflicts: error.conflicts },
        { status: error.status }
      );
    }
    throw error;
  }
}
```

- [ ] **Step 5: Run focused route tests**

Run:

```bash
npx jest src/app/api/files/__tests__/moveRoute.test.ts src/app/api/files/__tests__/renameRoute.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit rename hardening**

Run:

```bash
git add src/lib/files-move.ts src/app/api/files/rename/route.ts src/app/api/files/__tests__/renameRoute.test.ts src/app/api/files/__tests__/moveRoute.test.ts
git commit -m "fix: harden file rename moves"
```

---

## Task 3: File And Folder Row Selection And Drag Props

**Files:**
- Modify: `src/components/file-explorer/FileItem.tsx`
- Modify: `src/components/file-explorer/FolderItem.tsx`
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] **Step 1: Add failing row affordance tests**

Append these tests to `src/components/file-explorer/__tests__/FileExplorer.test.tsx`:

```ts
it("renders file and folder move checkboxes", async () => {
  mockFilesTree([
    {
      path: "auth/",
      name: "auth",
      type: "folder",
      children: [{ path: "auth/login.ts", name: "login.ts", type: "file" }],
    },
  ]);

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  await screen.findByText("auth");

  expect(
    within(screen.getByTestId("sidebar-folder-item")).getByRole("checkbox", {
      name: "Select auth",
    })
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("sidebar-file-item")).getByRole("checkbox", {
      name: "Select auth/login.ts",
    })
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run row affordance test and verify red**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: FAIL because row checkboxes do not exist.

- [ ] **Step 3: Add props and checkbox to FileItem**

Modify `src/components/file-explorer/FileItem.tsx` props:

```ts
  checked?: boolean;
  moveDisabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
```

Inside the row `<div>`, add:

```tsx
draggable={!moveDisabled}
aria-disabled={moveDisabled || undefined}
onDragStart={moveDisabled ? undefined : onDragStart}
onDragOver={onDragOver}
onDrop={onDrop}
```

Inside the row content before `<FileCode2 ... />`, add:

```tsx
<input
  type="checkbox"
  aria-label={`Select ${path}`}
  checked={checked ?? false}
  disabled={moveDisabled}
  className="h-3 w-3 shrink-0 accent-primary"
  onChange={(event) => onCheckedChange?.(event.target.checked)}
  onClick={(event) => event.stopPropagation()}
/>
```

- [ ] **Step 4: Add props and checkbox to FolderItem**

Modify `src/components/file-explorer/FolderItem.tsx` props:

```ts
  checked?: boolean;
  moveDisabled?: boolean;
  isDropTarget?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
```

Add the drag/drop attributes to the folder row `<div>`:

```tsx
draggable={!moveDisabled}
aria-disabled={moveDisabled || undefined}
onDragStart={moveDisabled ? undefined : onDragStart}
onDragOver={onDragOver}
onDragLeave={onDragLeave}
onDrop={onDrop}
```

Wrap the class with `cn` from `@/lib/utils` and include drop target styling:

```tsx
className={cn(
  "group mb-0.5 flex cursor-pointer items-center justify-between rounded-r-md border-l-2 py-1.5 pr-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-l-border hover:bg-sidebar-accent/50 hover:text-foreground",
  isDropTarget ? "border-l-primary bg-sidebar-accent text-foreground" : "border-l-transparent",
  moveDisabled && "cursor-default opacity-70"
)}
```

Inside the left content before the chevron, add:

```tsx
<input
  type="checkbox"
  aria-label={`Select ${path}`}
  checked={checked ?? false}
  disabled={moveDisabled}
  className="h-3 w-3 shrink-0 accent-primary"
  onChange={(event) => onCheckedChange?.(event.target.checked)}
  onClick={(event) => event.stopPropagation()}
/>
```

- [ ] **Step 5: Pass neutral props from FileExplorer**

In `src/components/file-explorer/FileExplorer.tsx`, pass initial values to keep the existing UI compiling:

```tsx
checked={false}
moveDisabled={false}
onCheckedChange={() => undefined}
```

Add these props to both `FileItem` and `FolderItem` call sites.

- [ ] **Step 6: Run row tests**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit row affordances**

Run:

```bash
git add src/components/file-explorer/FileItem.tsx src/components/file-explorer/FolderItem.tsx src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx
git commit -m "feat: add explorer move row affordances"
```

---

## Task 4: FileExplorer Bulk Selection And Move Orchestration

**Files:**
- Modify: `src/components/file-explorer/FileExplorer.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] **Step 1: Write failing component behavior tests**

Append these tests to `src/components/file-explorer/__tests__/FileExplorer.test.tsx`:

```ts
it("posts all selected top-level rows when dragging a selected row into a folder", async () => {
  mockFetchSequence(
    {
      json: {
        files: [],
        tree: [
          { path: "a.ts", name: "a.ts", type: "file" },
          { path: "b.ts", name: "b.ts", type: "file" },
          { path: "target/", name: "target", type: "folder", children: [] },
        ],
      },
    },
    { json: { moved: [] } },
    {
      json: {
        files: [],
        tree: [
          {
            path: "target/",
            name: "target",
            type: "folder",
            children: [
              { path: "target/a.ts", name: "a.ts", type: "file" },
              { path: "target/b.ts", name: "b.ts", type: "file" },
            ],
          },
        ],
      },
    }
  );

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  const files = await screen.findAllByTestId("sidebar-file-item");
  fireEvent.click(within(files[0]).getByRole("checkbox", { name: "Select a.ts" }));
  fireEvent.click(within(files[1]).getByRole("checkbox", { name: "Select b.ts" }));

  fireEvent.dragStart(files[0]);
  fireEvent.drop(screen.getByTestId("sidebar-folder-item"));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/move",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          items: [
            { path: "a.ts", type: "file" },
            { path: "b.ts", type: "file" },
          ],
          targetFolder: "target/",
        }),
      })
    );
  });
});

it("posts only the dragged row when it is not selected", async () => {
  mockFetchSequence(
    {
      json: {
        files: [],
        tree: [
          { path: "a.ts", name: "a.ts", type: "file" },
          { path: "b.ts", name: "b.ts", type: "file" },
          { path: "target/", name: "target", type: "folder", children: [] },
        ],
      },
    },
    { json: { moved: [] } },
    { json: { files: [], tree: [] } }
  );

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  const files = await screen.findAllByTestId("sidebar-file-item");
  fireEvent.click(within(files[1]).getByRole("checkbox", { name: "Select b.ts" }));
  fireEvent.dragStart(files[0]);
  fireEvent.drop(screen.getByTestId("sidebar-folder-item"));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/move",
      expect.objectContaining({
        body: JSON.stringify({
          items: [{ path: "a.ts", type: "file" }],
          targetFolder: "target/",
        }),
      })
    );
  });
});

it("shows move rejection errors without clearing selection", async () => {
  mockFetchSequence(
    {
      json: {
        files: [],
        tree: [{ path: "a.ts", name: "a.ts", type: "file" }],
      },
    },
    {
      ok: false,
      json: {
        error: "Move rejected because a destination already exists.",
        conflicts: ["target/a.ts"],
      },
    }
  );

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  const file = await screen.findByTestId("sidebar-file-item");
  fireEvent.click(within(file).getByRole("checkbox", { name: "Select a.ts" }));
  fireEvent.dragStart(file);
  fireEvent.drop(screen.getByTestId("file-explorer-scroll"));

  expect(await screen.findByText(/move rejected/i)).toBeInTheDocument();
  expect(within(file).getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();
});
```

- [ ] **Step 2: Run component tests and verify red**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: FAIL because `FileExplorer` does not own selection, drag payload, drop handlers, or move errors yet.

- [ ] **Step 3: Add selected file remap prop**

Modify `FileExplorerProps` in `src/components/file-explorer/FileExplorer.tsx`:

```ts
  runningScript?: string | null;
  onFileMoved?: (oldPath: string, newPath: string) => void;
```

Modify `src/components/layout/AppShell.tsx` to pass:

```tsx
<FileExplorer
  selectedFile={selectedFile}
  onSelectFile={onSelectFile}
  onFileDeleted={onFileDeleted}
  onFileRenamed={onFileRenamed}
  runningScript={globalRunningScript}
  onFileMoved={onFileRenamed}
/>
```

- [ ] **Step 4: Add selection and drag state**

Inside `FileExplorer`, add:

```ts
const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
const [dragItems, setDragItems] = useState<Array<{ path: string; type: "file" | "folder" }>>([]);
const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
const [moveError, setMoveError] = useState<string | null>(null);
```

Add helpers before `renderTree`:

```ts
function toggleMoveSelection(path: string, checked: boolean) {
  setSelectedPaths((current) => {
    const next = new Set(current);
    if (checked) next.add(path);
    else next.delete(path);
    return next;
  });
}

function nodeType(node: FileNode): "file" | "folder" {
  return node.type;
}

function topLevelSelectedItems(nodes: FileNode[]): Array<{ path: string; type: "file" | "folder" }> {
  const result: Array<{ path: string; type: "file" | "folder" }> = [];
  function visit(items: FileNode[], selectedAncestor: boolean) {
    for (const node of items) {
      const selected = selectedPaths.has(node.path);
      if (selected && !selectedAncestor) {
        result.push({ path: node.path, type: node.type });
      }
      if (node.type === "folder" && node.children) {
        visit(node.children, selectedAncestor || selected);
      }
    }
  }
  visit(nodes, false);
  return result;
}

function isProtectedByActiveRun(node: FileNode): boolean {
  if (!runningScript) return false;
  if (node.type === "file") return node.path === runningScript;
  return runningScript.startsWith(node.path);
}

function handleDragStart(node: FileNode, event: React.DragEvent<HTMLDivElement>) {
  const items = selectedPaths.has(node.path)
    ? topLevelSelectedItems(tree)
    : [{ path: node.path, type: nodeType(node) }];
  setDragItems(items);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify(items));
}

async function moveItems(targetFolder: string | null) {
  if (dragItems.length === 0) return;
  setMoveError(null);
  const response = await fetch("/api/files/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: dragItems, targetFolder }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setMoveError(body?.error ?? "Move rejected.");
    return;
  }

  const body = (await response.json()) as {
    moved: Array<{ from: string; to: string; type: "file" | "folder" }>;
  };
  await fetchTree();
  setSelectedPaths(new Set());
  setDragItems([]);
  for (const moved of body.moved) {
    if (moved.type === "file") onFileMoved?.(moved.from, moved.to);
  }
}
```

- [ ] **Step 5: Wire row props and root drop**

For each `FolderItem`, pass:

```tsx
checked={selectedPaths.has(node.path)}
moveDisabled={isProtectedByActiveRun(node)}
isDropTarget={dropTargetPath === node.path}
onCheckedChange={(checked) => toggleMoveSelection(node.path, checked)}
onDragStart={(event) => handleDragStart(node, event)}
onDragOver={(event) => {
  if (isProtectedByActiveRun(node)) return;
  event.preventDefault();
  setDropTargetPath(node.path);
}}
onDragLeave={() => setDropTargetPath(null)}
onDrop={(event) => {
  event.preventDefault();
  setDropTargetPath(null);
  void moveItems(node.path);
}}
```

For each `FileItem`, pass:

```tsx
checked={selectedPaths.has(node.path)}
moveDisabled={isProtectedByActiveRun(node)}
onCheckedChange={(checked) => toggleMoveSelection(node.path, checked)}
onDragStart={(event) => handleDragStart(node, event)}
```

Wrap the rendered tree body in a root drop `<div>` inside `ScrollArea`:

```tsx
<ScrollArea
  data-testid="file-explorer-scroll"
  className="min-h-0 flex-1 px-1 py-1"
>
  <div
    className="min-h-full"
    onDragOver={(event) => {
      event.preventDefault();
      setDropTargetPath(null);
    }}
    onDrop={(event) => {
      event.preventDefault();
      setDropTargetPath(null);
      void moveItems(null);
    }}
  >
    {tree.length === 0 ? (
      <EmptyState
        icon={FileCode2}
        title="No scripts yet"
        description="Create a script to start a load test."
        className="py-8"
      />
    ) : filteredTree.length === 0 ? (
      <EmptyState
        icon={Search}
        title="No matches"
        description="Try another search."
        className="py-8"
      />
    ) : (
      renderTree(filteredTree)
    )}
  </div>
</ScrollArea>
```

- [ ] **Step 6: Add error display**

Below the search row and above `ScrollArea`, add:

```tsx
{moveError && (
  <div className="shrink-0 border-b border-sidebar-border bg-destructive/10 px-2 py-1.5 font-mono text-[10px] text-destructive">
    {moveError}
  </div>
)}
```

- [ ] **Step 7: Run component tests**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx src/components/layout/__tests__/AppShell.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit explorer orchestration**

Run:

```bash
git add src/components/file-explorer/FileExplorer.tsx src/components/layout/AppShell.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx
git commit -m "feat: support explorer bulk drag moves"
```

---

## Task 5: Active Run UI Disable Coverage

**Files:**
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] **Step 1: Write failing active-run disabled test**

Append this test:

```ts
it("disables move controls for the running script and containing folders", async () => {
  mockFilesTree([
    {
      path: "suite/",
      name: "suite",
      type: "folder",
      children: [{ path: "suite/run.ts", name: "run.ts", type: "file" }],
    },
    { path: "other.ts", name: "other.ts", type: "file" },
  ]);

  render(
    <FileExplorer
      selectedFile={null}
      onSelectFile={jest.fn()}
      runningScript="suite/run.ts"
    />
  );

  const folder = await screen.findByTestId("sidebar-folder-item");
  const files = await screen.findAllByTestId("sidebar-file-item");

  expect(within(folder).getByRole("checkbox", { name: "Select suite/" })).toBeDisabled();
  expect(within(files[0]).getByRole("checkbox", { name: "Select suite/run.ts" })).toBeDisabled();
  expect(within(files[1]).getByRole("checkbox", { name: "Select other.ts" })).not.toBeDisabled();
});
```

- [ ] **Step 2: Run active-run UI test and verify result**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: PASS if Task 4 already implemented `runningScript` disabling; FAIL if disabled folder/file propagation is incomplete.

- [ ] **Step 3: Fix disabled propagation if needed**

If the test fails, update `isProtectedByActiveRun` in `FileExplorer` to:

```ts
function isProtectedByActiveRun(node: FileNode): boolean {
  if (!runningScript) return false;
  if (node.type === "file") return node.path === runningScript;
  return runningScript.startsWith(node.path);
}
```

Ensure this function is used for both `moveDisabled` and drag start prevention.

- [ ] **Step 4: Commit active-run UI coverage**

Run:

```bash
git add src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx
git commit -m "test: cover active run move protection"
```

---

## Task 6: E2E Coverage For Moves, Conflicts, History, And Active Run

**Files:**
- Modify: `e2e/k6-studio.spec.ts`

- [ ] **Step 1: Add E2E helpers**

In `e2e/k6-studio.spec.ts`, add helpers near the existing `fileRow` and `folderRow` helpers:

```ts
async function dragRowToFolder(page: Page, source: ReturnType<typeof fileRow>, target: ReturnType<typeof folderRow>) {
  await source.dragTo(target);
}

async function dragRowToExplorerRoot(page: Page, source: ReturnType<typeof fileRow>) {
  await source.dragTo(page.getByTestId("file-explorer-scroll"));
}

async function selectMoveCheckbox(row: ReturnType<typeof fileRow> | ReturnType<typeof folderRow>, name: string) {
  await row.getByRole("checkbox", { name }).check();
}
```

- [ ] **Step 2: Add drag file into folder test**

Append:

```ts
test("drag moves a script into a folder", async ({ page }) => {
  await waitForApp(page);
  const script = `drag-root-${Date.now()}.ts`;
  const folder = `drag-target-${Date.now()}`;
  await createScript(page, script);
  await createFolder(page, folder);

  await dragRowToFolder(page, fileRow(page, script), folderRow(page, `${folder}/`));

  await expect(fileRow(page, `${folder}/${script}`)).toBeVisible({ timeout: 10000 });
  await expect(fileRow(page, script)).toHaveCount(0);
});
```

- [ ] **Step 3: Add duplicate rejection test**

Append:

```ts
test("duplicate move is rejected and source remains", async ({ page }) => {
  await waitForApp(page);
  const folder = `duplicate-target-${Date.now()}`;
  const script = `duplicate-${Date.now()}.ts`;
  await createFolder(page, folder);
  await createScript(page, script);
  await createScriptViaApi(page, `${folder}/${script}`);

  await dragRowToFolder(page, fileRow(page, script), folderRow(page, `${folder}/`));

  await expect(page.getByText(/move rejected/i)).toBeVisible({ timeout: 10000 });
  await expect(fileRow(page, script)).toBeVisible();
  await expect(fileRow(page, `${folder}/${script}`)).toBeVisible();
});
```

- [ ] **Step 4: Add history preservation test**

Append:

```ts
test("history remains accessible after moving a script", async ({ page }) => {
  test.setTimeout(120_000);
  await waitForApp(page);
  const script = `history-move-${Date.now()}.ts`;
  const folder = `history-target-${Date.now()}`;
  await createScriptViaApi(page, script);
  await createFolder(page, folder);
  await selectFile(page, script);

  await page.getByRole("button", { name: /run test/i }).click();
  await waitForRunner(page, 1, 15000);
  await waitForRunner(page, 0, 90000);

  await dragRowToFolder(page, fileRow(page, script), folderRow(page, `${folder}/`));
  await selectFile(page, `${folder}/${script}`);
  await page.getByRole("tab", { name: /test history/i }).click();

  await expect(page.getByText(`${folder}/${script}-`)).toBeVisible({ timeout: 15000 });
});
```

- [ ] **Step 5: Add active-run protection E2E**

Append:

```ts
test("running script cannot be moved", async ({ page }) => {
  test.setTimeout(120_000);
  await waitForApp(page);
  const script = `active-lock-${Date.now()}.ts`;
  const folder = `active-target-${Date.now()}`;
  await createScriptViaApi(page, script);
  await createFolder(page, folder);
  await selectFile(page, script);

  await page.getByRole("button", { name: /run test/i }).click();
  await waitForRunner(page, 1, 15000);

  await expect(
    fileRow(page, script).getByRole("checkbox", { name: `Select ${script}` })
  ).toBeDisabled();

  await waitForRunner(page, 0, 90000);
});
```

- [ ] **Step 6: Run focused E2E**

Run:

```bash
npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "drag moves|duplicate move|history remains|running script cannot"
```

Expected: PASS.

- [ ] **Step 7: Commit E2E coverage**

Run:

```bash
git add e2e/k6-studio.spec.ts
git commit -m "test: cover explorer move workflows"
```

---

## Task 7: Full Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run Jest**

Run:

```bash
npx jest --runInBand
```

Expected: all suites pass.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0 with no warnings.

- [ ] **Step 4: Rebuild Docker app**

Run:

```bash
docker compose up --build -d
```

Expected: app and minio services running and healthy.

- [ ] **Step 5: Run full Chromium E2E**

Run:

```bash
npx playwright test --project=chromium
```

Expected: all Chromium tests pass.

- [ ] **Step 6: Check runtime state**

Run:

```bash
curl -sS http://localhost:3000/api/run/status
docker compose exec -T app ps -ef
git status --short
```

Expected:

```text
{"running":false,"script":null,"startedAt":null,"activeRunners":0,"capacity":1}
```

The process list contains `node scripts/docker-server.mjs`, `next-server`, and `ps -ef`, with no `k6` process. `git status --short` is empty.

## Self-Review Checklist

- Spec coverage:
  - Drag/drop move: Task 3, Task 4, Task 6.
  - Bulk selection: Task 3, Task 4, Task 6.
  - Duplicate rejection and all-or-nothing move: Task 1, Task 6.
  - Active running script/folder protection: Task 1, Task 2, Task 5, Task 6.
  - History preservation after move/rename: Task 1, Task 2, Task 6.
  - Existing behavior preservation: Task 3, Task 4, Task 7.
- Placeholder scan:
  - This plan uses concrete file paths, commands, test names, and code snippets.
  - No placeholder markers are intentionally left.
- Type consistency:
  - `MoveItem`, `MoveResult`, `MovePlan`, `MoveConflictError`, `buildMovePlan`, `buildDirectMovePlan`, `executeMovePlan`, and `listObjectNames` are introduced in Task 1 or Task 2 before use.
  - `runningScript` and `onFileMoved` are introduced in Task 4 before use in AppShell.
