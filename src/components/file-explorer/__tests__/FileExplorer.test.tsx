/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import FileExplorer from "@/components/file-explorer/FileExplorer";

global.fetch = jest.fn() as jest.Mock;

const fetchMock = global.fetch as jest.Mock;

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

function okJson(json: unknown = {}) {
  return {
    ok: true,
    json: async () => json,
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
  const moveCall = fetchMock.mock.calls.find(([url]) => url === "/api/files/move");
  if (!moveCall) throw new Error("move API was not called");
  return JSON.parse(moveCall[1].body as string);
}

function lastJsonBody(url: string) {
  const call = fetchMock.mock.calls.find(([calledUrl]) => calledUrl === url);
  if (!call) throw new Error(`${url} was not called`);
  return JSON.parse(call[1].body as string);
}

async function selectCheckbox(name: string) {
  fireEvent.click(await screen.findByRole("checkbox", { name }));
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
  return fetchMock.mock.calls.filter(([url]) => url === "/api/files/move");
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("FileExplorer", () => {
  it("renders file list from API", async () => {
    mockFilesTree([
      { path: "script.js", name: "script.js", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("script.js")).toBeInTheDocument();
    });
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

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

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

  it("renders row checkboxes and selects multiple items without selecting file rows", async () => {
    const onSelectFile = jest.fn();
    mockFilesTree(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={onSelectFile} />);

    const fileCheckbox = await screen.findByRole("checkbox", {
      name: "Select a.ts",
    });
    const folderCheckbox = await screen.findByRole("checkbox", {
      name: "Select other",
    });

    fireEvent.click(fileCheckbox);
    fireEvent.click(folderCheckbox);

    expect(fileCheckbox).toBeChecked();
    expect(folderCheckbox).toBeChecked();
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("dragging a selected row posts all selected items to the target folder", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select a.ts");
    await selectCheckbox("Select other");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/move",
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

  it("dragging an unselected row posts only that row", async () => {
    moveFetchSequence(scriptsTree());

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select c.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/move",
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
        "/api/files/move",
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
        "/api/files/move",
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
        "/api/files/move",
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

  it("successful file move refreshes tree, clears selection, and reports selected path update", async () => {
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
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    await selectCheckbox("Select a.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src/a.ts", "dest/a.ts");
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

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await selectCheckbox("Select c.ts");
    await dragRowToFolder("src/a.ts", "dest/");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/move",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(screen.getByRole("checkbox", { name: "Select c.ts" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select a.ts" })).not.toBeChecked();
  });

  it("successful folder move updates selected file path when selected file was under the folder", async () => {
    const onFileRenamed = jest.fn();
    moveFetchSequence(scriptsTree());

    render(
      <FileExplorer
        selectedFile="src/a.ts"
        onSelectFile={jest.fn()}
        onFileRenamed={onFileRenamed}
      />
    );

    await selectCheckbox("Select src");
    await dragRowToFolder("src/", "dest/");

    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src/a.ts", "dest/src/a.ts");
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

  it("renames a file through the rename API and reports the selected path update", async () => {
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
        "/api/files/rename",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastJsonBody("/api/files/rename")).toEqual({
      from: "src/a.ts",
      to: "src/renamed.ts",
      type: "file",
    });
    await waitFor(() => {
      expect(onFileRenamed).toHaveBeenCalledWith("src/a.ts", "src/renamed.ts");
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/files");
  });

  it("renames a folder through the rename API and refreshes the tree", async () => {
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

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

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
        "/api/files/rename",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(lastJsonBody("/api/files/rename")).toEqual({
      from: "src",
      to: "source",
      type: "folder",
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/files");
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

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

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
        "/api/files",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"name":"auth/login.ts"'),
        })
      );
    });
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

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const folderRow = await screen.findByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "Delete folder" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/folder",
        expect.objectContaining({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "auth#v1" }),
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

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const fileRow = await screen.findByTestId("sidebar-file-item");
    fireEvent.click(
      within(fileRow).getByRole("button", { name: "Delete script" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/files/script%20%231.ts", {
        method: "DELETE",
      });
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
