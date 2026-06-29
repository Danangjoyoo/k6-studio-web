import type { ActiveRun, RunStatus } from "@/lib/run-lock";

export interface RunOutputMessage {
  line?: string;
  started?: boolean;
  run?: ActiveRun;
  status?: RunStatus;
  done?: boolean;
  cancelled?: boolean;
  exitCode?: number | null;
  reportName?: string | null;
}

type Subscriber = (message: RunOutputMessage) => void;

interface RunOutputRecord {
  messages: RunOutputMessage[];
  subscribers: Set<Subscriber>;
}

const MAX_MESSAGES_PER_RUN = 1000;
const records = new Map<string, RunOutputRecord>();

export function appendRunOutput(
  runId: string,
  message: RunOutputMessage
): void {
  const record = getOrCreateRecord(runId);
  record.messages.push(message);
  if (record.messages.length > MAX_MESSAGES_PER_RUN) {
    record.messages.splice(0, record.messages.length - MAX_MESSAGES_PER_RUN);
  }

  for (const subscriber of record.subscribers) {
    subscriber(message);
  }
}

export function getRunOutputSnapshot(runId: string): RunOutputMessage[] {
  return [...(records.get(runId)?.messages ?? [])];
}

export function subscribeRunOutput(
  runId: string,
  subscriber: Subscriber
): () => void {
  const record = getOrCreateRecord(runId);
  record.subscribers.add(subscriber);
  return () => {
    record.subscribers.delete(subscriber);
  };
}

export function closeRunOutput(runId: string): void {
  records.delete(runId);
}

export function _resetRunOutput(): void {
  records.clear();
}

function getOrCreateRecord(runId: string): RunOutputRecord {
  const existing = records.get(runId);
  if (existing) return existing;

  const record: RunOutputRecord = {
    messages: [],
    subscribers: new Set(),
  };
  records.set(runId, record);
  return record;
}
