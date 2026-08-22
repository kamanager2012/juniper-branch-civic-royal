import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, Headphones } from "lucide-react";
import type { DraftStory } from "@/data/story-catalog";

const TONE_CLASS: Record<DraftStory["tone"], string> = {
  wheat: "from-wheat/25 to-paper",
  bamboo: "from-bamboo/20 to-paper",
  bell: "from-bell/18 to-paper",
  pasture: "from-pasture/22 to-paper",
  well: "from-well/18 to-paper",
  temple: "from-temple/18 to-paper",
};

export function DraftStoryReader({ story }: { story: DraftStory }) {
  return (
    <main className="min-h-dvh bg-paper px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="mb-5 inline-flex h-11 items-center gap-2 rounded-full bg-panel px-4 text-sm text-ink-soft shadow-panel"
        >
          <ChevronLeft className="size-4" />
          回书架
        </Link>

        <article className="overflow-hidden rounded-[32px] bg-panel shadow-book ring-1 ring-line/70">
          <header className={`bg-linear-to-br ${TONE_CLASS[story.tone]} px-6 py-9 text-center sm:px-10 sm:py-12`}>
            <div className="mx-auto mb-5 grid size-20 place-items-center rounded-[24px] bg-panel/85 ring-1 ring-line/70">
              <BookOpen className="size-10 text-cinnabar" aria-hidden="true" />
            </div>
            <p className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-ink/8 px-3 py-1.5 text-xs font-medium tracking-wide text-ink-soft">
              <Headphones className="size-3.5" aria-hidden="true" />
              文字版 · 插图与旁白制作中
            </p>
            <h1 className="font-display text-5xl text-cinnabar sm:text-6xl">{story.title}</h1>
            <p className="mt-2 text-sm tracking-[0.18em] text-muted">{story.pinyin}</p>
            <p className="mx-auto mt-5 max-w-xl text-base text-ink-soft sm:text-lg">{story.tagline}</p>
          </header>

          <div className="space-y-6 px-6 py-8 sm:px-10 sm:py-10">
            {story.sections.map((section, index) => (
              <section key={index} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cinnabar/10 font-display text-lg text-cinnabar">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-[17px] leading-8 text-ink">{section}</p>
              </section>
            ))}

            <div className="mt-8 grid gap-4 border-t border-line/70 pt-8 sm:grid-cols-2">
              <section className="rounded-2xl bg-paper px-5 py-5">
                <h2 className="font-display text-2xl text-cinnabar">这个成语是什么意思？</h2>
                <p className="mt-2 leading-7 text-ink-soft">{story.meaning}</p>
              </section>
              <section className="rounded-2xl bg-paper px-5 py-5">
                <h2 className="font-display text-2xl text-jade">故事告诉我们</h2>
                <p className="mt-2 leading-7 text-ink-soft">{story.moral}</p>
              </section>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
