import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParticleAnchor, ParticleScene } from "./ParticleScene";

type MotionListener = (event: { matches: boolean }) => void;

function installReducedMotion(initial: boolean) {
  const listeners = new Set<MotionListener>();
  const mql = {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn((_type: string, cb: MotionListener) => listeners.add(cb)),
    removeEventListener: vi.fn((_type: string, cb: MotionListener) => listeners.delete(cb)),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    mql,
    listeners,
    set(matches: boolean) {
      mql.matches = matches;
      act(() => listeners.forEach((cb) => cb({ matches })));
    },
  };
}

function installCanvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    globalAlpha: 1,
    strokeStyle: "",
    lineWidth: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  return ctx;
}

function installRaf() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((cb: FrameRequestCallback) => {
    nextId += 1;
    callbacks.set(nextId, cb);
    return nextId;
  });
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
    pending: () => callbacks.size,
    /** Runs every currently scheduled frame once. */
    flush(time = 16) {
      const due = [...callbacks.entries()];
      callbacks.clear();
      for (const [, cb] of due) cb(time);
    },
  };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("ParticleScene", () => {
  let ctx: ReturnType<typeof installCanvas>;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    ctx = installCanvas();
    raf = installRaf();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the grid, beam and canvas as decoration that never captures pointer events", async () => {
    installReducedMotion(false);
    const onClick = vi.fn();
    render(
      <ParticleScene count={20}>
        <button type="button" onClick={onClick}>
          Entrar
        </button>
      </ParticleScene>,
    );

    const scene = screen.getByTestId("particle-scene");
    expect(scene).toHaveAttribute("aria-hidden", "true");
    expect(scene.style.pointerEvents).toBe("none");
    const canvas = scene.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas!.style.pointerEvents).toBe("none");
    expect(scene).not.toContainElement(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.setup().click(screen.getByRole("button", { name: "Entrar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("animates with requestAnimationFrame and removes the frame and every listener on unmount", () => {
    const motion = installReducedMotion(false);
    const addWindow = vi.spyOn(window, "addEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(<ParticleScene count={20} />);

    expect(raf.request).toHaveBeenCalledTimes(1);
    raf.flush();
    expect(ctx.stroke).toHaveBeenCalledTimes(20);
    expect(raf.pending()).toBe(1);

    const resizeHandler = addWindow.mock.calls.find(([type]) => type === "resize")?.[1];
    expect(resizeHandler).toBeDefined();

    unmount();

    expect(raf.cancel).toHaveBeenCalled();
    expect(raf.pending()).toBe(0);
    expect(removeWindow).toHaveBeenCalledWith("resize", resizeHandler);
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(motion.listeners.size).toBe(0);
  });

  it("draws a single static frame without scheduling animation frames under reduced motion", () => {
    installReducedMotion(true);

    render(<ParticleScene count={20} />);

    expect(raf.request).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(20);
  });

  it("switches to a static frame at runtime when reduced motion turns on, and resumes when it turns off", () => {
    const motion = installReducedMotion(false);
    render(<ParticleScene count={20} />);
    expect(raf.pending()).toBe(1);

    motion.set(true);
    expect(raf.pending()).toBe(0);
    const requestsWhileReduced = raf.request.mock.calls.length;
    const strokesAfterSwitch = ctx.stroke.mock.calls.length;
    expect(strokesAfterSwitch).toBeGreaterThanOrEqual(20);

    window.dispatchEvent(new Event("resize"));
    expect(raf.request).toHaveBeenCalledTimes(requestsWhileReduced);
    expect(ctx.stroke.mock.calls.length).toBe(strokesAfterSwitch + 20);

    motion.set(false);
    expect(raf.pending()).toBe(1);
  });

  it("stops animating while the tab is hidden and resumes when visible", () => {
    installReducedMotion(false);
    render(<ParticleScene count={20} />);
    expect(raf.pending()).toBe(1);

    setHidden(true);
    expect(raf.pending()).toBe(0);
    raf.flush();
    expect(raf.pending()).toBe(0);

    setHidden(false);
    expect(raf.pending()).toBe(1);
  });

  it("does nothing when the canvas has no 2D context", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    installReducedMotion(false);

    const { unmount } = render(<ParticleScene count={20} />);

    expect(raf.request).not.toHaveBeenCalled();
    unmount();
  });
});

describe("ParticleAnchor", () => {
  let ctx: ReturnType<typeof installCanvas>;

  beforeEach(() => {
    ctx = installCanvas();
    installRaf();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exposes its shape and progress through data attributes and redraws the static frame when they change", () => {
    installReducedMotion(true);
    const { rerender } = render(
      <ParticleScene count={20}>
        <ParticleAnchor shape="cloud" data-testid="anchor" aria-hidden="true" />
      </ParticleScene>,
    );

    const anchor = screen.getByTestId("anchor");
    expect(anchor).toHaveAttribute("data-shape", "cloud");
    expect(anchor).toHaveAttribute("data-running", "false");
    const strokes = ctx.stroke.mock.calls.length;

    rerender(
      <ParticleScene count={20}>
        <ParticleAnchor shape="ring" progress={1} running data-testid="anchor" aria-hidden="true" />
      </ParticleScene>,
    );

    expect(anchor).toHaveAttribute("data-shape", "ring");
    expect(anchor).toHaveAttribute("data-progress", "1");
    expect(anchor).toHaveAttribute("data-running", "true");
    expect(ctx.stroke.mock.calls.length).toBe(strokes + 20);
  });

  it("renders without a scene", () => {
    render(<ParticleAnchor shape="ring">05:00</ParticleAnchor>);
    expect(screen.getByText("05:00")).toHaveAttribute("data-shape", "ring");
  });
});
