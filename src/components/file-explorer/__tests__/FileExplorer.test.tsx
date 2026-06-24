/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import FileExplorer from "@/components/file-explorer/FileExplorer";

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    files: [
      { name: "script.js", size: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ],
  }),
}) as jest.Mock;

describe("FileExplorer", () => {
  it("renders file list from API", async () => {
    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("script.js")).toBeInTheDocument();
    });
  });
});
