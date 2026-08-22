import draft01 from "../../content/story-drafts/01.json";
import draft02 from "../../content/story-drafts/02.json";
import draft03 from "../../content/story-drafts/03.json";
import draft04 from "../../content/story-drafts/04.json";
import { stories as mediaStories, type Story } from "./stories";

export type DraftStory = {
  id: string;
  title: string;
  pinyin: string;
  tagline: string;
  meaning: string;
  moral: string;
  tone: Story["tone"];
  sections: [string, string, string, string];
};

export type CatalogStory =
  | { kind: "media"; id: string; story: Story }
  | { kind: "text"; id: string; story: DraftStory };

const allowedTones = new Set<Story["tone"]>(["wheat", "bamboo", "bell", "pasture", "well", "temple"]);
const bundles = [draft01, draft02, draft03, draft04];

function parseDraftStory(value: unknown): DraftStory {
  if (!value || typeof value !== "object") throw new Error("draft story must be an object");
  const raw = value as Record<string, unknown>;
  for (const key of ["id", "title", "pinyin", "tagline", "meaning", "moral", "tone"] as const) {
    if (typeof raw[key] !== "string" || raw[key].trim() === "") throw new Error(`draft story ${key} must be non-empty`);
  }
  if (!allowedTones.has(raw.tone as Story["tone"])) throw new Error(`invalid draft story tone: ${String(raw.tone)}`);
  if (!Array.isArray(raw.sections) || raw.sections.length !== 4 || raw.sections.some((section) => typeof section !== "string" || section.trim() === "")) {
    throw new Error(`draft story ${String(raw.id)} must have exactly four text sections`);
  }
  return {
    id: raw.id as string,
    title: raw.title as string,
    pinyin: raw.pinyin as string,
    tagline: raw.tagline as string,
    meaning: raw.meaning as string,
    moral: raw.moral as string,
    tone: raw.tone as Story["tone"],
    sections: raw.sections as DraftStory["sections"],
  };
}

export const draftStories: DraftStory[] = bundles.flatMap((bundle) => {
  if (bundle.schemaVersion !== 1 || bundle.status !== "text-ready-media-pending") throw new Error("invalid story draft bundle");
  return bundle.stories.map(parseDraftStory);
});

if (mediaStories.length !== 24) throw new Error(`expected 24 media-ready stories, found ${mediaStories.length}`);
if (draftStories.length !== 76) throw new Error(`expected 76 text-ready stories, found ${draftStories.length}`);

const ids = new Set<string>();
for (const story of [...mediaStories, ...draftStories]) {
  if (ids.has(story.id)) throw new Error(`duplicate story catalog id: ${story.id}`);
  ids.add(story.id);
}

export const storyCatalog: CatalogStory[] = [
  ...mediaStories.map((story): CatalogStory => ({ kind: "media", id: story.id, story })),
  ...draftStories.map((story): CatalogStory => ({ kind: "text", id: story.id, story })),
];

if (storyCatalog.length !== 100) throw new Error(`expected 100 catalog stories, found ${storyCatalog.length}`);

export function getDraftStory(id: string): DraftStory | undefined {
  return draftStories.find((story) => story.id === id);
}
