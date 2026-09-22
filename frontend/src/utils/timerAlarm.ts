let audioContext: AudioContext | null = null;

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;

  const AudioContextConstructor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  audioContext = new AudioContextConstructor();
  return audioContext;
}

/** Unlocks browser audio during a user gesture so the alarm can play later. */
export function primeTimerAlarm(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

/** Plays a short four-tone alarm without requiring an external audio asset. */
export async function playTimerAlarm(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    await context.resume();
  }

  const startAt = context.currentTime;
  const tones = [880, 660, 880, 660];

  tones.forEach((frequency, index) => {
    const toneStart = startAt + index * 0.28;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.18, toneStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneStart + 0.21);
  });
}
