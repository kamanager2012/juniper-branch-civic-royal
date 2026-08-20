/** Quiet pentatonic music-box loop. Original, no samples. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | null = null;
let step = 0;
let wanted = false;

const NOTES = [293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
const PATTERN = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 3, 2, 4, 2, 0, -1];

function beep(freq: number, when: number, dur: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, when);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.045, when + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function tick() {
  if (!ctx || !master || !wanted) return;
  const i = PATTERN[step % PATTERN.length]!;
  const now = ctx.currentTime;
  if (i >= 0) {
    beep(NOTES[i]!, now, 0.42);
    if (step % 4 === 0) beep(NOTES[0]! / 2, now, 0.7);
  }
  step += 1;
}

export function startMusic() {
  wanted = true;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  void ctx.resume();
  if (timer != null) return;
  tick();
  timer = window.setInterval(tick, 520);
}

export function stopMusic() {
  wanted = false;
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (ctx) void ctx.suspend();
}

export function setMusicEnabled(on: boolean) {
  if (on) startMusic();
  else stopMusic();
}
