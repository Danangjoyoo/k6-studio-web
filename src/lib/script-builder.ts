export type DurationUnit = "s" | "m" | "h";

export interface Stage {
  duration: string;
  unit: DurationUnit;
  target: string;
}

export interface Threshold {
  metric: string;
  condition: string;
}

export interface KeyValue {
  k: string;
  v: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RestRequest {
  reqType: "rest";
  method: HttpMethod;
  path: string;
  bodies: string[];
  headerSets: KeyValue[][];
  querySets: KeyValue[][];
}

export interface GraphqlRequest {
  reqType: "graphql";
  path: string;
  query: string;
  variables: string[];
  headerSets: KeyValue[][];
}

export interface RequestStep {
  type: "request";
  collapsed?: boolean;
  request: RestRequest | GraphqlRequest;
}

export interface SleepStep {
  type: "sleep";
  duration: string;
  unit: DurationUnit;
}

export type Step = RequestStep | SleepStep;

export interface BuilderForm {
  host: string;
  stages: Stage[];
  thresholds: Threshold[];
  steps: Step[];
}

export const SCRIPT_BUILDER_MARKER = "// Built by Script Builder";

interface EmitState {
  usePick: boolean;
  useQs: boolean;
  declarations: string[];
  calls: string[];
}

const BODY_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH"]);

export function normalizeHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return "http://example.com";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function formatDuration(stage: Stage): string {
  const duration = stage.duration.trim() || "0";
  return `${duration}${stage.unit}`;
}

export function generateScript(form: BuilderForm): string {
  const lines: string[] = [];
  const emit: EmitState = {
    usePick: false,
    useQs: false,
    declarations: [],
    calls: [],
  };

  form.steps.forEach((step, index) => {
    if (step.type === "sleep") {
      emitSleep(step, index, emit);
      return;
    }
    if (step.request.reqType === "rest") {
      emitRest(step.request, index, emit);
      return;
    }
    emitGraphql(step.request, index, emit);
  });

  lines.push(SCRIPT_BUILDER_MARKER, "");
  lines.push(`import http from "k6/http";`);
  lines.push(`import { group, sleep } from "k6";`, "");
  lines.push(`const BASE_URL = ${JSON.stringify(normalizeHost(form.host))};`, "");
  lines.push(...emitOptions(form));

  if (emit.usePick) {
    lines.push(
      "function pick(arr) {",
      "  return arr[Math.floor(Math.random() * arr.length)];",
      "}",
      ""
    );
  }

  if (emit.useQs) {
    lines.push(
      "function qs(params) {",
      "  return Object.entries(params)",
      "    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)",
      "    .join(\"&\");",
      "}",
      ""
    );
  }

  if (emit.declarations.length > 0) {
    lines.push(...emit.declarations, "");
  }

  lines.push("export default function () {");
  if (emit.calls.length > 0) {
    lines.push(...emit.calls);
  }
  lines.push("}");

  return collapseBlankLines(lines.join("\n")) + "\n";
}

export function hasScriptBuilderMarker(content: string): boolean {
  return /\/\/\s*buil(?:d|t)\s+by\s+script\s+builder/i.test(content);
}

function emitOptions(form: BuilderForm): string[] {
  const lines: string[] = ["export const options = {", "  stages: ["];
  const stages = form.stages.length
    ? form.stages
    : [{ duration: "1", unit: "m" as const, target: "1" }];
  for (const stage of stages) {
    lines.push(
      `    { duration: ${JSON.stringify(formatDuration(stage))}, target: ${Number(stage.target) || 0} },`
    );
  }
  lines.push("  ],");

  const thresholds = mergeThresholds(form.thresholds);
  const metrics = Object.keys(thresholds);
  if (metrics.length > 0) {
    lines.push("  thresholds: {");
    for (const metric of metrics) {
      lines.push(
        `    ${metric}: [${thresholds[metric].map((condition) => JSON.stringify(condition)).join(", ")}],`
      );
    }
    lines.push("  },");
  }

  lines.push("};", "");
  return lines;
}

function mergeThresholds(thresholds: Threshold[]): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const threshold of thresholds) {
    const condition = threshold.condition.trim();
    if (!condition || !threshold.metric.trim()) continue;
    (merged[threshold.metric] = merged[threshold.metric] ?? []).push(condition);
  }
  return merged;
}

