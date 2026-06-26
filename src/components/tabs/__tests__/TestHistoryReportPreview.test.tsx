/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TestHistoryReportPreview from "@/components/tabs/TestHistoryReportPreview";

const fetchMock = jest.fn();
global.fetch = fetchMock as jest.Mock;

function mockTabs(tabs: unknown[] = []) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).includes("/tabs") && init?.method === "PUT") {
      return Promise.resolve({
        ok: true,
        json: async () => JSON.parse(String(init.body)),
      });
    }
    if (String(url).includes("/tabs")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ tabs }),
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
    mockTabs();

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
      screen.queryByRole("button", { name: "Close tab Summary" })
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("api/smoke.ts-111.html")).toHaveAttribute(
      "src",
      "/api/reports/api%2Fsmoke.ts-111.html?namespace=team-a"
    );
  });

  it("creates a focused draft tab from the add button without persisting", async () => {
    mockTabs();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add preview tab" }));

    expect(screen.getByRole("tab", { name: "New tab" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByLabelText("Preview tab URL")).toHaveFocus();
    expect(putBodies()).toEqual([]);
  });

  it("persists a submitted custom URL tab and renders its iframe", async () => {
    mockTabs();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add preview tab" }));
    fireEvent.change(screen.getByLabelText("Preview tab URL"), {
      target: { value: "https://grafana.example/d/a" },
    });
    fireEvent.keyDown(screen.getByLabelText("Preview tab URL"), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(putBodies()).toHaveLength(1);
    });
    expect(putBodies()[0]).toEqual({
      tabs: [
        {
          id: expect.stringMatching(/^tab_/),
          url: "https://grafana.example/d/a",
          title: "grafana.example",
        },
      ],
    });
    expect(screen.getByRole("tab", { name: "grafana.example" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByTitle("Preview tab: grafana.example")).toHaveAttribute(
      "src",
      "https://grafana.example/d/a"
    );
  });

  it("closes a persisted custom tab and saves the remaining tab list", async () => {
    mockTabs([
      {
        id: "tab_1",
        url: "https://grafana.example/d/a",
        title: "grafana.example",
      },
    ]);

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Close tab grafana.example" })
    );

    await waitFor(() => {
      expect(putBodies()).toEqual([{ tabs: [] }]);
    });
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("keeps back and forward history local to the browser session", async () => {
    mockTabs();

    render(
      <TestHistoryReportPreview namespace="team-a" reportName="smoke.ts-1.html" />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add preview tab" }));
    fireEvent.change(screen.getByLabelText("Preview tab URL"), {
      target: { value: "https://one.example/a" },
    });
    fireEvent.keyDown(screen.getByLabelText("Preview tab URL"), {
      key: "Enter",
    });
    await waitFor(() => expect(putBodies()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Preview tab URL"), {
      target: { value: "https://two.example/b" },
    });
    fireEvent.keyDown(screen.getByLabelText("Preview tab URL"), {
      key: "Enter",
    });
    await waitFor(() => expect(putBodies()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTitle("Preview tab: two.example")).toHaveAttribute(
      "src",
      "https://one.example/a"
    );
    expect(putBodies()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByTitle("Preview tab: two.example")).toHaveAttribute(
      "src",
      "https://two.example/b"
    );
    expect(putBodies()).toHaveLength(2);
  });
});
