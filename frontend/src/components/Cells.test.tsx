import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Cells } from "./Cells";

describe("Cells", () => {
  it("renders the requested number of segments", () => {
    const { container } = render(<Cells pct={50} count={10} color="#7C3AED" />);
    expect(container.querySelectorAll("span")).toHaveLength(10);
  });

  it("lights up a share of segments proportional to pct", () => {
    const { container } = render(<Cells pct={50} count={10} color="#7C3AED" />);
    const spans = Array.from(container.querySelectorAll("span"));
    const lit = spans.filter((el) => (el as HTMLElement).style.background === "rgb(124, 58, 237)");
    expect(lit).toHaveLength(5);
  });

  it("lights zero segments at 0 percent", () => {
    const { container } = render(<Cells pct={0} count={8} color="#7C3AED" />);
    const spans = Array.from(container.querySelectorAll("span"));
    const lit = spans.filter((el) => (el as HTMLElement).style.background === "rgb(124, 58, 237)");
    expect(lit).toHaveLength(0);
  });
});
