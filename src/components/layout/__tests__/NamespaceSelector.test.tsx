/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NamespaceSelector from "@/components/layout/NamespaceSelector";

global.fetch = jest.fn() as jest.Mock;

const fetchMock = global.fetch as jest.Mock;

function mockNamespaces(namespaces: string[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ namespaces, current: "default" }),
  });
}

describe("NamespaceSelector", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("fetches namespaces and renders default", async () => {
    mockNamespaces(["default"]);

    render(<NamespaceSelector namespace="default" onNamespaceChange={jest.fn()} />);

    expect(fetchMock).toHaveBeenCalledWith("/k6/api/namespaces");
    expect(await screen.findByRole("option", { name: "default" })).toBeInTheDocument();
  });

  it("selects an existing namespace", async () => {
    const onNamespaceChange = jest.fn();
    mockNamespaces(["default", "team-a"]);

    render(
      <NamespaceSelector
        namespace="default"
        onNamespaceChange={onNamespaceChange}
      />
    );

    fireEvent.change(await screen.findByLabelText("Namespace"), {
      target: { value: "team-a" },
    });

    expect(onNamespaceChange).toHaveBeenCalledWith("team-a");
  });

  it("creates a namespace, refreshes the list, and selects it", async () => {
    const onNamespaceChange = jest.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ namespaces: ["default"], current: "default" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "team-b" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          namespaces: ["default", "team-b"],
          current: "team-b",
        }),
      });

    render(
      <NamespaceSelector
        namespace="default"
        onNamespaceChange={onNamespaceChange}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create namespace" }));
    fireEvent.change(await screen.findByLabelText("Namespace name"), {
      target: { value: "team-b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/k6/api/namespaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "team-b" }),
      });
    });
    await waitFor(() => {
      expect(onNamespaceChange).toHaveBeenCalledWith("team-b");
    });
    expect(fetchMock).toHaveBeenCalledWith("/k6/api/namespaces");
  });

  it("shows an inline error when namespace creation fails validation", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ namespaces: ["default"], current: "default" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid namespace" }),
      });

    render(<NamespaceSelector namespace="default" onNamespaceChange={jest.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Create namespace" }));
    fireEvent.change(await screen.findByLabelText("Namespace name"), {
      target: { value: "bad name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid namespace"
    );
  });
});
