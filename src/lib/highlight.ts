const PAUSE = /[，。！？、：；,.!?…—]/;

export function charStartTimes(text: string, duration: number): number[] {
  const chars = Array.from(text);
  const weights = chars.map((ch) => {
    if (PAUSE.test(ch)) return 1.85;
    if (ch.trim() === "") return 0.2;
    return 1;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0.12;
  const usable = Math.max(duration - 0.28, 0.4);
  return weights.map((w) => {
    const start = t;
    t += (w / total) * usable;
    return start;
  });
}

export function activeCharIndex(times: number[], current: number): number {
  if (times.length === 0) return -1;
  let i = 0;
  while (i < times.length - 1 && current >= times[i + 1]!) i += 1;
  if (current < times[0]!) return -1;
  return i;
}
