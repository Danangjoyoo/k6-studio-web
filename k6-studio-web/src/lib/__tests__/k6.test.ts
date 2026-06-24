import { buildK6Command } from "@/lib/k6";

describe("k6", () => {
  it("buildK6Command includes script path and report path in args", () => {
    const args = buildK6Command("/tmp/script.js", "/tmp/report.html");
    expect(args[0]).toBe("run");
    expect(args).toContain("/tmp/script.js");
    expect(args.some((a) => a.includes("report.html"))).toBe(true);
  });
});
