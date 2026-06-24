/**
 * @jest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import ScriptEditor, {
  ScriptEditorHandle,
} from "@/components/editor/ScriptEditor";

// jsdom doesn't include ResizeObserver — provide a no-op stub
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let capturedLanguage: string | undefined;

jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    language,
  }: {
    value: string;
    onChange: (v: string) => void;
    language: string;
  }) => {
    capturedLanguage = language;
    return (
      <textarea
        data-testid="monaco"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

global.fetch = jest.fn((url: string, opts?: RequestInit) => {
  if (url === "/k6-types.json") {
    return Promise.resolve({ ok: true, json: async () => [] });
  }
  if (!opts?.method || opts.method === "GET") {
    return Promise.resolve({
      ok: true,
      json: async () => ({ name: "test.ts", content: "// hello" }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({ name: "test.ts" }),
  });
}) as jest.Mock;

describe("ScriptEditor", () => {
  it("loads content from API on mount", async () => {
    const ref = createRef<ScriptEditorHandle>();
    const { getByTestId } = render(
      <ScriptEditor filename="test.ts" ref={ref} />
    );
    await waitFor(() => {
      expect((getByTestId("monaco") as HTMLTextAreaElement).value).toBe(
        "// hello"
      );
    });
  });

  it("uses typescript language mode", async () => {
    render(<ScriptEditor filename="test.ts" />);
    await waitFor(() => {
      expect(capturedLanguage).toBe("typescript");
    });
  });
});
