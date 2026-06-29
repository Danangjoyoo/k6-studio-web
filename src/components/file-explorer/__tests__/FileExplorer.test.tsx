/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import FileExplorer from "@/components/file-explorer/FileExplorer";

global.fetch = jest.fn() as jest.Mock;

const fetchMock = global.fetch as jest.Mock;
const defaultFilesUrl = "/k6/api/files?namespace=default";

function mockFilesTree(tree: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      files: [],
      tree,
    }),
  });
}

function mockFetchSequence(...responses: Array<{ ok?: boolean; json?: unknown }>) {
  fetchMock.mockReset();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok ?? true,
      json: async () => response.json ?? {},
    });
  }
}

function scriptsTree() {
  return [
    {
      path: "src/",
      name: "src",
      type: "folder",
      children: [
        { path: "src/a.ts", name: "a.ts", type: "file" },
        { path: "src/b.ts", name: "b.ts", type: "file" },
      ],
    },
    {
      path: "other/",
      name: "other",
      type: "folder",
      children: [
        { path: "other/c.ts", name: "c.ts", type: "file" },
      ],
    },
    { path: "dest/", name: "dest", type: "folder", children: [] },
  ];
}

function nestedScriptsTree() {
  return [
    {
      path: "src/",
      name: "src",
      type: "folder",
      children: [
        {
          path: "src/nested/",
          name: "nested",
          type: "folder",
          children: [
            { path: "src/nested/a.ts", name: "a.ts", type: "file" },
          ],
        },
      ],
    },
    { path: "dest/", name: "dest", type: "folder", children: [] },
  ];
}

function activeRunTree() {
  return [
    {
      path: "suite/",
      name: "suite",
      type: "folder",
      children: [
        { path: "suite/run.ts", name: "run.ts", type: "file" },
      ],
    },
    { path: "other.ts", name: "other.ts", type: "file" },
    { path: "dest/", name: "dest", type: "folder", children: [] },
  ];
}

function activeRunRangeTree() {
  return [
    { path: "before.ts", name: "before.ts", type: "file" },
    {
      path: "suite/",
      name: "suite",
      type: "folder",
      children: [
        { path: "suite/run.ts", name: "run.ts", type: "file" },
      ],
    },
    { path: "after.ts", name: "after.ts", type: "file" },
    { path: "dest/", name: "dest", type: "folder", children: [] },
  ];
}

function okJson(json: unknown = {}) {
  return {
    ok: true,
    json: async () => json,
  };
}

function deferredJson(json: unknown) {
  let resolve!: () => void;
  const released = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    resolve,
    response: Promise.resolve({
      ok: true,
      json: async () => {
        await released;
        return json;
      },
    }),
  };
}

function moveFetchSequence(
  initialTree: unknown[],
  refreshedTree: unknown[] = initialTree,
  moveResponse: { ok?: boolean; json?: unknown } = { ok: true, json: {} }
) {
  fetchMock.mockReset();
  fetchMock
    .mockResolvedValueOnce(okJson({ files: [], tree: initialTree }))
    .mockResolvedValueOnce({
      ok: moveResponse.ok ?? true,
      json: async () => moveResponse.json ?? {},
    })
    .mockResolvedValueOnce(okJson({ files: [], tree: refreshedTree }));
}

function lastFetchBody() {
  const moveCall = fetchMock.mock.calls.find(([url]) => url === "/k6/api/files/move");
  if (!moveCall) throw new Error("move API was not called");
  return withoutNamespace(JSON.parse(moveCall[1].body as string));
}

function lastJsonBody(url: string) {
  const call = fetchMock.mock.calls.find(([calledUrl]) => calledUrl === url);
  if (!call) throw new Error(`${url} was not called`);
  return withoutNamespace(JSON.parse(call[1].body as string));
}

function withoutNamespace(body: Record<string, unknown>) {
  const next = { ...body };
  delete next.namespace;
  return next;
}

function rawJsonBody(url: string) {
  const call = fetchMock.mock.calls.find(
    ([calledUrl, init]) => calledUrl === url && init?.body
  );
  if (!call) throw new Error(`${url} was not called`);
  return JSON.parse(call[1].body as string);
}

