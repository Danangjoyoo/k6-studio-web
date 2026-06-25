import {
  test,
  expect,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { Readable } from "stream";
import {
  ensureBuckets,
  getMinioClient,
  REPORTS_BUCKET,
} from "../src/lib/minio";

const SHORT_K6_SCRIPT = (marker: string) => `import { sleep } from 'k6';

// ${marker}
export const options = {
  vus: 1,
  duration: '4s',
};

export default function () {
  sleep(1);
}
`;

const ACTIVE_LOCK_K6_SCRIPT = (marker: string) => `import { sleep } from 'k6';

// ${marker}
export const options = {
  vus: 1,
  duration: '12s',
};

export default function () {
  sleep(1);
}
`;

function dataPathSelector(testId: string, path: string) {
  return `[data-testid="${testId}"][data-path=${JSON.stringify(path)}]`;
}

function fileRow(page: Page, path: string) {
  return page.locator(dataPathSelector("sidebar-file-item", path));
}

function folderRow(page: Page, path: string) {
  return page.locator(dataPathSelector("sidebar-folder-item", path));
}

function runnerStatus(page: Page) {
  return page.getByTestId("active-runner-status");
}

function encodeApiPath(path: string) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function waitForRunner(page: Page, activeRunners: 0 | 1, timeout = 90_000) {
  await expect(runnerStatus(page)).toHaveText(
    `Active runner: ${activeRunners}/1`,
    { timeout }
  );
}

async function waitForApp(page: Page) {
  await page.goto("/");
  await expect(page.locator("header")).toBeVisible();
  await waitForRunner(page, 0);
}

async function createScript(page: Page, name: string) {
  await page.getByRole("button", { name: /new script/i }).first().click();
  await page.getByPlaceholder("my-test.ts").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(fileRow(page, name)).toBeVisible({ timeout: 8000 });
}

async function createScriptViaApi(page: Page, name: string) {
  const marker = `e2e-marker-${Date.now()}`;
  const response = await page.request.post("/api/files", {
    data: { name, content: SHORT_K6_SCRIPT(marker) },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await expect(fileRow(page, name)).toBeVisible({ timeout: 8000 });
  return marker;
}

async function createScriptViaApiWithContent(
  page: Page,
  name: string,
  content: string
) {
  const response = await page.request.post("/api/files", {
    data: { name, content },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await expect(fileRow(page, name)).toBeVisible({ timeout: 8000 });
}

async function createReportFixture(page: Page, reportName: string) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? page.url();
  const hostname = new URL(baseURL).hostname;
  const isLocalApp =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";
  if (
    !isLocalApp &&
    process.env.PLAYWRIGHT_ALLOW_DIRECT_MINIO_FIXTURES !== "true"
  ) {
    throw new Error(
      "Deterministic report fixtures seed MinIO directly and require a local app URL, " +
        "or PLAYWRIGHT_ALLOW_DIRECT_MINIO_FIXTURES=true when app/MinIO env alignment is guaranteed."
    );
  }

  await ensureBuckets();
  const client = getMinioClient();
  const html = `<!doctype html><html><body><h1>deterministic-report-fixture</h1><p>${reportName}</p></body></html>`;
  await client.putObject(
    REPORTS_BUCKET,
    reportName,
    Readable.from([html])
  );
}

async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: /new folder/i }).first().click();
  await page.getByPlaceholder("folder-name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(folderRow(page, `${name}/`)).toBeVisible({ timeout: 5000 });
}

async function dragFileToFolderAndWait(
  page: Page,
  filePath: string,
  folderPath: string,
  expectedOk = true
) {
  const source = fileRow(page, filePath);
  const target = folderRow(page, `${folderPath}/`);
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  let response: Response;
  try {
    response = await waitForMoveResponseDuring(
      page,
      () =>
        source.dragTo(target, {
          force: true,
          sourcePosition: { x: 2, y: 10 },
          targetPosition: { x: 2, y: 10 },
        }),
      3000
    );
  } catch {
    response = await waitForMoveResponseDuring(
      page,
      () => dragWithMouse(page, source, target),
      10000
    );
  }

  expect(response.request().postDataJSON()).toEqual({
    items: [{ path: filePath, type: "file" }],
    targetFolder: folderPath,
  });
  expect(response.ok()).toBe(expectedOk);
  return response;
}

async function waitForMoveResponseDuring(
  page: Page,
  action: () => Promise<void>,
  timeout: number
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/files/move" &&
      response.request().method() === "POST",
    { timeout }
  );
  await action();
  return responsePromise;
}

async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Cannot drag because source or target row is not visible");
  }

  const start = {
    x: sourceBox.x + Math.min(40, sourceBox.width - 2),
    y: sourceBox.y + Math.min(10, sourceBox.height / 2),
  };
  const end = {
    x: targetBox.x + Math.min(40, targetBox.width - 2),
    y: targetBox.y + Math.min(10, targetBox.height / 2),
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

async function expectMovedFileVisible(
  page: Page,
  oldPath: string,
  newPath: string
) {
  await expect(fileRow(page, oldPath)).toHaveCount(0, { timeout: 8000 });
  const movedRow = fileRow(page, newPath);
  try {
    await expect(movedRow).toBeVisible({ timeout: 1000 });
  } catch {
    const parentFolder = newPath.split("/").slice(0, -1).join("/");
    await folderRow(page, `${parentFolder}/`).click();
    await expect(movedRow).toBeVisible({ timeout: 8000 });
  }
}

async function expectNoMoveRequestDuring(
  page: Page,
  action: () => Promise<void>
) {
  const moveRequests: string[] = [];
  const onRequest = (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/files/move"
    ) {
      moveRequests.push(request.url());
    }
  };

  page.on("request", onRequest);
  try {
    await action();
    await page.waitForTimeout(500);
  } finally {
    page.off("request", onRequest);
  }
  expect(moveRequests).toHaveLength(0);
}

