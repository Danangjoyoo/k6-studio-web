import {
  formatDuration,
  generateScript,
  hasScriptBuilderMarker,
  normalizeHost,
  type BuilderForm,
} from "@/lib/script-builder";

function baseForm(overrides: Partial<BuilderForm> = {}): BuilderForm {
  return {
    host: "example.com",
    stages: [{ duration: "30", unit: "m", target: "50" }],
    thresholds: [],
    steps: [],
    ...overrides,
  };
}

describe("script-builder scaffold", () => {
  it("normalizes host, defaulting protocol to http", () => {
    expect(normalizeHost("example.com")).toBe("http://example.com");
    expect(normalizeHost("https://x.io")).toBe("https://x.io");
    expect(normalizeHost("  http://y.io ")).toBe("http://y.io");
  });

  it("formats duration from value and unit", () => {
    expect(formatDuration({ duration: "30", unit: "m", target: "1" })).toBe("30m");
    expect(formatDuration({ duration: "5", unit: "s", target: "1" })).toBe("5s");
  });

  it("detects script-builder marker comments case-insensitively", () => {
    expect(hasScriptBuilderMarker("// Built by Script Builder\n")).toBe(true);
    expect(hasScriptBuilderMarker("// build by script builder\n")).toBe(true);
    expect(hasScriptBuilderMarker("export default function () {}")).toBe(false);
  });

  it("emits the marker, imports, BASE_URL, stages and an empty default function", () => {
    const out = generateScript(baseForm());

    expect(out.startsWith("// Built by Script Builder\n")).toBe(true);
    expect(out).toContain(`import http from "k6/http";`);
    expect(out).toContain(`import { group, sleep } from "k6";`);
    expect(out).toContain(`const BASE_URL = "http://example.com";`);
    expect(out).toContain(`{ duration: "30m", target: 50 },`);
    expect(out).toContain("export default function () {");
  });

  it("merges thresholds by metric and omits thresholds when empty", () => {
    expect(generateScript(baseForm())).not.toContain("thresholds:");

    const out = generateScript(
      baseForm({
        thresholds: [
          { metric: "http_req_duration", condition: "p(95)<500" },
          { metric: "http_req_duration", condition: "max<1000" },
          { metric: "http_req_failed", condition: "rate<0.01" },
          { metric: "http_reqs", condition: "   " },
        ],
      })
    );

    expect(out).toContain(`http_req_duration: ["p(95)<500", "max<1000"],`);
    expect(out).toContain(`http_req_failed: ["rate<0.01"],`);
    expect(out).not.toContain("http_reqs:");
  });
});

describe("script-builder REST + sleep", () => {
  it("emits a POST with random body/header/query and a sleep step in order", () => {
    const out = generateScript({
      host: "https://api.test",
      stages: [{ duration: "1", unit: "m", target: "10" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: {
            reqType: "rest",
            method: "POST",
            path: "/users",
            bodies: [`{ "a": 1 }`, `{ "a": 2 }`],
            headerSets: [[{ k: "Content-Type", v: "application/json" }]],
            querySets: [[{ k: "page", v: "1" }]],
          },
        },
        { type: "sleep", duration: "2", unit: "s" },
      ],
    });

    expect(out).toContain("function pick(arr) {");
    expect(out).toContain("function qs(params) {");
    expect(out).toContain(`const bodies0 = [JSON.stringify({ "a": 1 }), JSON.stringify({ "a": 2 })];`);
    expect(out).toContain(`const headerSets0 = [{ "Content-Type": "application/json" }];`);
    expect(out).toContain(`const querySets0 = [{ page: "1" }];`);
    expect(out).toContain(`group("POST /users", () => {`);
    expect(out).toContain("const query = qs(querySets0[0]);");
    expect(out).toContain("const url = `${BASE_URL}/users` + (query ? `?${query}` : \"\");");
    expect(out).toContain("http.post(url, pick(bodies0), { headers: headerSets0[0] });");
    expect(out.indexOf("sleep(2);")).toBeGreaterThan(out.indexOf("http.post("));
  });

  it("omits body for GET and emits a minimal request when no samples exist", () => {
    const out = generateScript({
      host: "x.io",
      stages: [{ duration: "1", unit: "s", target: "1" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: {
            reqType: "rest",
            method: "GET",
            path: "/ping",
            bodies: ["{}"],
            headerSets: [],
            querySets: [],
          },
        },
      ],
    });

    expect(out).toContain("http.get(`${BASE_URL}/ping`);");
    expect(out).not.toContain("bodies0");
    expect(out).not.toContain("function qs");
  });

  it("drops a zero-duration sleep step", () => {
    const out = generateScript({
      host: "x.io",
      stages: [{ duration: "1", unit: "s", target: "1" }],
      thresholds: [],
      steps: [{ type: "sleep", duration: "0", unit: "s" }],
    });

    expect(out).not.toContain("sleep(");
  });
});

describe("script-builder GraphQL", () => {
  it("emits a POST GraphQL request with picked variables and forced content-type", () => {
    const out = generateScript({
      host: "https://api.test",
      stages: [{ duration: "1", unit: "m", target: "10" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: {
            reqType: "graphql",
            path: "/graphql",
            query: "query Q($l: Int!) { users(limit: $l) { id } }",
            variables: [`{ "l": 10 }`, `{ "l": 50 }`],
            headerSets: [[{ k: "Authorization", v: "Bearer T" }]],
          },
        },
      ],
    });

    expect(out).toContain(`const gqlQuery0 = "query Q($l: Int!) { users(limit: $l) { id } }";`);
    expect(out).toContain(`const gqlVars0 = [{ "l": 10 }, { "l": 50 }];`);
    expect(out).toContain(`const headerSets0 = [{ Authorization: "Bearer T" }];`);
    expect(out).toContain(`group("GraphQL /graphql", () => {`);
    expect(out).toContain("const body = JSON.stringify({ query: gqlQuery0, variables: pick(gqlVars0) });");
    expect(out).toContain(`const headers = { "Content-Type": "application/json", ...headerSets0[0] };`);
    expect(out).toContain("http.post(`${BASE_URL}/graphql`, body, { headers });");
  });

  it("uses an empty variables object when there are no variable samples", () => {
    const out = generateScript({
      host: "x.io",
      stages: [{ duration: "1", unit: "s", target: "1" }],
      thresholds: [],
      steps: [
        {
          type: "request",
          request: {
            reqType: "graphql",
            path: "/gql",
            query: "{ ping }",
            variables: [],
            headerSets: [],
          },
        },
      ],
    });

    expect(out).toContain("variables: {} });");
    expect(out).toContain(`const headers = { "Content-Type": "application/json" };`);
  });
});