async function selectCheckbox(name: string) {
  const checkbox = await screen.findByRole("checkbox", { name });
  const row = checkbox.closest("[data-testid='sidebar-file-item'],[data-testid='sidebar-folder-item']");
  if (row) fireEvent.focus(row);
  fireEvent.click(checkbox);
}

async function rowByPath(rowPath: string) {
  await screen.findByText(rowPath.split("/").filter(Boolean).pop() ?? rowPath);
  const testId = rowPath.endsWith("/") ? "sidebar-folder-item" : "sidebar-file-item";
  const row = screen
    .getAllByTestId(testId)
    .find((item) => item.getAttribute("data-path") === rowPath);
  if (!row) throw new Error(`row not found: ${rowPath}`);
  return row;
}

async function ctrlClickRow(rowPath: string) {
  fireEvent.click(await rowByPath(rowPath), { ctrlKey: true });
}

async function dragRowToFolder(rowPath: string, folderPath: string) {
  await screen.findByText(rowPath.split("/").filter(Boolean).pop() ?? rowPath);
  const source = screen
    .getAllByTestId(rowPath.endsWith("/") ? "sidebar-folder-item" : "sidebar-file-item")
    .find((item) => item.getAttribute("data-path") === rowPath);
  if (!source) throw new Error(`source row not found: ${rowPath}`);
  const target = screen
    .getAllByTestId("sidebar-folder-item")
    .find((item) => item.getAttribute("data-path") === folderPath);
  if (!target) throw new Error(`folder target not found: ${folderPath}`);
  await act(async () => {
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await Promise.resolve();
  });
}

async function dragRowToRoot(rowPath: string) {
  await screen.findByText(rowPath.split("/").filter(Boolean).pop() ?? rowPath);
  const source = screen
    .getAllByTestId(rowPath.endsWith("/") ? "sidebar-folder-item" : "sidebar-file-item")
    .find((item) => item.getAttribute("data-path") === rowPath);
  if (!source) throw new Error(`source row not found: ${rowPath}`);
  const target = await screen.findByTestId("file-explorer-root-drop-target");
  await act(async () => {
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await Promise.resolve();
  });
}

async function dragRowToFile(rowPath: string, filePath: string) {
  await screen.findByText(rowPath.split("/").filter(Boolean).pop() ?? rowPath);
  const source = screen
    .getAllByTestId(rowPath.endsWith("/") ? "sidebar-folder-item" : "sidebar-file-item")
    .find((item) => item.getAttribute("data-path") === rowPath);
  if (!source) throw new Error(`source row not found: ${rowPath}`);
  const target = screen
    .getAllByTestId("sidebar-file-item")
    .find((item) => item.getAttribute("data-path") === filePath);
  if (!target) throw new Error(`file target not found: ${filePath}`);
  await act(async () => {
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await Promise.resolve();
  });
}

function moveApiCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === "/k6/api/files/move");
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("FileExplorer", () => {
  it("fetches the initial tree for the selected namespace", async () => {
    mockFilesTree([
      { path: "script.js", name: "script.js", type: "file" },
    ]);

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    await screen.findByText("script.js");
    expect(fetchMock).toHaveBeenCalledWith("/k6/api/files?namespace=team-a");
  });

  it("renders file list from API", async () => {
    mockFilesTree([
      { path: "script.js", name: "script.js", type: "file" },
    ]);

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("script.js")).toBeInTheDocument();
    });
    expect(screen.getByRole("tree", { name: "Scripts" })).toBeInTheDocument();
  });

  it("ignores stale namespace tree responses after switching namespaces", async () => {
    const namespaceA = deferredJson({
      files: [],
      tree: [{ path: "a-only.ts", name: "a-only.ts", type: "file" }],
    });
    const namespaceB = deferredJson({
      files: [],
      tree: [{ path: "b-only.ts", name: "b-only.ts", type: "file" }],
    });
    fetchMock.mockImplementation((url: string) => {
      if (url === "/k6/api/files?namespace=team-a") return namespaceA.response;
      if (url === "/k6/api/files?namespace=team-b") return namespaceB.response;
      throw new Error(`unexpected url: ${url}`);
    });

    const { rerender } = render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );
    rerender(
      <FileExplorer
        namespace="team-b"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    namespaceB.resolve();
    expect(await screen.findByText("b-only.ts")).toBeInTheDocument();

    await act(async () => {
      namespaceA.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("b-only.ts")).toBeInTheDocument();
    expect(screen.queryByText("a-only.ts")).not.toBeInTheDocument();
  });

  it("adds stable test targets to file and folder rows", async () => {
    mockFilesTree([
      {
        path: "auth/",
        name: "auth",
        type: "folder",
        children: [
          { path: "auth/login.ts", name: "login.ts", type: "file" },
        ],
      },
    ]);

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    await screen.findByText("auth");

    expect(screen.getByTestId("sidebar-folder-item")).toHaveAttribute(
      "data-path",
      "auth/"
    );
    expect(screen.getByTestId("sidebar-file-item")).toHaveAttribute(
      "data-path",
      "auth/login.ts"
    );
  });

  it("enables checkbox hover reveal only while shift is held", async () => {
    mockFilesTree([
      { path: "script.ts", name: "script.ts", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const row = await rowByPath("script.ts");
    const control = within(row).getByTestId("row-selection-control");

    expect(control).toHaveAttribute("data-selection-hover-enabled", "false");
    expect(control.className).not.toContain("group-hover:w-4");

    fireEvent.keyDown(window, { key: "Shift" });

    await waitFor(() => {
      expect(control).toHaveAttribute("data-selection-hover-enabled", "true");
    });
    expect(control.className).toContain("group-hover:w-4");

    fireEvent.keyUp(window, { key: "Shift" });

    await waitFor(() => {
      expect(control).toHaveAttribute("data-selection-hover-enabled", "false");
    });
  });

  it("keeps checkbox controls visible while selected and collapses them after clearing selection", async () => {
    mockFilesTree([
      { path: "script.ts", name: "script.ts", type: "file" },
      { path: "other.ts", name: "other.ts", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const scriptRow = await rowByPath("script.ts");
    const otherRow = await rowByPath("other.ts");
    const scriptControl = within(scriptRow).getByTestId("row-selection-control");
    const otherControl = within(otherRow).getByTestId("row-selection-control");

    fireEvent.click(scriptRow, { ctrlKey: true });

    await waitFor(() => {
      expect(scriptControl).toHaveAttribute("data-selection-visible", "true");
      expect(otherControl).toHaveAttribute("data-selection-visible", "true");
    });

    fireEvent.click(scriptRow, { ctrlKey: true });

    await waitFor(() => {
      expect(scriptControl).toHaveAttribute("data-selection-visible", "false");
      expect(otherControl).toHaveAttribute("data-selection-visible", "false");
      expect(scriptControl).toHaveClass("w-0");
      expect(otherControl).toHaveClass("w-0");
    });
  });

  it("ctrl-click toggles move selection without selecting file rows", async () => {
    const onSelectFile = jest.fn();
    mockFilesTree(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={onSelectFile} />);

    const fileRow = await rowByPath("src/a.ts");
    const folderRow = await rowByPath("other/");

    expect(screen.getByText("c.ts")).toBeInTheDocument();

    fireEvent.click(fileRow, { ctrlKey: true });
    fireEvent.click(folderRow, { ctrlKey: true });

    expect(within(fileRow).getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();
    expect(within(folderRow).getByRole("checkbox", { name: "Select other" })).toBeChecked();
    expect(screen.getByText("c.ts")).toBeInTheDocument();
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("shift-click selects a visible range and drag posts selected files", async () => {
    moveFetchSequence(scriptsTree());

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    const first = await rowByPath("src/a.ts");
    const second = await rowByPath("src/b.ts");
    fireEvent.click(first, { ctrlKey: true });
    fireEvent.click(second, { shiftKey: true });
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(rawJsonBody("/k6/api/files/move")).toEqual({
      namespace: "team-a",
      items: [
        { path: "src/a.ts", type: "file" },
        { path: "src/b.ts", type: "file" },
      ],
      targetFolder: "dest",
    });
  });

  it("resets selection, expanded folders, move status, and tree when namespace changes", async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ files: [], tree: scriptsTree() }))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Move failed" }),
      })
      .mockResolvedValueOnce(okJson({ files: [], tree: [] }));

    const { rerender } = render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    await ctrlClickRow("src/a.ts");
    await dragRowToFolder("src/a.ts", "dest/");
    expect(await screen.findByRole("status")).toHaveTextContent("Move failed");

    rerender(
      <FileExplorer
        namespace="team-b"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/k6/api/files?namespace=team-b");
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select a.ts" })).not.toBeInTheDocument();
  });

  it("checkbox selection anchors shift-click range selection", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select a.ts");
    fireEvent.click(await rowByPath("other/"), { shiftKey: true });
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastFetchBody()).toEqual({
      items: [
        { path: "src/a.ts", type: "file" },
        { path: "src/b.ts", type: "file" },
        { path: "other", type: "folder" },
      ],
      targetFolder: "dest",
    });
  });

  it("space toggles move selection for a focused file row", async () => {
    mockFilesTree(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const fileRow = await rowByPath("src/a.ts");
    fileRow.focus();
    expect(fileRow).toHaveFocus();

    fireEvent.keyDown(fileRow, { key: " ", code: "Space" });

    expect(within(fileRow).getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();
  });

  it("keeps collapsed folders collapsed after a successful move refresh", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const srcRow = await rowByPath("src/");
    fireEvent.click(srcRow);

    expect(screen.queryByText("a.ts")).not.toBeInTheDocument();

    await dragRowToFolder("other/c.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("a.ts")).not.toBeInTheDocument();
    });
  });

  it("shift-click range skips running-script rows", async () => {
    mockFilesTree(activeRunRangeTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={jest.fn()}
        globalRunningScript="suite/run.ts"
      />
    );

    const beforeRow = await rowByPath("before.ts");
    const suiteRow = await rowByPath("suite/");
    const runRow = await rowByPath("suite/run.ts");
    const afterRow = await rowByPath("after.ts");
    fireEvent.click(beforeRow, { ctrlKey: true });
    fireEvent.click(afterRow, { shiftKey: true });

    expect(within(beforeRow).getByRole("checkbox", { name: "Select before.ts" })).toBeChecked();
    expect(within(suiteRow).getByRole("checkbox", { name: "Select suite" })).toBeDisabled();
    expect(within(suiteRow).getByRole("checkbox", { name: "Select suite" })).not.toBeChecked();
    expect(within(runRow).getByRole("checkbox", { name: "Select run.ts" })).toBeDisabled();
    expect(within(runRow).getByRole("checkbox", { name: "Select run.ts" })).not.toBeChecked();
    expect(within(afterRow).getByRole("checkbox", { name: "Select after.ts" })).toBeChecked();
  });

  it("clears selected rows when they become active-run disabled", async () => {
    mockFilesTree(scriptsTree());

    const { rerender } = render(
      <FileExplorer selectedFile={null} onSelectFile={jest.fn()} />
    );

    await ctrlClickRow("src/");
    await ctrlClickRow("src/a.ts");

    expect(screen.getByRole("checkbox", { name: "Select src" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();

    rerender(
      <FileExplorer
        selectedFile={null}
        onSelectFile={jest.fn()}
        globalRunningScript="src/a.ts"
      />
    );

    const folderRow = await rowByPath("src/");
    const fileRow = await rowByPath("src/a.ts");
    const folderCheckbox = within(folderRow).getByRole("checkbox", {
      name: "Select src",
    });
    const fileCheckbox = within(fileRow).getByRole("checkbox", {
      name: "Select a.ts",
    });

    await waitFor(() => {
      expect(folderCheckbox).not.toBeChecked();
      expect(fileCheckbox).not.toBeChecked();
    });
    expect(folderCheckbox).toBeDisabled();
    expect(fileCheckbox).toBeDisabled();
    expect(folderRow).not.toHaveAttribute("aria-selected", "true");
    expect(fileRow).not.toHaveAttribute("aria-selected", "true");
  });

  it("shift-click keeps an already selected target when the range anchor disappeared", async () => {
    mockFetchSequence(
      { json: { files: [], tree: scriptsTree() } },
      { json: {} },
      {
        json: {
          files: [],
          tree: [
            {
              path: "src/",
              name: "src",
              type: "folder",
              children: [{ path: "src/b.ts", name: "b.ts", type: "file" }],
            },
            {
              path: "other/",
              name: "other",
              type: "folder",
              children: [
                { path: "other/c.ts", name: "c.ts", type: "file" },
              ],
            },
            { path: "dest/", name: "dest", type: "folder", children: [] },
          ],
        },
      }
    );

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await ctrlClickRow("src/b.ts");
    await ctrlClickRow("src/a.ts");

    fireEvent.click(
      within(await rowByPath("src/a.ts")).getByRole("button", {
        name: "Delete script",
      })
    );

    await waitFor(() => {
      expect(screen.queryByText("a.ts")).not.toBeInTheDocument();
    });

    const targetRow = await rowByPath("src/b.ts");
    expect(within(targetRow).getByRole("checkbox", { name: "Select b.ts" })).toBeChecked();

    fireEvent.click(targetRow, { shiftKey: true });

    expect(within(targetRow).getByRole("checkbox", { name: "Select b.ts" })).toBeChecked();
  });

  it("dragging a selected row posts all selected items to the target folder", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await ctrlClickRow("src/a.ts");
    await ctrlClickRow("other/");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastFetchBody()).toEqual({
      items: [
        { path: "src/a.ts", type: "file" },
        { path: "other", type: "folder" },
      ],
      targetFolder: "dest",
    });
  });

  it("reports every moved file and folder as completed path operations", async () => {
    const onFileRenamed = jest.fn();
    moveFetchSequence(scriptsTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    await ctrlClickRow("src/a.ts");
    await ctrlClickRow("other/");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src/a.ts", "dest/a.ts", "file");
    });
    expect(onFileRenamed).toHaveBeenCalledWith("other", "dest/other", "folder");
  });

  it("dragging an unselected row posts only that row", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select c.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastFetchBody()).toEqual({
      items: [{ path: "src/a.ts", type: "file" }],
      targetFolder: "dest",
    });
  });

  it("prunes redundant selected children when an ancestor folder is selected", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select src");
    await selectCheckbox("Select a.ts");
    await dragRowToFolder("src/", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastFetchBody()).toEqual({
      items: [{ path: "src", type: "folder" }],
      targetFolder: "dest",
    });
  });

  it("prunes redundant selected descendant folders when an ancestor folder is selected", async () => {
    moveFetchSequence(nestedScriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select src");
    await selectCheckbox("Select nested");
    await dragRowToFolder("src/", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastFetchBody()).toEqual({
      items: [{ path: "src", type: "folder" }],
      targetFolder: "dest",
    });
  });

  it("drops a nested file on the root drop target with an empty target folder", async () => {
    moveFetchSequence(nestedScriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await dragRowToRoot("src/nested/a.ts");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastFetchBody()).toEqual({
      items: [{ path: "src/nested/a.ts", type: "file" }],
      targetFolder: "",
    });
  });

  it("dropping onto a file row is an explicit no-op", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await dragRowToFile("src/a.ts", "src/b.ts");

    expect(moveApiCalls()).toHaveLength(0);
  });

  it("successful file move refreshes tree, clears selection, and reports the file path operation", async () => {
    const onFileRenamed = jest.fn();
    moveFetchSequence(scriptsTree(), [
      {
        path: "dest/",
        name: "dest",
        type: "folder",
        children: [{ path: "dest/a.ts", name: "a.ts", type: "file" }],
      },
    ]);

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    await selectCheckbox("Select a.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src/a.ts", "dest/a.ts", "file");
    });
    expect(screen.queryByRole("checkbox", { name: "Select a.ts" })).not.toBeChecked();
  });

  it("successful unselected file move preserves unrelated selected rows", async () => {
    moveFetchSequence(scriptsTree(), [
      {
        path: "src/",
        name: "src",
        type: "folder",
        children: [{ path: "src/b.ts", name: "b.ts", type: "file" }],
      },
      {
        path: "other/",
        name: "other",
        type: "folder",
        children: [{ path: "other/c.ts", name: "c.ts", type: "file" }],
      },
      {
        path: "dest/",
        name: "dest",
        type: "folder",
        children: [{ path: "dest/a.ts", name: "a.ts", type: "file" }],
      },
    ]);

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    await selectCheckbox("Select c.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(screen.getByRole("checkbox", { name: "Select c.ts" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select a.ts" })).not.toBeChecked();
  });

  it("successful folder move reports the folder path operation", async () => {
    const onFileRenamed = jest.fn();
    moveFetchSequence(scriptsTree());

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    await selectCheckbox("Select src");
    await dragRowToFolder("src/", "dest/");

    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src", "dest/src", "folder");
    });
  });

  it("failed move displays an accessible status and preserves selection", async () => {
    moveFetchSequence(scriptsTree(), scriptsTree(), {
      ok: false,
      json: { error: "Destination already exists: dest/a.ts" },
    });

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select a.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    expect(
      await screen.findByRole("status")
    ).toHaveTextContent("Destination already exists: dest/a.ts");
    expect(screen.getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();
  });

  it("disables move affordances for a running script and containing folder but keeps file click", async () => {
    const onSelectFile = jest.fn();
    mockFilesTree(scriptsTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={onSelectFile}
        globalRunningScript="src/a.ts"
      />
    );

    const runningCheckbox = await screen.findByRole("checkbox", {
      name: "Select a.ts",
    });
    const folderCheckbox = await screen.findByRole("checkbox", {
      name: "Select src",
    });
    const runningRow = screen
      .getAllByTestId("sidebar-file-item")
      .find((item) => item.getAttribute("data-path") === "src/a.ts");
    if (!runningRow) throw new Error("running row missing");

    expect(runningCheckbox).toBeDisabled();
    expect(folderCheckbox).toBeDisabled();

    fireEvent.dragStart(runningRow);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(runningRow);
    expect(onSelectFile).toHaveBeenCalledWith("src/a.ts");
  });

  it("disables move controls for the running script and containing folder while unrelated files remain movable", async () => {
    const onSelectFile = jest.fn();
    mockFilesTree(activeRunTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={onSelectFile}
        globalRunningScript="suite/run.ts"
      />
    );

    const suiteCheckbox = await screen.findByRole("checkbox", {
      name: "Select suite",
    });
    const runCheckbox = screen.getByRole("checkbox", {
      name: "Select run.ts",
    });
    const otherCheckbox = screen.getByRole("checkbox", {
      name: "Select other.ts",
    });
    const suiteRow = screen
      .getAllByTestId("sidebar-folder-item")
      .find((item) => item.getAttribute("data-path") === "suite/");
    const runRow = screen
      .getAllByTestId("sidebar-file-item")
      .find((item) => item.getAttribute("data-path") === "suite/run.ts");
    const otherRow = screen
      .getAllByTestId("sidebar-file-item")
      .find((item) => item.getAttribute("data-path") === "other.ts");
    if (!suiteRow || !runRow || !otherRow) {
      throw new Error("expected active run tree rows");
    }

    expect(suiteCheckbox).toBeDisabled();
    expect(runCheckbox).toBeDisabled();
    expect(otherCheckbox).not.toBeDisabled();
    expect(suiteRow).toHaveAttribute("draggable", "false");
    expect(runRow).toHaveAttribute("draggable", "false");
    expect(otherRow).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(suiteRow);
    fireEvent.dragStart(runRow);
    expect(moveApiCalls()).toHaveLength(0);
    fireEvent.click(runRow);
    expect(onSelectFile).toHaveBeenCalledWith("suite/run.ts");
  });

  it("disables move controls for every active running script", async () => {
    mockFilesTree(scriptsTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={jest.fn()}
        globalRunningScripts={["src/a.ts", "other/c.ts"]}
      />
    );

    expect(
      await screen.findByRole("checkbox", { name: "Select src" })
    ).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select a.ts" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select other" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select c.ts" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select b.ts" })).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select dest" })).not.toBeDisabled();
  });

  it("does not move when dragging the running script onto a valid folder target", async () => {
    mockFilesTree(scriptsTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={jest.fn()}
        globalRunningScript="src/a.ts"
      />
    );

    await dragRowToFolder("src/a.ts", "dest/");

    expect(moveApiCalls()).toHaveLength(0);
  });

  it("does not move when dragging a folder containing the running script onto a valid folder target", async () => {
    mockFilesTree(scriptsTree());

    render(
      <FileExplorer
        selectedFile={null}
        onSelectFile={jest.fn()}
        globalRunningScript="src/a.ts"
      />
    );

    await dragRowToFolder("src/", "dest/");

    expect(moveApiCalls()).toHaveLength(0);
  });

  it("renames a file through the rename API and reports the file path operation", async () => {
    const onFileRenamed = jest.fn();
    mockFetchSequence(
      { json: { files: [], tree: scriptsTree() } },
      { json: {} },
      {
        json: {
          files: [],
          tree: [
            {
              path: "src/",
              name: "src",
              type: "folder",
              children: [
                { path: "src/renamed.ts", name: "renamed.ts", type: "file" },
                { path: "src/b.ts", name: "b.ts", type: "file" },
              ],
            },
          ],
        },
      }
    );

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    const fileRow = await screen.findByText("a.ts").then(() =>
      screen
        .getAllByTestId("sidebar-file-item")
        .find((item) => item.getAttribute("data-path") === "src/a.ts")
    );
    if (!fileRow) throw new Error("file row missing");

    fireEvent.doubleClick(fileRow);
    const input = within(fileRow).getByDisplayValue("a.ts");
    fireEvent.change(input, { target: { value: "renamed.ts" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/rename",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastJsonBody("/k6/api/files/rename")).toEqual({
      from: "src/a.ts",
      to: "src/renamed.ts",
      type: "file",
    });
    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src/a.ts", "src/renamed.ts", "file");
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/k6/api/files?namespace=team-a");
  });

  it("does not refresh or report path updates when file rename fails", async () => {
    const onFileRenamed = jest.fn();
    mockFetchSequence(
      { json: { files: [], tree: scriptsTree() } },
      { ok: false, json: { error: "Destination already exists: src/renamed.ts" } }
    );

    render(
      <FileExplorer
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    const fileRow = await screen.findByText("a.ts").then(() =>
      screen
        .getAllByTestId("sidebar-file-item")
        .find((item) => item.getAttribute("data-path") === "src/a.ts")
    );
    if (!fileRow) throw new Error("file row missing");

    fireEvent.doubleClick(fileRow);
    const input = within(fileRow).getByDisplayValue("a.ts");
    fireEvent.change(input, { target: { value: "renamed.ts" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("status")
    ).toHaveTextContent("Destination already exists: src/renamed.ts");
    expect(onFileRenamed).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => url === defaultFilesUrl)).toHaveLength(1);
  });

  it("renames a folder through the rename API, refreshes, and reports the folder path operation", async () => {
    const onFileRenamed = jest.fn();
    mockFetchSequence(
      { json: { files: [], tree: scriptsTree() } },
      { json: {} },
      {
        json: {
          files: [],
          tree: [
            {
              path: "source/",
              name: "source",
              type: "folder",
              children: [
                { path: "source/a.ts", name: "a.ts", type: "file" },
                { path: "source/b.ts", name: "b.ts", type: "file" },
              ],
            },
          ],
        },
      }
    );

    render(
      <FileExplorer
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    const folderRow = await screen.findByText("src").then(() =>
      screen
        .getAllByTestId("sidebar-folder-item")
        .find((item) => item.getAttribute("data-path") === "src/")
    );
    if (!folderRow) throw new Error("folder row missing");

    fireEvent.doubleClick(folderRow);
    const input = within(folderRow).getByDisplayValue("src");
    fireEvent.change(input, { target: { value: "source" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/rename",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastJsonBody("/k6/api/files/rename")).toEqual({
      from: "src",
      to: "source",
      type: "folder",
    });
    expect(fetchMock.mock.calls[2][0]).toBe(defaultFilesUrl);
    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src", "source", "folder");
    });
  });

  it("does not refresh or report selected descendant updates when folder rename fails", async () => {
    const onFileRenamed = jest.fn();
    mockFetchSequence(
      { json: { files: [], tree: scriptsTree() } },
      { ok: false, json: { error: "Cannot rename folder while script is running" } }
    );

    render(
      <FileExplorer
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    const folderRow = await screen.findByText("src").then(() =>
      screen
        .getAllByTestId("sidebar-folder-item")
        .find((item) => item.getAttribute("data-path") === "src/")
    );
    if (!folderRow) throw new Error("folder row missing");

    fireEvent.doubleClick(folderRow);
    const input = within(folderRow).getByDisplayValue("src");
    fireEvent.change(input, { target: { value: "source" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("status")
    ).toHaveTextContent("Cannot rename folder while script is running");
    expect(onFileRenamed).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => url === defaultFilesUrl)).toHaveLength(1);
  });

  it("opens one folder-scoped script dialog and creates the script under that folder", async () => {
    mockFetchSequence(
      {
        json: {
          files: [],
          tree: [
            { path: "auth/", name: "auth", type: "folder", children: [] },
          ],
        },
      },
      { json: { name: "auth/login.ts" } },
      {
        json: {
          files: [],
          tree: [
            {
              path: "auth/",
              name: "auth",
              type: "folder",
              children: [
                { path: "auth/login.ts", name: "login.ts", type: "file" },
              ],
            },
          ],
        },
      }
    );

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    const folderRow = await screen.findByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "New script here" })
    );

    expect(
      await screen.findByRole("dialog", { name: "New script" })
    ).toBeInTheDocument();

    fireEvent.change(await screen.findByPlaceholderText("my-test.ts"), {
      target: { value: "login" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
    expect(rawJsonBody("/k6/api/files")).toMatchObject({
      namespace: "team-a",
      name: "auth/login.ts",
    });
  });

  it("opens one folder-scoped folder dialog and creates the folder under that folder", async () => {
    mockFetchSequence(
      {
        json: {
          files: [],
          tree: [
            { path: "auth/", name: "auth", type: "folder", children: [] },
          ],
        },
      },
      { json: { path: "auth/nested" } },
      {
        json: {
          files: [],
          tree: [
            {
              path: "auth/",
              name: "auth",
              type: "folder",
              children: [
                { path: "auth/nested/", name: "nested", type: "folder", children: [] },
              ],
            },
          ],
        },
      }
    );

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    const folderRow = await screen.findByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "New folder here" })
    );

    expect(
      await screen.findByRole("dialog", { name: "New folder in auth/" })
    ).toBeInTheDocument();

    fireEvent.change(await screen.findByPlaceholderText("folder-name"), {
      target: { value: "nested" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/folder",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
    expect(rawJsonBody("/k6/api/files/folder")).toEqual({
      namespace: "team-a",
      path: "auth/nested",
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/k6/api/files?namespace=team-a");
  });

  it("normalizes folder delete requests through the folder API", async () => {
    mockFetchSequence(
      {
        json: {
          files: [],
          tree: [
            { path: "auth#v1///", name: "auth#v1", type: "folder", children: [] },
          ],
        },
      },
      { json: {} },
      { json: { files: [], tree: [] } }
    );

    render(
      <FileExplorer
        namespace="team-a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    const folderRow = await screen.findByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "Delete folder" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/folder",
        expect.objectContaining({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ namespace: "team-a", path: "auth#v1" }),
        })
      );
    });
  });

  it("encodes file delete URLs while preserving script names", async () => {
    mockFetchSequence(
      {
        json: {
          files: [],
          tree: [
            { path: "script #1.ts", name: "script #1.ts", type: "file" },
          ],
        },
      },
      { json: {} },
      { json: { files: [], tree: [] } }
    );

    render(
      <FileExplorer
        namespace="team a"
        selectedFile={null}
        onSelectFile={jest.fn()}
      />
    );

    const fileRow = await screen.findByTestId("sidebar-file-item");
    fireEvent.click(
      within(fileRow).getByRole("button", { name: "Delete script" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/files/script%20%231.ts?namespace=team%20a",
        { method: "DELETE" }
      );
    });
  });

  it("renders a search box under the create toolbar", async () => {
    mockFilesTree([
      { path: "script.js", name: "script.js", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    expect(
      await screen.findByRole("searchbox", { name: /search scripts/i })
    ).toBeInTheDocument();
  });

  it("filters files by name and keeps matching folder ancestors", async () => {
    mockFilesTree([
      {
        path: "auth/",
        name: "auth",
        type: "folder",
        children: [
          { path: "auth/login.ts", name: "login.ts", type: "file" },
          { path: "auth/logout.ts", name: "logout.ts", type: "file" },
        ],
      },
      { path: "checkout.ts", name: "checkout.ts", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    fireEvent.change(
      await screen.findByRole("searchbox", { name: /search scripts/i }),
      { target: { value: "login" } }
    );

    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("login.ts")).toBeInTheDocument();
    expect(screen.queryByText("logout.ts")).not.toBeInTheDocument();
    expect(screen.queryByText("checkout.ts")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select login.ts" })).toBeInTheDocument();
  });

  it("uses a constrained scroll region for long file trees", async () => {
    mockFilesTree([
      { path: "script.js", name: "script.js", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    expect(await screen.findByTestId("file-explorer-scroll")).toHaveClass(
      "min-h-0"
    );
  });
});
