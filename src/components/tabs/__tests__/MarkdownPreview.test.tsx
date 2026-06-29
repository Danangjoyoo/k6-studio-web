/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import MarkdownPreview from "@/components/tabs/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders root-relative markdown resources through the app base path", () => {
    render(
      <MarkdownPreview markdown="![chart](/api/reports/r.html/note-assets/a.png?namespace=team-a) [report](/api/reports/r.html?namespace=team-a)" />
    );

    expect(screen.getByRole("img", { name: "chart" })).toHaveAttribute(
      "src",
      "/k6/api/reports/r.html/note-assets/a.png?namespace=team-a"
    );
    expect(screen.getByRole("link", { name: "report" })).toHaveAttribute(
      "href",
      "/k6/api/reports/r.html?namespace=team-a"
    );
  });
});