async function searchFiles(page: Page, query: string) {
  await page.getByRole("searchbox", { name: /search scripts/i }).fill(query);
}

async function selectFile(page: Page, name: string, contentMarker?: string) {
  const expectedPathname = `/api/files/${encodeApiPath(name)}`;
  const fileLoad = page.waitForResponse((response) => {
    return (
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === expectedPathname
    );
  });

  await fileRow(page, name).click();
  await fileLoad;

  if (contentMarker) {
    await expect(page.locator(".monaco-editor")).toContainText(contentMarker, {
      timeout: 15000,
    });
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("k6 Studio E2E", () => {
  test("app loads and shows header with Active runner indicator", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    await waitForRunner(page, 0, 10000);
    await expect(page.getByText("k6 Studio")).toBeVisible();
  });

  test("create script at root, then delete it", async ({ page }) => {
    await waitForApp(page);
    const name = `e2e-root-${Date.now()}.ts`;
    await createScript(page, name);

    const row = fileRow(page, name);
    await row.hover();
    await row.getByRole("button", { name: "Delete script" }).click();

    await expect(fileRow(page, name)).toHaveCount(0, { timeout: 15000 });
  });

  test("create folder then create a nested script inside it", async ({ page }) => {
    await waitForApp(page);
    const folder = `e2e-folder-${Date.now()}`;
    await createFolder(page, folder);

    const row = folderRow(page, `${folder}/`);
    await row.hover();
    await row
      .getByRole("button", { name: "New script here" })
      .click({ force: true });

    await page.getByPlaceholder("my-test.ts").fill("nested.ts");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(fileRow(page, `${folder}/nested.ts`)).toBeVisible({
      timeout: 8000,
    });
    await searchFiles(page, "nested");
    await expect(fileRow(page, `${folder}/nested.ts`)).toBeVisible({
      timeout: 8000,
    });
    await expect(folderRow(page, `${folder}/`)).toBeVisible();
  });

  test("double-click renames a script", async ({ page }) => {
    await waitForApp(page);
    const name = `rename-src-${Date.now()}.ts`;
    const newBaseName = `rename-dst-${Date.now()}`;
    await createScript(page, name);

    await fileRow(page, name).dblclick();
    const input = fileRow(page, name).getByRole("textbox");
    await input.clear();
    await input.fill(newBaseName);
    await input.press("Enter");

    await expect(fileRow(page, newBaseName)).toBeVisible({ timeout: 5000 });
  });

  test("run lock: header shows Active runner 1/1 during a run", async ({ page }) => {
    await waitForApp(page);
    const name = `lock-test-${Date.now()}.ts`;
    const marker = await createScriptViaApi(page, name);
    await selectFile(page, name, marker);

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await waitForRunner(page, 0, 60000);
  });

  test("dashboard renders on second consecutive run", async ({ page }) => {
    test.setTimeout(180_000);
    await waitForApp(page);
    const name = `double-run-${Date.now()}.ts`;
    const marker = await createScriptViaApi(page, name);
    await selectFile(page, name, marker);

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await waitForRunner(page, 0, 60000);

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await page.getByRole("tab", { name: /live dashboard/i }).click();
    await expect(page.locator("iframe[title='k6 Live Dashboard']")).toBeVisible({
      timeout: 35000,
    });
    const dashboardFrame = page.frameLocator("iframe[title='k6 Live Dashboard']");
    await expect(dashboardFrame.getByText("Iteration Rate")).toBeVisible({
      timeout: 30000,
    });
    await expect(dashboardFrame.getByText("Loading...")).toHaveCount(0, {
      timeout: 30000,
    });
    await waitForRunner(page, 0, 60000);
  });

  test("terminal stops streaming when k6 finishes", async ({ page }) => {
    await waitForApp(page);
    const name = `term-stop-${Date.now()}.ts`;
    const marker = await createScriptViaApi(page, name);
    await selectFile(page, name, marker);

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await waitForRunner(page, 0, 60000);
    await expect(page.getByRole("button", { name: /run test/i })).toBeEnabled({
      timeout: 5000,
    });
  });

  test("drag moves a script into a folder", async ({ page }) => {
    await waitForApp(page);
    const stamp = Date.now();
    const script = `drag-${stamp}-a.ts`;
    const folder = `drag-${stamp}-b`;

    await createScript(page, script);
    await createFolder(page, folder);

    await dragFileToFolderAndWait(page, script, folder);

    await expectMovedFileVisible(page, script, `${folder}/${script}`);
  });

  test("duplicate move is rejected and source remains", async ({ page }) => {
    await waitForApp(page);
    const stamp = Date.now();
    const script = `duplicate-${stamp}-a.ts`;
    const folder = `duplicate-${stamp}-b`;

    await createFolder(page, folder);
    await createScriptViaApi(page, script);
    await createScriptViaApi(page, `${folder}/${script}`);

    await dragFileToFolderAndWait(page, script, folder, false);

    await expect(page.getByRole("status")).toContainText(
      /Destination.*exists/i,
      { timeout: 8000 }
    );
    await expect(fileRow(page, script)).toBeVisible();
    await expect(fileRow(page, `${folder}/${script}`)).toBeVisible();
  });

  test("history remains accessible after moving a script", async ({ page }) => {
    await waitForApp(page);
    const stamp = Date.now();
    const script = `history-${stamp}-a.ts`;
    const folder = `history-${stamp}-b`;
    const marker = await createScriptViaApi(page, script);
    await createFolder(page, folder);
    await createReportFixture(page, `${script}-${stamp}.html`);
    await selectFile(page, script, marker);

    await dragFileToFolderAndWait(page, script, folder);
    const movedPath = `${folder}/${script}`;
    await expectMovedFileVisible(page, script, movedPath);

    await fileRow(page, movedPath).click();
    await expect(page.locator("main")).toContainText(movedPath);
    await page.getByRole("tab", { name: /test history/i }).click();

    const movedReportNamePattern = new RegExp(
      `${escapeRegExp(folder)}/${escapeRegExp(script)}-\\d+\\.html`
    );
    const reportRow = page.getByText(movedReportNamePattern).first();
    await expect(reportRow).toBeVisible({
      timeout: 15000,
    });

    const reportRowText = await reportRow.textContent();
    const movedReportName = reportRowText?.match(movedReportNamePattern)?.[0];
    expect(movedReportName).toBeTruthy();

    const reportResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "GET" &&
        new URL(response.url()).pathname ===
          `/api/reports/${encodeURIComponent(movedReportName as string)}`
      );
    });
    await reportRow.click();
    const reportResponse = await reportResponsePromise;
    expect(reportResponse.status()).toBe(200);

    const iframeSelector = `iframe[title=${JSON.stringify(movedReportName)}]`;
    await expect(page.locator(iframeSelector)).toBeVisible();
    const reportFrame = page.frameLocator(iframeSelector);
    await expect(
      reportFrame.getByText("deterministic-report-fixture")
    ).toBeVisible();
  });

  test("running script cannot be moved", async ({ page }) => {
    await waitForApp(page);
    const stamp = Date.now();
    const script = `active-${stamp}-a.ts`;
    const folder = `active-${stamp}-b`;
    const marker = `e2e-marker-${stamp}`;
    await createScriptViaApiWithContent(
      page,
      script,
      ACTIVE_LOCK_K6_SCRIPT(marker)
    );
    await createFolder(page, folder);
    await selectFile(page, script, marker);

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);

    await expect(
      fileRow(page, script).locator("input[type='checkbox']")
    ).toBeDisabled();
    await expectNoMoveRequestDuring(page, async () => {
      try {
        await fileRow(page, script).dragTo(folderRow(page, `${folder}/`), {
          timeout: 2000,
        });
      } catch {
        // A disabled drag source may reject before any browser drag events fire.
      }
    });
    await expect(fileRow(page, script)).toBeVisible();
    await expect(fileRow(page, `${folder}/${script}`)).toHaveCount(0);

    await waitForRunner(page, 0, 70000);
  });
});
