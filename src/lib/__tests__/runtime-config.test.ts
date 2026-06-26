import { readFileSync } from "fs";
import { join } from "path";

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("runtime configuration", () => {
  it("passes TOTAL_RUNNERS into the app container with a default of one", () => {
    const compose = readProjectFile("docker-compose.yml");

    expect(compose).toMatch(/TOTAL_RUNNERS:\s*\$\{TOTAL_RUNNERS:-1\}/);
  });

  it("does not expose K6_DASHBOARD_PORT as runtime configuration", () => {
    expect(readProjectFile(".env.example")).not.toContain("K6_DASHBOARD_PORT");
    expect(readProjectFile("docker-compose.yml")).not.toContain(
      "K6_DASHBOARD_PORT"
    );
  });

  it("does not expose k6 binary or dashboard host as runtime configuration", () => {
    expect(readProjectFile(".env.example")).not.toContain("K6_BIN");
    expect(readProjectFile(".env.example")).not.toContain(
      "K6_WEB_DASHBOARD_HOST"
    );
    expect(readProjectFile("docker-compose.yml")).not.toContain("K6_BIN");
    expect(readProjectFile("docker-compose.yml")).not.toContain(
      "K6_WEB_DASHBOARD_HOST"
    );
  });

  it("publishes the fixed dashboard port range for direct access", () => {
    expect(readProjectFile("docker-compose.yml")).toContain(
      '"5665-5684:5665-5684"'
    );
    expect(readProjectFile("Dockerfile")).toMatch(/EXPOSE 3000 5665-5684/);
  });

  it("copies the Docker dashboard routing helper into the runtime image", () => {
    expect(readProjectFile("Dockerfile")).toContain(
      "COPY --from=builder /app/scripts/docker-dashboard-routing.cjs ./scripts/docker-dashboard-routing.cjs"
    );
  });

  it("documents TOTAL_RUNNERS in local env templates", () => {
    expect(readProjectFile(".env.example")).toMatch(/^TOTAL_RUNNERS=1$/m);
  });
});
