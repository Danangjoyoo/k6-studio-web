import {
  builderReducer,
  initialBuilderForm,
} from "@/components/builder/builder-state";
import { generateScript } from "@/lib/script-builder";

describe("builderReducer", () => {
  it("seeds a sensible default form", () => {
    const form = initialBuilderForm();

    expect(form.host).toBe("https://test.k6.io");
    expect(form.stages).toEqual([{ duration: "5", unit: "s", target: "10" }]);
    expect(form.thresholds).toEqual([]);
    expect(form.steps).toMatchObject([
      {
        type: "request",
        request: {
          reqType: "rest",
          method: "GET",
          path: "",
        },
      },
      { type: "sleep", duration: "1", unit: "s" },
    ]);
  });

  it("default form generates a smoke-test script", () => {
    const out = generateScript(initialBuilderForm());

    expect(out).toContain(`const BASE_URL = "https://test.k6.io";`);
    expect(out).toContain(`{ duration: "5s", target: 10 },`);
    expect(out).toContain(`group("GET /", () => {`);
    expect(out).toContain("http.get(`${BASE_URL}`);");
    expect(out).toContain("sleep(1);");
    expect(out).not.toContain("thresholds:");
    expect(out).not.toContain("bodies0");
  });

  it("adds and reorders steps", () => {
    let form = initialBuilderForm();
    form = builderReducer(form, { type: "addSleepStep" });
    const lastIndex = form.steps.length - 1;
    expect(form.steps[lastIndex]).toMatchObject({ type: "sleep" });

    form = builderReducer(form, {
      type: "moveStep",
      from: lastIndex,
      to: 0,
    });

    expect(form.steps[0]).toMatchObject({ type: "sleep" });
  });

  it("never removes the last stage", () => {
    let form = initialBuilderForm();
    while (form.stages.length > 1) {
      form = builderReducer(form, { type: "removeStage", index: 0 });
    }

    form = builderReducer(form, { type: "removeStage", index: 0 });

    expect(form.stages).toHaveLength(1);
  });

  it("switches request type and preserves request step shape", () => {
    let form = initialBuilderForm();
    form = builderReducer(form, { type: "addRequestStep" });
    const index = form.steps.length - 1;

    form = builderReducer(form, {
      type: "setRequestType",
      index,
      reqType: "graphql",
    });

    const step = form.steps[index];
    expect(step.type === "request" && step.request.reqType).toBe("graphql");
  });

  it("updates a value at a dot path and pushes/removes samples", () => {
    let form = initialBuilderForm();
    form = builderReducer(form, {
      type: "updatePath",
      path: "host",
      value: "api.x",
    });
    expect(form.host).toBe("api.x");

    form = builderReducer(form, {
      type: "updatePath",
      path: "stages.0.target",
      value: "99",
    });
    expect(form.stages[0].target).toBe("99");

    form = builderReducer(form, { type: "addRequestStep" });
    const index = form.steps.length - 1;
    const before = requestBodiesLength(form, index);
    form = builderReducer(form, {
      type: "pushSample",
      path: `steps.${index}.request.bodies`,
    });
    expect(requestBodiesLength(form, index)).toBe(before + 1);

    form = builderReducer(form, {
      type: "removeSample",
      path: `steps.${index}.request.bodies`,
      index: 0,
    });
    expect(requestBodiesLength(form, index)).toBe(before);
  });

  it("reset returns a fresh default form", () => {
    let form = initialBuilderForm();
    form = builderReducer(form, {
      type: "updatePath",
      path: "host",
      value: "changed",
    });
    form = builderReducer(form, { type: "reset" });

    expect(form.host).toBe(initialBuilderForm().host);
  });
});

function requestBodiesLength(
  form: ReturnType<typeof initialBuilderForm>,
  index: number
): number {
  const step = form.steps[index];
  if (step.type !== "request" || step.request.reqType !== "rest") {
    throw new Error("expected REST request step");
  }
  return step.request.bodies.length;
}
