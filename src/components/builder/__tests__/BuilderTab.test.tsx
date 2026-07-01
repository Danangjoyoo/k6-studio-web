/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BuilderTab from "@/components/builder/BuilderTab";

const applyBuilderToEditor = jest.fn();
let mockWorkspace = {
  namespace: "team-a",
  selectedFile: null as string | null,
  applyBuilderToEditor,
};

jest.mock("@/contexts/ScriptWorkspaceContext", () => ({
  useScriptWorkspace: () => mockWorkspace,
}));

describe("BuilderTab", () => {
  beforeEach(() => {
    applyBuilderToEditor.mockClear();
    mockWorkspace = {
      namespace: "team-a",
      selectedFile: null,
      applyBuilderToEditor,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "plain.ts",
        content: "// Built by Script Builder\nexport default function () {}",
      }),
    }) as unknown as typeof fetch;
  });

  it("applies a generated script to the editor when no script is selected", () => {
    render(<BuilderTab />);

    fireEvent.click(screen.getByRole("button", { name: /apply to editor/i }));

    expect(applyBuilderToEditor).toHaveBeenCalledTimes(1);
    const [content, name] = applyBuilderToEditor.mock.calls[0];
    expect(content.startsWith("// Built by Script Builder")).toBe(true);
    expect(name).toMatch(/\.ts$/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("applies directly over a selected script that already has the builder marker", async () => {
    mockWorkspace.selectedFile = "generated.ts";

    render(<BuilderTab />);

    fireEvent.click(screen.getByRole("button", { name: /apply to editor/i }));

    await waitFor(() => {
      expect(applyBuilderToEditor).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText(/your script will be overridden once applied/i)
    ).not.toBeInTheDocument();
  });

  it("confirms before applying over a selected script without the builder marker", async () => {
    mockWorkspace.selectedFile = "plain.ts";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "plain.ts",
        content: "export default function () {}",
      }),
    }) as unknown as typeof fetch;

    render(<BuilderTab />);

    fireEvent.click(screen.getByRole("button", { name: /apply to editor/i }));

    expect(
      await screen.findByText(
        /your script will be overridden once applied, do you want to proceed\?/i
      )
    ).toBeInTheDocument();
    expect(applyBuilderToEditor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));

    expect(applyBuilderToEditor).toHaveBeenCalledTimes(1);
  });

  it("adds a sleep step", () => {
    render(<BuilderTab />);
    const before = screen.getAllByText(/sleep/i).length;

    fireEvent.click(screen.getByRole("button", { name: /add sleep/i }));

    expect(screen.getAllByText(/sleep/i).length).toBeGreaterThan(before);
  });

  it("toggles a request to GraphQL", () => {
    render(<BuilderTab />);

    fireEvent.click(screen.getAllByRole("button", { name: /graphql/i })[0]);

    expect(screen.getByText(/query \/ mutation/i)).toBeInTheDocument();
  });
});
