/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

describe("DialogContent", () => {
  it("positions the close button away from the dialog border", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Create namespace</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const closeButton = screen.getByRole("button", { name: "Close" });

    expect(closeButton).toHaveClass("top-3");
    expect(closeButton).toHaveClass("right-3");
    expect(closeButton).not.toHaveClass("top-2");
    expect(closeButton).not.toHaveClass("right-2");
  });
});
