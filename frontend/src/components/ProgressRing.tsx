interface ProgressRingProps {
  size: number;
  radius: number;
  strokeWidth: number;
  progress: number; // 0..1
  color: string;
  trackColor?: string;
  glow?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  size,
  radius,
  strokeWidth,
  progress,
  color,
  trackColor = "rgba(255,255,255,.07)",
  glow,
  children,
}: ProgressRingProps) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const center = size / 2;

  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size, transform: "rotate(-90deg)" }}
      >
        <circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          style={{
            filter: glow ? `drop-shadow(0 0 9px ${glow})` : undefined,
            transition: "stroke-dasharray .9s linear",
          }}
        />
      </svg>
      {children && (
        <div style={{ position: "absolute", textAlign: "center" }}>{children}</div>
      )}
    </div>
  );
}
