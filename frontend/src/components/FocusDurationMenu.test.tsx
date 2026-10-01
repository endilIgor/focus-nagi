import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusDurationMenu, FOCUS_DURATION_PRESETS } from "./FocusDurationMenu";

function Harness({ initial = 50, disabled = false, onChange = vi.fn() }: { initial?: number; disabled?: boolean; onChange?: (m: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FocusDurationMenu
        value={value}
        disabled={disabled}
        onChange={(m) => {
          onChange(m);
          setValue(m);
        }}
      />
      <button type="button">fora</button>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: /duração da sessão/i });
const panel = () => screen.queryByRole("dialog", { name: "Duração da sessão" });

describe("FocusDurationMenu", () => {
  it("keeps the existing presets in order", () => {
    expect(FOCUS_DURATION_PRESETS).toEqual([25, 50, 60, 90, 15]);
  });

  it("starts closed showing the selected duration on the trigger", () => {
    render(<Harness />);
    expect(trigger()).toHaveAccessibleName("Duração da sessão: 50 MIN");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "25 MIN" })).not.toBeInTheDocument();
  });

  it("opens on click, marks the selected preset and focuses it", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-controls", panel()!.id);
    for (const p of [25, 50, 60, 90, 15]) {
      expect(screen.getByRole("button", { name: `${p} MIN` })).toHaveAttribute("aria-pressed", p === 50 ? "true" : "false");
    }
    expect(screen.getByRole("button", { name: "50 MIN" })).toHaveFocus();
  });

  it("selecting a preset applies it, closes and returns focus to the trigger", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "90 MIN" }));
    expect(onChange).toHaveBeenCalledWith(90);
    expect(panel()).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleName("Duração da sessão: 90 MIN");
    expect(trigger()).toHaveFocus();
  });

  it("toggles closed when the trigger is clicked again", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(trigger());
    expect(panel()).not.toBeInTheDocument();
  });

  it("works with the keyboard: Enter opens, arrows move between presets, Enter selects", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "50 MIN" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "60 MIN" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("button", { name: "25 MIN" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "15 MIN" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "25 MIN" })).toHaveFocus();
    await userEvent.keyboard("{End}{Enter}");
    expect(onChange).toHaveBeenCalledWith(15);
    expect(panel()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("Escape closes without changing the value and returns focus to the trigger", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByLabelText("Minutos personalizados"));
    await userEvent.keyboard("{Escape}");
    expect(panel()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when clicking outside", async () => {
    render(<Harness />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "fora" }));
    expect(panel()).not.toBeInTheDocument();
  });

  it.each([
    ["75", 75],
    ["1", 1],
    ["1440", 1440],
    [" 30 ", 30],
  ])("applies a valid custom duration %j", async (typed, expected) => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.type(screen.getByLabelText("Minutos personalizados"), typed);
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onChange).toHaveBeenCalledWith(expected);
    expect(panel()).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleName(`Duração da sessão: ${expected} MIN`);
    expect(trigger()).toHaveFocus();
  });

  it("submits the custom duration with Enter", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.type(screen.getByLabelText("Minutos personalizados"), "45{Enter}");
    expect(onChange).toHaveBeenCalledWith(45);
  });

  it.each([
    ["vazio", ""],
    ["decimal", "2.5"],
    ["decimal com vírgula", "2,5"],
    ["negativo", "-5"],
    ["zero", "0"],
    ["acima do limite", "1441"],
    ["texto", "abc"],
    ["notação científica", "1e3"],
  ])("rejects an invalid custom duration (%s)", async (_label, typed) => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    const input = screen.getByLabelText("Minutos personalizados");
    if (typed) await userEvent.type(input, typed);
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um número inteiro de 1 a 1440 minutos.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Informe um número inteiro de 1 a 1440 minutos.");
    expect(trigger()).toHaveAccessibleName("Duração da sessão: 50 MIN");
  });

  it("is blocked while disabled", async () => {
    const onChange = vi.fn();
    render(<Harness disabled onChange={onChange} />);
    expect(trigger()).toBeDisabled();
    await userEvent.click(trigger());
    expect(panel()).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes if it becomes disabled while open", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<FocusDurationMenu value={50} onChange={onChange} disabled={false} />);
    await userEvent.click(trigger());
    expect(panel()).toBeInTheDocument();
    rerender(<FocusDurationMenu value={50} onChange={onChange} disabled />);
    expect(panel()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "25 MIN" })).not.toBeInTheDocument();
    expect(trigger()).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("FocusDurationMenu viewport placement", () => {
  const originalWidth = window.innerWidth;

  function layout(viewport: number, root: { left: number; width: number }, panelWidth: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: viewport });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const isPanel = this.getAttribute("role") === "dialog";
      const isRoot = !!this.querySelector(":scope > button[aria-haspopup='dialog']");
      const rect = isPanel ? { left: 0, width: panelWidth } : isRoot ? root : { left: 0, width: 0 };
      return {
        ...rect, right: rect.left + rect.width, top: 0, bottom: 0, height: 0, x: rect.left, y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  }

  /** Viewport x of the panel edges given its offset from the trigger root. */
  function panelEdges(rootLeft: number, panelWidth: number) {
    const el = panel()!;
    expect(el.style.left).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(el.style.transform).toBe("none");
    const left = rootLeft + parseFloat(el.style.left);
    return { left, right: left + panelWidth };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });

  it("keeps the 300px panel inside a 390px viewport when the trigger hugs the left edge", async () => {
    // Real Chromium measurement from the smoke: trigger 16→189.86, panel 300px.
    layout(390, { left: 16, width: 173.86 }, 300);
    render(<Harness />);
    await userEvent.click(trigger());
    const { left, right } = panelEdges(16, 300);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(390);
  });

  it("keeps the narrowed panel inside a 320px viewport", async () => {
    layout(320, { left: 16, width: 173.86 }, 288);
    render(<Harness />);
    await userEvent.click(trigger());
    const { left, right } = panelEdges(16, 288);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(320);
  });

  it("does not overflow the right edge when the trigger sits near it", async () => {
    layout(390, { left: 200, width: 174 }, 300);
    render(<Harness />);
    await userEvent.click(trigger());
    const { left, right } = panelEdges(200, 300);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(390);
  });

  it("stays centred under the trigger on desktop when there is room", async () => {
    layout(1440, { left: 600, width: 174 }, 300);
    render(<Harness />);
    await userEvent.click(trigger());
    const { left, right } = panelEdges(600, 300);
    expect((left + right) / 2).toBeCloseTo(600 + 174 / 2, 0);
  });

  it("re-clamps the open panel when the viewport is resized", async () => {
    layout(1440, { left: 600, width: 174 }, 300);
    render(<Harness />);
    await userEvent.click(trigger());
    vi.restoreAllMocks();
    layout(390, { left: 16, width: 173.86 }, 300);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => expect(panelEdges(16, 300).left).toBeGreaterThanOrEqual(0));
    expect(panelEdges(16, 300).right).toBeLessThanOrEqual(390);
  });
});
