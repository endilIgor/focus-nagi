import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  createParticles,
  DEFAULT_PARTICLE_COUNT,
  drawParticles,
  type ParticleAnchorFrame,
  type ParticleShape,
} from "./particleGeometry";
import styles from "./ParticleScene.module.css";

interface ParticleSceneContextValue {
  attach: (el: HTMLElement) => void;
  detach: (el: HTMLElement) => void;
  refresh: () => void;
}

const ParticleSceneContext = createContext<ParticleSceneContextValue | null>(null);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Time used for the still frame; avoids the eye blink window at t % 4200 < 160. */
const STATIC_FRAME_TIME = 1000;

function readAnchor(el: HTMLElement | null): ParticleAnchorFrame | null {
  if (!el || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  const progress = Number(el.dataset.progress);
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    size: rect.width / 2,
    shape: el.dataset.shape === "ring" ? "ring" : "cloud",
    progress: Number.isFinite(progress) ? progress : 0,
    running: el.dataset.running === "true",
  };
}

interface ParticleSceneProps {
  children?: ReactNode;
  count?: number;
}

/**
 * Fixed decorative backdrop: 88px grid fading from the top, the top light beam and a canvas
 * of triangular particles that form the robot or the focus ring around a ParticleAnchor.
 * Never interactive; animates only while visible and motion is allowed.
 */
export function ParticleScene({ children, count = DEFAULT_PARTICLE_COUNT }: ParticleSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const redrawRef = useRef<() => void>(() => undefined);

  const context = useMemo<ParticleSceneContextValue>(
    () => ({
      attach: (el) => {
        anchorRef.current = el;
        redrawRef.current();
      },
      detach: (el) => {
        if (anchorRef.current !== el) return;
        anchorRef.current = null;
        redrawRef.current();
      },
      refresh: () => redrawRef.current(),
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const particles = createParticles(count, width, height);
    const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
    let reduced = motionQuery?.matches ?? false;
    let raf = 0;
    let disposed = false;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      drawParticles(ctx, particles, t, readAnchor(anchorRef.current), width, height);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const drawStill = () => {
      drawParticles(ctx, particles, STATIC_FRAME_TIME, readAnchor(anchorRef.current), width, height, true);
    };
    const sync = () => {
      if (reduced) {
        stop();
        drawStill();
      } else if (document.hidden) {
        stop();
      } else if (!raf) {
        raf = requestAnimationFrame(frame);
      }
    };

    const onResize = () => {
      resize();
      if (reduced) drawStill();
    };
    // The still frame tracks the anchor on scroll; the animated loop already reads it per frame.
    const onScroll = () => {
      if (reduced) drawStill();
    };
    const onMotionChange = (event: { matches: boolean }) => {
      reduced = event.matches;
      sync();
    };
    const onVisibilityChange = () => sync();

    redrawRef.current = () => {
      if (reduced) drawStill();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery?.addEventListener("change", onMotionChange);
    // Web fonts can move the anchor after the first layout.
    void document.fonts?.ready.then(() => {
      if (!disposed && reduced) drawStill();
    });

    sync();

    return () => {
      disposed = true;
      stop();
      redrawRef.current = () => undefined;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery?.removeEventListener("change", onMotionChange);
    };
  }, [count]);

  return (
    <ParticleSceneContext.Provider value={context}>
      <div className={styles.scene} style={{ pointerEvents: "none" }} aria-hidden="true" data-testid="particle-scene">
        <div className={styles.grid} />
        <div className={styles.beam} />
        <canvas ref={canvasRef} className={styles.canvas} style={{ pointerEvents: "none" }} />
      </div>
      {children}
    </ParticleSceneContext.Provider>
  );
}

interface ParticleAnchorProps extends HTMLAttributes<HTMLDivElement> {
  shape: ParticleShape;
  /** Ring fill, 0..1. */
  progress?: number;
  running?: boolean;
  "data-testid"?: string;
}

/**
 * Marks where the particle field draws its robot ("cloud") or focus ring. The latest mounted
 * anchor wins; without one, particles drift freely.
 */
export function ParticleAnchor({ shape, progress = 0, running = false, children, ...rest }: ParticleAnchorProps) {
  const scene = useContext(ParticleSceneContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!scene || !el) return;
    scene.attach(el);
    return () => scene.detach(el);
  }, [scene]);

  useEffect(() => {
    scene?.refresh();
  }, [scene, shape, progress, running]);

  return (
    <div
      {...rest}
      ref={ref}
      data-particle-anchor=""
      data-shape={shape}
      data-progress={progress}
      data-running={running ? "true" : "false"}
    >
      {children}
    </div>
  );
}
