import { test, expect, type Page } from "@playwright/test";
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

async function createReportFixture(reportName: string) {
  await ensureBuckets();
  const client = getMinioClient();
  const html = `<!doctype html><html><body><h1>${reportName}</h1></body></html>`;
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

async function dispatchDragTo(
  source: ReturnType<typeof fileRow>,
  target: ReturnType<typeof folderRow>
) {
  const dataTransfer = await source.page().evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function dragFileToFolder(page: Page, filePath: string, folderPath: string) {
  await dispatchDragTo(fileRow(page, filePath), folderRow(page, `${folderPath}/`));
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
    const script = `drag-move-${stamp}.ts`;
    const folder = `drag-target-${stamp}`;

    await createScript(page, script);
    await createFolder(page, folder);

    await dragFileToFolder(page, script, folder);

    await expect(fileRow(page, `${folder}/${script}`)).toBeVisible({
      timeout: 8000,
    });
    await expect(fileRow(page, script)).toHaveCount(0);
  });

  test("duplicate move is rejected and source remains", async ({ page }) => {
    await waitForApp(page);
    const stamp = Date.now();
    const script = `duplicate-move-${stamp}.ts`;
    const folder = `duplicate-target-${stamp}`;

    await createFolder(page, folder);
    await createScriptViaApi(page, script);
    await createScriptViaApi(page, `${folder}/${script}`);

    await dragFileToFolder(page, script, folder);

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
    const script = `history-move-${stamp}.ts`;
    const folder = `history-target-${stamp}`;
    const marker = await createScriptViaApi(page, script);
    await createFolder(page, folder);
    await createReportFixture(`${script}-${stamp}.html`);
    await selectFile(page, script, marker);

    await dragFileToFolder(page, script, folder);
    const movedPath = `${folder}/${script}`;
    await expect(fileRow(page, movedPath)).toBeVisible({ timeout: 8000 });

    await fileRow(page, movedPath).click();
    await expect(page.locator("main")).toContainText(movedPath);
    await page.getByRole("tab", { name: /test history/i }).click();

    const movedReportName = new RegExp(
      `${escapeRegExp(folder)}/${escapeRegExp(script)}-\\d+\\.html`
    );
    await expect(page.getByText(movedReportName)).toBeVisible({
      timeout: 15000,
    });
  });

  test("running script cannot be moved", async ({ page }) => {
    await waitForApp(page);
    const stamp = Date.now();
    const script = `active-lock-${stamp}.ts`;
    const folder = `active-target-${stamp}`;
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
    await dragFileToFolder(page, script, folder);
    await expect(fileRow(page, script)).toBeVisible();
    await expect(fileRow(page, `${folder}/${script}`)).toHaveCount(0);

    await waitForRunner(page, 0, 70000);
  });
});
