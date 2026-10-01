// Particle field geometry and motion, ported from the Focus Nagi v3 design reference
// (initParticles/frame). Coordinates for the robot are normalised to the anchor radius.

export type ParticleShape = "cloud" | "ring";

export interface Particle {
  /** Robot target, in anchor radii from the anchor centre. */
  nx: number;
  ny: number;
  part: "body" | "eye";
  x: number;
  y: number;
  /** Ring angle (radians from 12 o'clock) and radial jitter. */
  a: number;
  rr: number;
  /** Free particles always drift around the viewport. */
  free: boolean;
  fx: number;
  fy: number;
  s: number;
  rot: number;
  vr: number;
  col: string;
  ease: number;
  ph: number;
}

export interface ParticleAnchorFrame {
  cx: number;
  cy: number;
  /** Half of the anchor width. */
  size: number;
  shape: ParticleShape;
  progress: number;
  running: boolean;
}

export const DEFAULT_PARTICLE_COUNT = 1100;

const PALETTE: Array<[string, number]> = [
  ["#8052ff", 40],
  ["#a48bff", 14],
  ["#ffb829", 16],
  ["#1fb894", 12],
  ["#e05cff", 10],
  ["#4f7bff", 8],
];
const PALETTE_TOTAL = PALETTE.reduce((sum, [, weight]) => sum + weight, 0);
const TAU = Math.PI * 2;

/** Roughly normal value in [-1, 1]. */
function gauss(U: () => number): number {
  return (U() + U() + U() - 1.5) / 1.5;
}

function pickColor(U: () => number): string {
  let r = U() * PALETTE_TOTAL;
  for (const [color, weight] of PALETTE) {
    if ((r -= weight) < 0) return color;
  }
  return PALETTE[0][0];
}

/** Samples one point of the robot: head, antenna, eyes, mouth, ears, neck, body and chest light. */
export function sampleRobotTarget(U: () => number): Pick<Particle, "nx" | "ny" | "part"> {
  const th = () => gauss(U) * 0.025;
  const rectEdge = (x0: number, y0: number, x1: number, y1: number): [number, number] => {
    const w = x1 - x0;
    const h = y1 - y0;
    const r = U() * 2 * (w + h);
    if (r < w) return [x0 + r, y0];
    if (r < 2 * w) return [x0 + r - w, y1];
    if (r < 2 * w + h) return [x0, y0 + r - 2 * w];
    return [x1, y0 + r - 2 * w - h];
  };
  const disc = (cx: number, cy: number, rad: number): [number, number] => {
    const a = U() * 6.283;
    const rr = Math.sqrt(U()) * rad;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };

  const r = U();
  let pt: [number, number];
  let part: Particle["part"] = "body";
  if (r < 0.3) pt = rectEdge(-0.46, -0.42, 0.46, 0.2);
  else if (r < 0.34) pt = [th(), -0.42 - U() * 0.2];
  else if (r < 0.38) pt = disc(0, -0.68, 0.06);
  else if (r < 0.46) {
    pt = disc(-0.19, -0.14, 0.085);
    part = "eye";
  } else if (r < 0.54) {
    pt = disc(0.19, -0.14, 0.085);
    part = "eye";
  } else if (r < 0.58) pt = [-0.15 + U() * 0.3, 0.06];
  else if (r < 0.62) pt = rectEdge(-0.56, -0.2, -0.46, 0.0);
  else if (r < 0.66) pt = rectEdge(0.46, -0.2, 0.56, 0.0);
  else if (r < 0.68) pt = [-0.08 + U() * 0.16, 0.2 + U() * 0.08];
  else if (r < 0.92) pt = rectEdge(-0.36, 0.28, 0.36, 0.78);
  else pt = disc(0, 0.5, 0.07);

  const nx = pt[0] + th();
  const ny = pt[1] + th() - 0.04;
  return { nx, ny, part };
}

export function createParticles(
  count: number,
  width: number,
  height: number,
  U: () => number = Math.random,
): Particle[] {
  return Array.from({ length: count }, () => ({
    ...sampleRobotTarget(U),
    x: U() * width,
    y: U() * height,
    a: U() * TAU,
    rr: gauss(U) * 0.07,
    free: U() < 0.2,
    fx: U(),
    fy: U(),
    s: 1.4 + U() * 2.6,
    rot: U() * 6.28,
    vr: (U() - 0.5) * 0.03,
    col: pickColor(U),
    ease: 0.025 + U() * 0.05,
    ph: U() * 6.28,
  }));
}

export interface ParticleTarget {
  tx: number;
  ty: number;
  alpha: number;
  col: string;
  s: number;
}

/** Where a particle wants to be at time `t` (ms), and how it should look there. */
export function particleTarget(
  p: Particle,
  t: number,
  anchor: ParticleAnchorFrame | null,
  W: number,
  H: number,
): ParticleTarget {
  let col = p.col;
  let s = p.s;

  if (p.free || !anchor) {
    return {
      tx: p.fx * W + Math.sin(t * 0.00018 + p.ph) * 60,
      ty: p.fy * H + Math.cos(t * 0.00015 + p.ph * 1.3) * 50,
      alpha: 0.22 + 0.12 * Math.sin(t * 0.002 + p.ph),
      col,
      s,
    };
  }

  const { cx, cy, size, progress, running } = anchor;
  if (anchor.shape === "ring") {
    const breathe = running ? Math.sin(t * 0.0016 + p.ph) * 0.025 : Math.sin(t * 0.0008 + p.ph) * 0.012;
    const R = size * 0.86 * (1 + p.rr + breathe);
    const ang = -Math.PI / 2 + p.a;
    const f = p.a / TAU;
    const lit = f <= progress;
    let alpha: number;
    if (running && Math.abs(f - progress) < 0.018) {
      col = "#ffb829";
      s = p.s * 1.7;
      alpha = 1;
    } else {
      alpha = lit ? 0.92 : 0.16;
      if (!lit) col = "#c7d3ea";
    }
    return { tx: cx + Math.cos(ang) * R, ty: cy + Math.sin(ang) * R, alpha, col, s };
  }

  const bob = Math.sin(t * 0.0012) * 0.025;
  let ny = p.ny;
  // Blink: eyes collapse to a line for 160ms every 4.2s.
  if (p.part === "eye" && t % 4200 < 160) ny = -0.18 + (p.ny + 0.14) * 0.12;
  let alpha = 0.55 + 0.45 * Math.sin(t * 0.0022 + p.ph * 2);
  if (p.part === "eye") {
    col = "#a48bff";
    alpha = 0.95;
    s = p.s * 1.1;
  }
  return {
    tx: cx + (p.nx + Math.sin(t * 0.0005 + p.ph) * 0.012) * size,
    ty: cy + (ny + bob + Math.cos(t * 0.00045 + p.ph) * 0.012) * size,
    alpha,
    col,
    s,
  };
}

/**
 * Advances and strokes every particle as a small triangle. With `settle`, particles jump
 * straight to their target and keep their rotation, producing a still frame.
 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  t: number,
  anchor: ParticleAnchorFrame | null,
  W: number,
  H: number,
  settle = false,
): void {
  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 1;
  for (const p of particles) {
    const { tx, ty, alpha, col, s } = particleTarget(p, t, anchor, W, H);
    if (settle) {
      p.x = tx;
      p.y = ty;
    } else {
      p.x += (tx - p.x) * p.ease;
      p.y += (ty - p.y) * p.ease;
      p.rot += p.vr;
    }
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = p.rot + k * 2.094;
      const px = p.x + Math.cos(a) * s;
      const py = p.y + Math.sin(a) * s;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
