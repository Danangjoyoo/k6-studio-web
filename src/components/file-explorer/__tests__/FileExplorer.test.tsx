/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
