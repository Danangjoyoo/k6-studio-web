import type {
  BuilderForm,
  GraphqlRequest,
  RequestStep,
  RestRequest,
  Step,
} from "@/lib/script-builder";

export type RequestType = "rest" | "graphql";

export type BuilderAction =
  | { type: "setHost"; value: string }
  | { type: "addStage" }
  | { type: "removeStage"; index: number }
  | { type: "moveStage"; from: number; to: number }
  | { type: "addThreshold" }
  | { type: "removeThreshold"; index: number }
  | { type: "addRequestStep" }
  | { type: "addSleepStep" }
  | { type: "removeStep"; index: number }
  | { type: "moveStep"; from: number; to: number }
  | { type: "toggleCollapse"; index: number }
  | { type: "setRequestType"; index: number; reqType: RequestType }
  | { type: "updatePath"; path: string; value: string }
  | { type: "pushSample"; path: string }
  | { type: "removeSample"; path: string; index: number }
  | { type: "reset" };

export function initialBuilderForm(): BuilderForm {
  return {
    host: "https://test.k6.io",
    stages: [{ duration: "5", unit: "s", target: "10" }],
    thresholds: [],
    steps: [
      {
        type: "request",
        collapsed: false,
        request: newRestRequest({
          method: "GET",
          path: "",
        }),
      },
      { type: "sleep", duration: "1", unit: "s" },
    ],
  };
}

export function builderReducer(
  state: BuilderForm,
  action: BuilderAction
): BuilderForm {
  if (action.type === "reset") return initialBuilderForm();

  const next = clone(state);

  switch (action.type) {
    case "setHost":
      next.host = action.value;
      return next;
    case "addStage":
      next.stages.push({ duration: "1", unit: "m", target: "10" });
      return next;
    case "removeStage":
      if (next.stages.length > 1) next.stages.splice(action.index, 1);
      return next;
    case "moveStage":
      move(next.stages, action.from, action.to);
      return next;
    case "addThreshold":
      next.thresholds.push({
        metric: "http_req_duration",
        condition: "p(95)<500",
      });
      return next;
    case "removeThreshold":
      next.thresholds.splice(action.index, 1);
      return next;
    case "addRequestStep":
      next.steps.push(newRestStep());
      return next;
    case "addSleepStep":
      next.steps.push({ type: "sleep", duration: "1", unit: "s" });
      return next;
    case "removeStep":
      next.steps.splice(action.index, 1);
      return next;
    case "moveStep":
      move(next.steps, action.from, action.to);
      return next;
    case "toggleCollapse": {
      const step = next.steps[action.index];
      if (step?.type === "request") step.collapsed = !step.collapsed;
      return next;
    }
    case "setRequestType": {
      const step = next.steps[action.index];
      if (step?.type !== "request") return next;
      step.request =
        action.reqType === "graphql" ? newGraphqlRequest() : newRestRequest();
      return next;
    }
    case "updatePath":
      setAt(next, action.path, action.value);
      return next;
    case "pushSample":
      pushDefaultSample(getAt(next, action.path));
      return next;
    case "removeSample": {
      const target = getAt(next, action.path);
      if (Array.isArray(target) && target.length > 1) {
        target.splice(action.index, 1);
      }
      return next;
    }
  }
}

function newRestStep(): RequestStep {
  return {
    type: "request",
    collapsed: false,
    request: newRestRequest(),
  };
}

function newRestRequest(overrides: Partial<RestRequest> = {}): RestRequest {
  return {
    reqType: "rest",
    method: "GET",
    path: "/api/v1/resource",
    bodies: [""],
    headerSets: [[{ k: "", v: "" }]],
    querySets: [[{ k: "", v: "" }]],
    ...overrides,
  };
}

function newGraphqlRequest(): GraphqlRequest {
  return {
    reqType: "graphql",
    path: "/graphql",
    query: "query {\n  __typename\n}",
    variables: ["{}"],
    headerSets: [[{ k: "", v: "" }]],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function move<T>(items: T[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return;
  }
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

function getAt(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node === null || node === undefined) return undefined;
    return (node as Record<string, unknown>)[key];
  }, root);
}

function setAt(root: unknown, path: string, value: string) {
  const keys = path.split(".");
  let node = root as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    node = node[key] as Record<string, unknown>;
    if (!node) return;
  }
  node[keys[keys.length - 1]] = value;
}

function pushDefaultSample(target: unknown) {
  if (!Array.isArray(target)) return;
  const first = target[0];
  if (Array.isArray(first)) {
    target.push([{ k: "", v: "" }]);
  } else if (first && typeof first === "object") {
    target.push({ k: "", v: "" });
  } else {
    target.push("");
  }
}

export type { Step };
