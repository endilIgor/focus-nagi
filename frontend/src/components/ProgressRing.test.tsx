import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./ProgressRing";

describe("ProgressRing", () => {
  it("keeps oversized strokes inside the SVG viewBox", () => {
    const { container } = render(
      <ProgressRing size={100} radius={50} strokeWidth={8} progress={0.5} color="#3B82F6" />,
    );

    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute("r", "46");
    expect(circles[1]).toHaveAttribute("r", "46");
  });

  it("clamps progress and exposes the rendered value accessibly", () => {
    const { getByRole } = render(
      <ProgressRing size={120} radius={54} strokeWidth={6} progress={1.4} color="#3B82F6" />,
    );

    const ring = getByRole("progressbar");
    expect(ring).toHaveAttribute("aria-valuenow", "100");
    expect(ring.querySelectorAll("circle")[1]).toHaveAttribute("stroke-dashoffset", "0");
  });
});
