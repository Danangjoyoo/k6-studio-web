/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
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
});
