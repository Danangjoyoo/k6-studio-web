import { APP_BASE_PATH, stripBasePath, withBasePath } from "@/lib/base-path";

describe("base-path", () => {
  it("uses the fixed /k6 app base path", () => {
    expect(APP_BASE_PATH).toBe("/k6");
  });

  it("prefixes app-owned absolute paths", () => {
    expect(withBasePath("/api/run")).toBe("/k6/api/run");
    expect(withBasePath("/k6/api/run")).toBe("/k6/api/run");
    expect(withBasePath("relative/path")).toBe("relative/path");
  });

  it("strips the fixed base path from incoming pathnames", () => {
    expect(stripBasePath("/k6/api/dashboard/ui/")).toBe("/api/dashboard/ui/");
    expect(stripBasePath("/k6")).toBe("/");
    expect(stripBasePath("/k6ish/api")).toBe("/k6ish/api");
    expect(stripBasePath("")).toBe("/");
  });
});
