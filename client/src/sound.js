// Tiny WebAudio synth — no audio files needed. Muting persists in localStorage.

let muted = localStorage.getItem("tt-muted") === "1";
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, durMs, type = "sine", gain = 0.12, delayMs = 0) {
  if (muted) return;
  try {
    const c = ac();
    const t0 = c.currentTime + delayMs / 1000;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.05);
  } catch {
    /* audio unavailable — stay silent */
  }
}

export const sound = {
  isMuted: () => muted,
  toggleMute() {
    muted = !muted;
    localStorage.setItem("tt-muted", muted ? "1" : "0");
    return muted;
  },
  count() {
    tone(440, 120, "square", 0.08);
  },
  go() {
    tone(880, 220, "square", 0.1);
  },
  win() {
    tone(523, 120);
    tone(659, 120, "sine", 0.12, 130);
    tone(784, 240, "sine", 0.12, 260);
  },
  lose() {
    tone(330, 200, "sawtooth", 0.06);
    tone(220, 320, "sawtooth", 0.06, 210);
  },
  champion() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 200, "sine", 0.13, i * 160));
  },
};
