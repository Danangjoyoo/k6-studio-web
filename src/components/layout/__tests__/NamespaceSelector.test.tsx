/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("fetches namespaces and renders the selected namespace on a dropdown trigger", async () => {
    mockNamespaces(["default"]);

    render(<NamespaceSelector namespace="default" onNamespaceChange={jest.fn()} />);

    expect(fetchMock).toHaveBeenCalledWith("/k6/api/namespaces");
    expect(
      await screen.findByRole("button", { name: "Namespace: default" })
    ).toBeInTheDocument();
  });

  it("filters and selects an existing namespace from the dropdown", async () => {
    const onNamespaceChange = jest.fn();
    mockNamespaces(["default", "team-a", "sandbox"]);

    render(
      <NamespaceSelector
        namespace="default"
        onNamespaceChange={onNamespaceChange}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Namespace: default" })
    );

    const namespaceList = screen.getByRole("listbox", { name: "Namespaces" });
    expect(
      within(namespaceList).getByRole("option", {
        name: "Select namespace default",
      })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search namespaces" }), {
      target: { value: "team" },
    });

    expect(
      within(namespaceList).queryByRole("option", {
        name: "Select namespace sandbox",
      })
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(namespaceList).getByRole("option", {
        name: "Select namespace team-a",
      })
    );

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

  it("deletes a non-default namespace and falls back to default", async () => {
    const onNamespaceChange = jest.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ namespaces: ["default", "team-empty"] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ namespaces: ["default"] }),
      });

    render(
      <NamespaceSelector
        namespace="team-empty"
        onNamespaceChange={onNamespaceChange}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Namespace: team-empty" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete namespace" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete namespace" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/k6/api/namespaces?namespace=team-empty",
        { method: "DELETE" }
      );
    });
    expect(onNamespaceChange).toHaveBeenCalledWith("default");
  });

  it("shows an inline error when deleting a non-empty namespace is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ namespaces: ["default", "team-a"] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Namespace must be empty before deletion",
        }),
      });

    render(<NamespaceSelector namespace="team-a" onNamespaceChange={jest.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Namespace: team-a" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete namespace" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete namespace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Namespace must be empty before deletion"
    );
  });

  it("does not offer deletion for the default namespace", async () => {
    mockNamespaces(["default", "team-a"]);

    render(<NamespaceSelector namespace="default" onNamespaceChange={jest.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Namespace: default" })
    );

    expect(
      screen.queryByRole("button", { name: "Delete namespace" })
    ).not.toBeInTheDocument();
  });
});
