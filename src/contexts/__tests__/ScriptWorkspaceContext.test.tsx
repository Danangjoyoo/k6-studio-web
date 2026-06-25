/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";
import { useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  ScriptWorkspaceProvider,
  useScriptWorkspace,
} from "@/contexts/ScriptWorkspaceContext";

global.TextDecoder = TextDecoder as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as typeof global.TextEncoder;

function wrapper({
  children,
  selectedFile = null,
  namespace = "team-a",
}: {
  children: React.ReactNode;
  selectedFile?: string | null;
  namespace?: string;
}) {
  return (
    <ScriptWorkspaceProvider
      namespace={namespace}
      selectedFile={selectedFile}
      onSelectFile={jest.fn()}
    >
      {children}
    </ScriptWorkspaceProvider>
  );
}

describe("ScriptWorkspaceContext", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      body: {
        getReader: () => ({
          read: async () => ({
            done: true,
            value: undefined,
          }),
        }),
      },
    }) as jest.Mock;
  });

  it("returns empty session for script without runs", () => {
    const { result } = renderHook(() => useScriptWorkspace(), {
      wrapper: ({ children }) => wrapper({ children }),
    });
    expect(result.current.getSession("b.js").lines).toEqual([]);
  });

  it("stores lines per script session", async () => {
    const sse =
      'data: {"line":"hello"}\n\n' +
      'data: {"done":true,"exitCode":0,"reportName":"a.js-1.html"}\n\n';
    const bytes = Buffer.from(sse, "utf-8");

    global.fetch = jest.fn().mockResolvedValue({
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (!sent) {
                sent = true;
                return { done: false, value: bytes };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    }) as jest.Mock;

    const { result } = renderHook(() => useScriptWorkspace(), {
      wrapper: ({ children }) => wrapper({ children }),
    });

    await act(async () => {
      await result.current.runScript("a.js");
    });

    await waitFor(() => {
      expect(result.current.getSession("a.js").lines).toContain("hello");
      expect(result.current.getSession("a.js").lastReportName).toBe("a.js-1.html");
    });
    expect(result.current.getSession("b.js").lines).toEqual([]);
  });

  it("posts the provider namespace when running a script", async () => {
    const { result } = renderHook(() => useScriptWorkspace(), {
      wrapper: ({ children }) => wrapper({ children, namespace: "team-a" }),
    });

    await act(async () => {
      await result.current.runScript("a.js");
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ filename: "a.js", namespace: "team-a" }),
      })
    );
  });

  it("exposes the namespace from status polling", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        running: true,
        namespace: "team-b",
        script: "a.js",
        activeRunners: 1,
        capacity: 1,
        startedAt: 1,
      }),
    }) as jest.Mock;

    const { result } = renderHook(() => useScriptWorkspace(), {
      wrapper: ({ children }) => wrapper({ children, namespace: "team-a" }),
    });

    await waitFor(() => {
      expect(result.current.globalRunningNamespace).toBe("team-b");
    });
  });

  it("keeps same filename sessions isolated by namespace", async () => {
    let setNamespace: ((namespace: string) => void) | null = null;

    function NamespaceHarness({ children }: { children: React.ReactNode }) {
      const [namespace, updateNamespace] = useState("team-a");
      setNamespace = updateNamespace;
      return wrapper({ children, namespace });
    }

    const sse =
      'data: {"line":"team-a"}\n\n' +
      'data: {"done":true,"exitCode":0,"reportName":"a.js-1.html"}\n\n';
    const bytes = Buffer.from(sse, "utf-8");

    global.fetch = jest.fn().mockResolvedValue({
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (!sent) {
                sent = true;
                return { done: false, value: bytes };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    }) as jest.Mock;

    const { result, rerender } = renderHook(() => useScriptWorkspace(), {
      wrapper: NamespaceHarness,
    });

    await act(async () => {
      await result.current.runScript("a.js");
    });

    await waitFor(() => {
      expect(result.current.getSession("a.js").lines).toContain("team-a");
    });

    await act(async () => {
      setNamespace?.("team-b");
    });
    rerender();

    expect(result.current.getSession("a.js").lines).toEqual([]);
  });
});
