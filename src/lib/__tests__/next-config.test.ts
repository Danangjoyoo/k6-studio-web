import nextConfig from "../../../next.config";

describe("next config", () => {
  it("serves the app under /k6 and redirects root to /k6", async () => {
    expect(nextConfig.basePath).toBe("/k6");

    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: "/",
      destination: "/k6",
      permanent: false,
      basePath: false,
    });
  });
});
