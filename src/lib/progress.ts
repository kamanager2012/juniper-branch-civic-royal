const KEY = "chengyu-progress-v1";
const SETTINGS_KEY = "chengyu-settings-v1";

export type StoryProgress = {
  stars: number;
  heard: boolean;
};

type Book = Record<string, StoryProgress>;

export type Settings = {
  autoFlip: boolean;
  music: boolean;
};

const DEFAULT_PROGRESS: StoryProgress = { stars: 0, heard: false };
const DEFAULT_SETTINGS: Settings = { autoFlip: true, music: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProgress(value: unknown): StoryProgress | null {
  if (!isRecord(value)) return null;
  const stars =
    typeof value.stars === "number" && Number.isInteger(value.stars) && value.stars >= 0 && value.stars <= 3
      ? value.stars
      : 0;
  return {
    stars,
    heard: value.heard === true,
  };
}

function read(): Book {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const book: Book = {};
    for (const [id, value] of Object.entries(parsed)) {
      const normalized = normalizeProgress(value);
      if (normalized) book[id] = normalized;
    }
    return book;
  } catch {
    return {};
  }
}

function write(book: Book) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(book));
}

export function getProgress(id: string): StoryProgress {
  return read()[id] ?? { ...DEFAULT_PROGRESS };
}

export function markHeard(id: string) {
  const book = read();
  const prev = book[id] ?? DEFAULT_PROGRESS;
  book[id] = { ...prev, heard: true };
  write(book);
}

export function markFinished(id: string) {
  const book = read();
  book[id] = { stars: 3, heard: true };
  write(book);
}

export function allProgress(): Book {
  return read();
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  return {
    autoFlip: typeof value.autoFlip === "boolean" ? value.autoFlip : DEFAULT_SETTINGS.autoFlip,
    music: typeof value.music === "boolean" ? value.music : DEFAULT_SETTINGS.music,
  };
}

export function getSettings(): Settings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(next: Partial<Settings>) {
  if (typeof localStorage === "undefined") return;
  const cur = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...cur, ...next }));
}
