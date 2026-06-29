import {
  getRunOutputSnapshot,
  subscribeRunOutput,
  type RunOutputMessage,
} from "@/lib/run-output";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { runId } = await params;
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const readable = new ReadableStream({
    start(controller) {
      let closed = false;

      function close() {
        if (closed) return;
        closed = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      function send(message: RunOutputMessage) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
          );
        } catch {
          close();
          return;
        }
        if (message.done) {
          close();
        }
      }

      const snapshot = getRunOutputSnapshot(runId);
      unsubscribe = subscribeRunOutput(runId, send);
      request.signal.addEventListener("abort", close, { once: true });

      for (const message of snapshot) {
        send(message);
        if (closed) break;
      }
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
