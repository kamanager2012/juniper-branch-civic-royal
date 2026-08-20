const KEY = "chengyu-progress-v1";

export type StoryProgress = {
  stars: number;
  heard: boolean;
};

type Book = Record<string, StoryProgress>;

function read(): Book {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Book;
  } catch {
    return {};
  }
}

function write(book: Book) {
  localStorage.setItem(KEY, JSON.stringify(book));
}

export function getProgress(id: string): StoryProgress {
  return read()[id] ?? { stars: 0, heard: false };
}

export function markHeard(id: string) {
  const book = read();
  const prev = book[id] ?? { stars: 0, heard: false };
  book[id] = { ...prev, heard: true };
  write(book);
}

export function markFinished(id: string) {
  const book = read();
  const prev = book[id] ?? { stars: 0, heard: false };
  book[id] = { stars: 3, heard: true };
  write(book);
}

export function allProgress(): Book {
  return read();
}

const SETTINGS_KEY = "chengyu-settings-v1";

export type Settings = {
  autoFlip: boolean;
  music: boolean;
};

export function getSettings(): Settings {
  if (typeof localStorage === "undefined") return { autoFlip: true, music: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { autoFlip: true, music: true };
    return { autoFlip: true, music: true, ...JSON.parse(raw) };
  } catch {
    return { autoFlip: true, music: true };
  }
}

export function setSettings(next: Partial<Settings>) {
  const cur = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...cur, ...next }));
}
