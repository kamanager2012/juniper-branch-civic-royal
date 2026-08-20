import { createFileRoute, Link } from "@tanstack/react-router";
import { StoryReader } from "@/components/story-reader";
import { getStory } from "@/data/stories";

export const Route = createFileRoute("/story/$id")({
  component: StoryRoute,
});

function StoryRoute() {
  const { id } = Route.useParams();
  const story = getStory(id);
  if (!story) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl text-cinnabar">没有找到这本故事</h1>
          <Link
            to="/"
            className="mt-4 inline-flex h-12 items-center rounded-full bg-cinnabar px-6 text-panel"
          >
            回书架
          </Link>
        </div>
      </main>
    );
  }
  return <StoryReader story={story} />;
}
