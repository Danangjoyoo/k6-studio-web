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
      "/k6/api/reports/api%2Fsmoke.ts-111.html?namespace=team-a"
    );
  });

  it("creates a draft note from the add button without focusing the title", async () => {
    mockNotes();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));

    expect(screen.getByRole("tab", { name: "Untitled note" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByLabelText("Note title")).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown note")).not.toBeInTheDocument();
    expect(putBodies()).toEqual([]);
  });

  it("loads persisted notes in preview mode by default", async () => {
    mockNotes([
      {
        id: "note_1",
        title: "Findings",
        markdown: "# Persisted finding",
      },
    ]);

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Findings" }));

    expect(screen.getByLabelText("Note title")).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Persisted finding" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown note")).not.toBeInTheDocument();
  });

  it("supports controlled active report tab state", async () => {
    const onActiveTabChange = jest.fn();
    mockNotes([
      {
        id: "note_1",
        title: "Findings",
        markdown: "# Persisted finding",
      },
    ]);

    render(
      <TestHistoryReportPreview
        namespace="team-a"
        reportName="smoke.ts-1.html"
        activeTabId="note_1"
        onActiveTabChange={onActiveTabChange}
      />
    );

    expect(await screen.findByRole("tab", { name: "Findings" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      screen.getByRole("heading", { name: "Persisted finding" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(onActiveTabChange).toHaveBeenCalledWith("summary");

    fireEvent.click(screen.getByRole("tab", { name: "Findings" }));
    expect(onActiveTabChange).toHaveBeenCalledWith("note_1");
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
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
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

    expect(screen.getByRole("heading", { name: "Findings" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "chart" })).toHaveAttribute(
      "src",
      "/k6/chart.png"
    );
  });

  it("keeps note close buttons after the title instead of overlaying it", async () => {
    mockNotes([{ id: "note_1", title: "Long Findings", markdown: "## ok" }]);

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    const closeButton = await screen.findByRole("button", {
      name: "Close note Long Findings",
    });

    expect(closeButton).not.toHaveClass("-ml-7");
    expect(closeButton).toHaveClass("shrink-0");
    expect(closeButton.parentElement).toHaveClass(
      "grid",
      "grid-cols-[minmax(0,1fr)_auto]"
    );
  });

  it("resets note tabs to preview mode whenever they are selected", async () => {
    mockNotes([
      {
        id: "note_1",
        title: "Findings",
        markdown: "# Persisted finding",
      },
      {
        id: "note_2",
        title: "Runbook",
        markdown: "# Runbook note",
      },
    ]);

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Findings" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));

    expect(screen.getByRole("button", { name: "Preview note" })).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown note")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Findings" }));

    expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown note")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Persisted finding" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.click(screen.getByRole("tab", { name: "Runbook" }));
    fireEvent.click(screen.getByRole("tab", { name: "Findings" }));

    expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown note")).not.toBeInTheDocument();
  });

  it("makes note action buttons visibly interactive on hover", async () => {
    mockNotes();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));

    expect(screen.getByRole("button", { name: "Edit note" })).toHaveClass(
      "hover:border-primary/60",
      "hover:bg-panel-raised"
    );
    expect(screen.getByRole("button", { name: "Save note" })).toHaveClass(
      "hover:bg-primary/90",
      "hover:ring-1"
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
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
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
        "/k6/api/reports/smoke.ts-1.html/note-assets?namespace=team-a",
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