function emitRest(request: RestRequest, index: number, emit: EmitState) {
  const bodies = request.bodies.filter((body) => body.trim() !== "");
  const hasBody = BODY_METHODS.has(request.method) && bodies.length > 0;
  const headerSets = nonEmptySets(request.headerSets);
  const querySets = nonEmptySets(request.querySets);
  const displayPath = request.path || "/";

  if (hasBody) {
    emit.usePick = emit.usePick || bodies.length > 1;
    emit.declarations.push(
      `const bodies${index} = [${bodies.map(jsPayloadLiteral).join(", ")}];`
    );
  }

  if (headerSets.length > 0) {
    emit.usePick = emit.usePick || headerSets.length > 1;
    emit.declarations.push(
      `const headerSets${index} = [${headerSets.map(jsObjectLiteral).join(", ")}];`
    );
  }

  if (querySets.length > 0) {
    emit.usePick = emit.usePick || querySets.length > 1;
    emit.useQs = true;
    emit.declarations.push(
      `const querySets${index} = [${querySets.map(jsObjectLiteral).join(", ")}];`
    );
  }

  emit.calls.push(`  // step ${index} - REST ${request.method} ${displayPath}`);
  emit.calls.push(`  group(${JSON.stringify(`${request.method} ${displayPath}`)}, () => {`);
  let urlExpression = "`${BASE_URL}" + request.path + "`";
  if (querySets.length > 0) {
    emit.calls.push(
      `    const query = qs(${pickExpression(`querySets${index}`, querySets.length)});`
    );
    urlExpression = "`${BASE_URL}" + request.path + "` + (query ? `?${query}` : \"\")";
  }

  if (!hasBody && headerSets.length === 0 && querySets.length === 0) {
    emit.calls.push(`    http.${request.method.toLowerCase()}(${urlExpression});`);
    emit.calls.push("  });", "");
    return;
  }

  emit.calls.push(`    const url = ${urlExpression};`);
  const method = request.method.toLowerCase();
  const args = ["url"];
  if (hasBody) {
    args.push(pickExpression(`bodies${index}`, bodies.length));
  }
  if (headerSets.length > 0) {
    args.push(`{ headers: ${pickExpression(`headerSets${index}`, headerSets.length)} }`);
  }
  emit.calls.push(`    http.${method}(${args.join(", ")});`);
  emit.calls.push("  });", "");
}

function emitGraphql(request: GraphqlRequest, index: number, emit: EmitState) {
  const variables = request.variables.filter((variable) => variable.trim() !== "");
  const headerSets = nonEmptySets(request.headerSets);

  emit.declarations.push(`const gqlQuery${index} = ${JSON.stringify(request.query)};`);
  if (variables.length > 0) {
    emit.usePick = emit.usePick || variables.length > 1;
    emit.declarations.push(
      `const gqlVars${index} = [${variables.map(jsVariableLiteral).join(", ")}];`
    );
  }
  if (headerSets.length > 0) {
    emit.usePick = emit.usePick || headerSets.length > 1;
    emit.declarations.push(
      `const headerSets${index} = [${headerSets.map(jsObjectLiteral).join(", ")}];`
    );
  }

  const variablesExpression =
    variables.length > 0 ? pickExpression(`gqlVars${index}`, variables.length) : "{}";
  const headersExpression =
    headerSets.length > 0
      ? `{ "Content-Type": "application/json", ...${pickExpression(
          `headerSets${index}`,
          headerSets.length
        )} }`
      : `{ "Content-Type": "application/json" }`;

  emit.calls.push(`  // step ${index} - GraphQL ${request.path}`);
  emit.calls.push(`  group(${JSON.stringify(`GraphQL ${request.path}`)}, () => {`);
  emit.calls.push(
    `    const body = JSON.stringify({ query: gqlQuery${index}, variables: ${variablesExpression} });`
  );
  emit.calls.push(`    const headers = ${headersExpression};`);
  emit.calls.push("    http.post(`${BASE_URL}" + request.path + "`, body, { headers });");
  emit.calls.push("  });", "");
}

function emitSleep(step: SleepStep, index: number, emit: EmitState) {
  const seconds = secondsOf(step.duration, step.unit);
  if (seconds <= 0) return;
  emit.calls.push(`  // step ${index} - sleep`, `  sleep(${seconds});`, "");
}

function jsKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function jsObjectLiteral(rows: KeyValue[]): string {
  const entries = rows
    .filter((row) => row.k.trim() !== "")
    .map((row) => `${jsKey(row.k.trim())}: ${JSON.stringify(row.v)}`);
  return `{ ${entries.join(", ")} }`;
}

function nonEmptySets(sets: KeyValue[][]): KeyValue[][] {
  return sets
    .map((set) => set.filter((row) => row.k.trim() !== ""))
    .filter((set) => set.length > 0);
}

function jsPayloadLiteral(payload: string): string {
  const trimmed = payload.trim();
  return isJson(trimmed) ? `JSON.stringify(${trimmed})` : JSON.stringify(payload);
}

function jsVariableLiteral(variables: string): string {
  const trimmed = variables.trim();
  return isJson(trimmed) ? trimmed : JSON.stringify(variables);
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function pickExpression(name: string, count: number): string {
  return count > 1 ? `pick(${name})` : `${name}[0]`;
}

function secondsOf(value: string, unit: DurationUnit): number {
  const n = Number.parseFloat(value) || 0;
  if (unit === "h") return n * 3600;
  if (unit === "m") return n * 60;
  return n;
}

function collapseBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n");
}
