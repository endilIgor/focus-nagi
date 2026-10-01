import { describe, expect, it } from "vitest";
import {
  createParticles,
  particleTarget,
  sampleRobotTarget,
  type Particle,
} from "./particleGeometry";

/** Deterministic random source that replays the given values in order. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("random sequence exhausted");
    return values[i++];
  };
}

// g() = (U + U + U - 1.5) / 1.5, so three 0.5 draws give zero jitter.
const NO_JITTER = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

function particle(overrides: Partial<Particle> = {}): Particle {
  return {
    nx: 0,
    ny: 0,
    part: "body",
    x: 0,
    y: 0,
    a: 0,
    rr: 0,
    free: false,
    fx: 0.5,
    fy: 0.5,
    s: 2,
    rot: 0,
    vr: 0,
    col: "#8052ff",
    ease: 0.05,
    ph: 0,
    ...overrides,
  };
}

describe("robot geometry (reference Focus Nagi v3)", () => {
  it("places head particles on the head rectangle edge, lifted by the -0.04 offset", () => {
    // r=0.1 → head rectEdge(-0.46,-0.42,0.46,0.2); edge draw 0 → top-left corner.
    const head = sampleRobotTarget(sequence([0.1, 0, ...NO_JITTER]));
    expect(head.part).toBe("body");
    expect(head.nx).toBeCloseTo(-0.46, 10);
    expect(head.ny).toBeCloseTo(-0.46, 10);
  });

  it("marks particles inside the right eye disc as eye particles", () => {
    // r=0.5 → right eye disc(0.19,-0.14,0.085); angle 0, full radius.
    const target = sampleRobotTarget(sequence([0.5, 0, 1, ...NO_JITTER]));
    expect(target.part).toBe("eye");
    expect(target.nx).toBeCloseTo(0.275, 10);
    expect(target.ny).toBeCloseTo(-0.18, 10);
  });

  it("draws the body rectangle and the chest light", () => {
    // r=0.8 → body rectEdge(-0.36,0.28,0.36,0.78); edge draw 0 → (-0.36, 0.28).
    const body = sampleRobotTarget(sequence([0.8, 0, ...NO_JITTER]));
    expect(body.nx).toBeCloseTo(-0.36, 10);
    expect(body.ny).toBeCloseTo(0.24, 10);
    // r=0.95 → chest light disc(0,0.5,0.07) at its centre.
    const chest = sampleRobotTarget(sequence([0.95, 0, 0, ...NO_JITTER]));
    expect(chest.nx).toBeCloseTo(0, 10);
    expect(chest.ny).toBeCloseTo(0.46, 10);
  });

  it("creates the requested number of particles from the reference palette", () => {
    const particles = createParticles(200, 1000, 800);
    expect(particles).toHaveLength(200);
    const palette = new Set(["#8052ff", "#a48bff", "#ffb829", "#1fb894", "#e05cff", "#4f7bff"]);
    for (const p of particles) {
      expect(palette.has(p.col)).toBe(true);
      expect(p.s).toBeGreaterThanOrEqual(1.4);
      expect(p.s).toBeLessThanOrEqual(4);
    }
  });
});

describe("particleTarget", () => {
  const ring = { cx: 500, cy: 400, size: 100, shape: "ring" as const, progress: 0.5, running: false };

  it("puts ring particles on the 0.86 radius, starting at 12 o'clock, lit up to progress", () => {
    const lit = particleTarget(particle({ a: 0 }), 0, ring, 1000, 800);
    expect(lit.tx).toBeCloseTo(500, 6);
    expect(lit.ty).toBeCloseTo(400 - 86, 6);
    expect(lit.alpha).toBeCloseTo(0.92, 6);

    const unlit = particleTarget(particle({ a: Math.PI * 1.5 }), 0, ring, 1000, 800);
    expect(unlit.col).toBe("#c7d3ea");
    expect(unlit.alpha).toBeCloseTo(0.16, 6);
  });

  it("highlights the running progress edge in amber", () => {
    const edge = particleTarget(particle({ a: Math.PI }), 0, { ...ring, running: true }, 1000, 800);
    expect(edge.col).toBe("#ffb829");
    expect(edge.alpha).toBe(1);
    expect(edge.s).toBeCloseTo(2 * 1.7, 6);
  });

  it("maps robot coordinates onto the anchor radius", () => {
    const cloud = { cx: 300, cy: 300, size: 200, shape: "cloud" as const, progress: 0, running: false };
    // t=0, ph=0: sway/bob terms vanish except cos(0)*0.012.
    const t = particleTarget(particle({ nx: 0.5, ny: -0.25 }), 0, cloud, 1000, 800);
    expect(t.tx).toBeCloseTo(300 + 0.5 * 200, 6);
    expect(t.ty).toBeCloseTo(300 + (-0.25 + 0.012) * 200, 6);
  });

  it("lets free particles drift around the viewport when there is no anchor", () => {
    const t = particleTarget(particle({ fx: 0.25, fy: 0.75 }), 0, null, 1000, 800);
    expect(t.tx).toBeCloseTo(250, 6);
    expect(t.ty).toBeCloseTo(600 + 50, 6);
  });
});
