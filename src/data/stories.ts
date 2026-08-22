import publishedSource from "../../content/published-stories.json";

export type StoryPage = {
  id: string;
  kind: "cover" | "story" | "moral";
  text: string;
  image: string;
  audio: string;
};

export type Story = {
  id: string;
  title: string;
  pinyin: string;
  tagline: string;
  meaning: string;
  moral: string;
  tone: "wheat" | "bamboo" | "bell" | "pasture" | "well" | "temple";
  cover: string;
  pages: StoryPage[];
};

type PublishedStorySource = {
  id: string;
  title: string;
  pinyin: string;
  tagline: string;
  meaning: string;
  moral: string;
  tone: Story["tone"];
  sections: string[];
};

const ALLOWED_TONES = new Set<Story["tone"]>(["wheat", "bamboo", "bell", "pasture", "well", "temple"]);

function page(
  storyId: string,
  id: string,
  kind: StoryPage["kind"],
  text: string,
  imageFile: string,
): StoryPage {
  return {
    id,
    kind,
    text,
    image: `/stories/${storyId}/${imageFile}`,
    audio: `/audio/${storyId}/${id}.mp3`,
  };
}

function validateSource(value: unknown): asserts value is { schemaVersion: 1; stories: PublishedStorySource[] } {
  if (!value || typeof value !== "object") throw new Error("published story source must be an object");
  const source = value as { schemaVersion?: unknown; stories?: unknown };
  if (source.schemaVersion !== 1 || !Array.isArray(source.stories) || source.stories.length !== 24) {
    throw new Error("published story source must contain exactly 24 stories using schemaVersion 1");
  }

  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const raw of source.stories) {
    if (!raw || typeof raw !== "object") throw new Error("published story entries must be objects");
    const story = raw as Partial<PublishedStorySource>;
    for (const field of ["id", "title", "pinyin", "tagline", "meaning", "moral"] as const) {
      if (typeof story[field] !== "string" || story[field]!.trim() === "") {
        throw new Error(`published story ${field} must be a non-empty string`);
      }
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.id!)) throw new Error(`invalid published story id: ${story.id}`);
    if (!story.tone || !ALLOWED_TONES.has(story.tone)) throw new Error(`invalid published story tone: ${story.id}`);
    if (!Array.isArray(story.sections) || story.sections.length !== 7 || story.sections.some((text) => typeof text !== "string" || text.trim() === "")) {
      throw new Error(`published story ${story.id} must contain exactly seven non-empty sections`);
    }
    if (ids.has(story.id!)) throw new Error(`duplicate published story id: ${story.id}`);
    if (titles.has(story.title!)) throw new Error(`duplicate published story title: ${story.title}`);
    ids.add(story.id!);
    titles.add(story.title!);
  }
}

validateSource(publishedSource);
const publishedStories: PublishedStorySource[] = publishedSource.stories;

export const stories: Story[] = publishedStories.map((story) => ({
  id: story.id,
  title: story.title,
  pinyin: story.pinyin,
  tagline: story.tagline,
  meaning: story.meaning,
  moral: story.moral,
  tone: story.tone,
  cover: `/stories/${story.id}/cover.jpg`,
  pages: [
    page(story.id, "p0", "cover", `今天我们读《${story.title}》。先记住这个成语，再一起看看故事里发生了什么。`, "cover.jpg"),
    ...story.sections.map((text, index) => page(story.id, `p${index + 1}`, "story", text, `p${index + 1}.jpg`)),
    page(story.id, "moral", "moral", `${story.title}提醒我们：${story.moral}`, "p7.jpg"),
  ],
}));

export function getStory(id: string): Story | undefined {
  return stories.find((story) => story.id === id);
}
