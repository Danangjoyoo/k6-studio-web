/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TestHistoryReportPreview from "@/components/tabs/TestHistoryReportPreview";

const fetchMock = jest.fn();
global.fetch = fetchMock as jest.Mock;

function mockNotes(notes: unknown[] = []) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).includes("/note-assets") && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          assetId: "asset_paste.png",
          url: "/api/reports/smoke.ts-1.html/note-assets/asset_paste.png?namespace=team-a",
        }),
      });
    }
    if (String(url).includes("/notes") && init?.method === "PUT") {
      return Promise.resolve({
        ok: true,
        json: async () => JSON.parse(String(init.body)),
      });
    }
    if (String(url).includes("/notes")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ notes }),
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function putBodies() {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([, init]) => JSON.parse(String(init.body)));
}

describe("TestHistoryReportPreview", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("renders a pinned summary tab without a close button", async () => {
    mockNotes();

    render(
      <TestHistoryReportPreview
        namespace="team-a"
        reportName="api/smoke.ts-111.html"
      />
    );

    expect(await screen.findByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      screen.queryByRole("button", { name: "Close note Summary" })
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("api/smoke.ts-111.html")).toHaveAttribute(
      "src",
      "/api/reports/api%2Fsmoke.ts-111.html?namespace=team-a"
    );
  });

  it("creates a focused draft note from the add button without persisting", async () => {
    mockNotes();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));

    expect(screen.getByRole("tab", { name: "Untitled note" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByLabelText("Note title")).toHaveFocus();
    expect(putBodies()).toEqual([]);
  });

  it("places the add button after summary and note tabs", async () => {
    mockNotes([
      {
        id: "note_1",
        title: "Findings",
        markdown: "## ok",
      },
    ]);

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    const tabList = await screen.findByRole("tablist", {
      name: "Report preview tabs",
    });
    await screen.findByRole("tab", { name: "Findings" });
    expect(
      Array.from(tabList.children).map((child) => child.textContent?.trim())
    ).toEqual(["Summary", "Findings", ""]);
    expect(tabList.lastElementChild).toBe(
      screen.getByRole("button", { name: "Add note" })
    );
  });

  it("saves a markdown note and renders its preview", async () => {
    mockNotes();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Investigation" },
    });
    fireEvent.change(screen.getByLabelText("Markdown note"), {
      target: { value: "# Findings\n- p95 is high\n![chart](/chart.png)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(putBodies()).toHaveLength(1);
    });
    expect(putBodies()[0]).toEqual({
      notes: [
        {
          id: expect.stringMatching(/^note_/),
          title: "Investigation",
          markdown: "# Findings\n- p95 is high\n![chart](/chart.png)",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Preview note" }));
    expect(screen.getByRole("heading", { name: "Findings" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "chart" })).toHaveAttribute(
      "src",
      "/chart.png"
    );
  });

  it("closes a persisted note and saves the remaining note list", async () => {
    mockNotes([
      { id: "note_1", title: "Findings", markdown: "## ok" },
    ]);

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Close note Findings" })
    );

    await waitFor(() => {
      expect(putBodies()).toEqual([{ notes: [] }]);
    });
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("uploads a pasted image and inserts markdown image syntax", async () => {
    mockNotes();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    const editor = screen.getByLabelText("Markdown note");
    fireEvent.change(editor, { target: { value: "Before\n" } });

    const file = new File([new Uint8Array([1, 2, 3])], "paste.png", {
      type: "image/png",
    });
    fireEvent.paste(editor, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/smoke.ts-1.html/note-assets?namespace=team-a",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Markdown note")).toHaveValue(
        "Before\n![pasted image](/api/reports/smoke.ts-1.html/note-assets/asset_paste.png?namespace=team-a)"
      );
    });
  });
});
