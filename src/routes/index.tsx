import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Petals } from "@/components/petals";
import { stories, type Story } from "@/data/stories";
import { allProgress, type StoryProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

const TONE_RING: Record<Story["tone"], string> = {
  wheat: "ring-wheat/70",
  bamboo: "ring-bamboo/70",
  bell: "ring-bell/70",
  pasture: "ring-pasture/70",
  well: "ring-well/70",
  temple: "ring-temple/70",
};

function Home() {
  const [progress, setProgress] = useState<Record<string, StoryProgress>>({});
  useEffect(() => {
    setProgress(allProgress());
  }, []);

  const heard = Object.values(progress).filter((p) => p.heard).length;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="mb-6">
          <p className="text-sm tracking-[0.35em] text-muted">给小朋友的免费有声绘本</p>
          <h1 className="mt-1 font-display text-5xl text-cinnabar sm:text-6xl">成语故事</h1>
          <p className="mt-2 text-sm text-ink-soft">不用登录，打开就能听</p>
        </header>

        <section className="relative mb-8 overflow-hidden rounded-[32px] book-spine">
          <img
            src="/ui/bookshelf-paper.jpg"
            alt=""
            className="h-44 w-full object-cover sm:h-56"
          />
          <div className="absolute inset-0 bg-linear-to-r from-ink/55 via-ink/20 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7">
            <p className="font-display text-2xl text-panel sm:text-3xl">轻轻点开一本</p>
            <p className="mt-1 text-sm text-panel/85">听故事 · 看图画 · 懂道理 · 共 {stories.length} 本</p>
            {heard > 0 && (
              <p className="mt-2 text-xs text-panel/75">已经听过 {heard} 本</p>
            )}
          </div>
        </section>

        <h2 className="mb-4 font-display text-2xl text-ink">书架</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {stories.map((story, i) => {
            const stars = progress[story.id]?.stars ?? 0;
            return (
              <li key={story.id} className="rise-in" style={{ animationDelay: `${i * 70}ms` }}>
                <Link
                  to="/story/$id"
                  params={{ id: story.id }}
                  className="group block focus:outline-none"
                >
                  <article
                    className={cn(
                      "overflow-hidden rounded-[28px] bg-panel ring-4 book-spine transition-transform duration-200 ease-out group-hover:-translate-y-1 group-active:scale-[0.98]",
                      TONE_RING[story.tone],
                    )}
                  >
                    <div className="relative aspect-book overflow-hidden">
                      <img
                        src={story.cover}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/70 to-transparent p-3 pt-10">
                        <h3 className="font-display text-2xl text-panel">{story.title}</h3>
                        <p className="text-[11px] tracking-widest text-panel/80">{story.pinyin}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <p className="truncate text-sm text-ink-soft">{story.tagline}</p>
                      <span className="flex gap-0.5" aria-label={`${stars} 颗星`}>
                        {[0, 1, 2].map((s) => (
                          <Star
                            key={s}
                            className={cn(
                              "size-3.5",
                              s < stars ? "fill-star text-star" : "text-line",
                            )}
                          />
                        ))}
                      </span>
                    </div>
                  </article>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
