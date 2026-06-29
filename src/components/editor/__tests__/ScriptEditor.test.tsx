/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react";
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
  if (url === "/k6/k6-types.json") {
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

function deferredResponse(content: string) {
  let resolve!: () => void;
  const released = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    resolve,
    response: Promise.resolve({
      ok: true,
      json: async () => {
        await released;
        return { name: "test.ts", content };
      },
    }),
  };
}

describe("ScriptEditor", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

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

  it("loads nested special-character paths with namespace query encoding", async () => {
    render(<ScriptEditor namespace="team-a" filename="folder/script #1.ts" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/k6/api/files/folder/script%20%231.ts?namespace=team-a"
      );
    });
  });

  it("saves content to the namespaced encoded file URL", async () => {
    const ref = createRef<ScriptEditorHandle>();
    const { getByTestId } = render(
      <ScriptEditor
        namespace="team-a"
        filename="folder/script #1.ts"
        ref={ref}
      />
    );
    await waitFor(() => {
      expect((getByTestId("monaco") as HTMLTextAreaElement).value).toBe(
        "// hello"
      );
    });

    fireEvent.change(getByTestId("monaco"), {
      target: { value: "// changed" },
    });
    await ref.current?.save();

    expect(global.fetch).toHaveBeenCalledWith(
      "/k6/api/files/folder/script%20%231.ts?namespace=team-a",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ content: "// changed" }),
      })
    );
  });

  it("uses typescript language mode", async () => {
    render(<ScriptEditor filename="test.ts" />);
    await waitFor(() => {
      expect(capturedLanguage).toBe("typescript");
    });
  });

  it("ignores stale namespace fetch responses after switching namespaces", async () => {
    const namespaceA = deferredResponse("// namespace a");
    const namespaceB = deferredResponse("// namespace b");
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "/k6/api/files/test.ts?namespace=team-a") {
        return namespaceA.response;
      }
      if (url === "/k6/api/files/test.ts?namespace=team-b") {
        return namespaceB.response;
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    const ref = createRef<ScriptEditorHandle>();

    const { getByTestId, rerender } = render(
      <ScriptEditor namespace="team-a" filename="test.ts" ref={ref} />
    );
    rerender(<ScriptEditor namespace="team-b" filename="test.ts" ref={ref} />);

    namespaceB.resolve();
    await waitFor(() => {
      expect((getByTestId("monaco") as HTMLTextAreaElement).value).toBe(
        "// namespace b"
      );
      expect(ref.current?.getContent()).toBe("// namespace b");
    });

    await act(async () => {
      namespaceA.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((getByTestId("monaco") as HTMLTextAreaElement).value).toBe(
      "// namespace b"
    );
    expect(ref.current?.getContent()).toBe("// namespace b");
  });
});
