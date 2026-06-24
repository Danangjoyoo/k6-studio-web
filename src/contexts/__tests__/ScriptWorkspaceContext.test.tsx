/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";
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
}: {
  children: React.ReactNode;
  selectedFile?: string | null;
}) {
  return (
    <ScriptWorkspaceProvider
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
});
