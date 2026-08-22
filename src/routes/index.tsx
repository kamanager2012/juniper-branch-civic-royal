import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Image } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Petals } from "@/components/petals";
import { storyCatalog } from "@/data/story-catalog";
import type { Story } from "@/data/stories";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

const EAGER_COVER_COUNT = 2;
const DEFERRED_COVER_ROOT_MARGIN = "120px 0px";

const TONE_RING: Record<Story["tone"], string> = {
  wheat: "ring-wheat/70",
  bamboo: "ring-bamboo/70",
  bell: "ring-bell/70",
  pasture: "ring-pasture/70",
  well: "ring-well/70",
  temple: "ring-temple/70",
};

const TONE_BG: Record<Story["tone"], string> = {
  wheat: "from-wheat/35 via-paper to-panel",
  bamboo: "from-bamboo/30 via-paper to-panel",
  bell: "from-bell/25 via-paper to-panel",
  pasture: "from-pasture/30 via-paper to-panel",
  well: "from-well/25 via-paper to-panel",
  temple: "from-temple/25 via-paper to-panel",
};

function DeferredCover({ src }: { src: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [activeSrc, setActiveSrc] = useState<string>();

  useEffect(() => {
    const image = imageRef.current;
    if (!image || activeSrc) return;

    if (!("IntersectionObserver" in window)) {
      setActiveSrc(src);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setActiveSrc(src);
        observer.disconnect();
      },
      { rootMargin: DEFERRED_COVER_ROOT_MARGIN },
    );

    observer.observe(image);
    return () => observer.disconnect();
  }, [activeSrc, src]);

  return (
    <img
      ref={imageRef}
      src={activeSrc}
      alt=""
      decoding="async"
      fetchPriority="low"
      data-cover-loading="deferred"
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
    />
  );
}

function Home() {
  const illustratedCount = storyCatalog.filter((item) => item.kind === "media").length;
  const textCount = storyCatalog.length - illustratedCount;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="mb-6">
          <p className="text-sm tracking-[0.35em] text-muted">给小朋友的中国成语故事库</p>
          <h1 className="mt-1 font-display text-5xl text-cinnabar sm:text-6xl">成语故事</h1>
          <p className="mt-2 text-sm text-ink-soft">不用登录，100 个故事打开就能读</p>
        </header>

        <section className="relative mb-8 overflow-hidden rounded-[32px] book-spine">
          <img
            src="/ui/bookshelf-paper.svg"
            alt=""
            decoding="async"
            fetchPriority="high"
            className="h-44 w-full object-cover sm:h-56"
          />
          <div className="absolute inset-0 bg-linear-to-r from-ink/60 via-ink/25 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7">
            <p className="font-display text-2xl text-panel sm:text-3xl">轻轻点开一本</p>
            <p className="mt-1 text-sm text-panel/90">共 {storyCatalog.length} 本 · {illustratedCount} 本图文版 · {textCount} 本文字版</p>
            <p className="mt-2 text-xs text-panel/75">旁白统一重新生成并校验后再恢复播放</p>
          </div>
        </section>

        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-ink">书架</h2>
            <p className="mt-1 text-xs text-muted">24 本已有插图；76 本先提供完整文字。未校验的旧旁白不会播放。</p>
          </div>
          <span className="shrink-0 rounded-full bg-panel px-3 py-1.5 text-xs text-ink-soft shadow-panel">100 本</span>
        </div>

        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {storyCatalog.map((item, i) => {
            const story = item.story;
            const mediaIndex = item.kind === "media" ? i : -1;
            const eager = item.kind === "media" && mediaIndex < EAGER_COVER_COUNT;

            return (
              <li key={story.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                <Link
                  to="/story/$id"
                  params={{ id: story.id }}
                  className="group block focus:outline-none"
                  {...(item.kind === "media" ? { "data-media-story": "true" } : { "data-text-story": "true" })}
                >
                  <article
                    className={cn(
                      "overflow-hidden rounded-[28px] bg-panel ring-4 book-spine transition-transform duration-200 ease-out group-hover:-translate-y-1 group-active:scale-[0.98]",
                      TONE_RING[story.tone],
                    )}
                  >
                    <div className="relative aspect-book overflow-hidden">
                      {item.kind === "media" ? (
                        eager ? (
                          <img
                            src={item.story.cover}
                            alt=""
                            decoding="async"
                            fetchPriority="high"
                            data-cover-loading="eager"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <DeferredCover src={item.story.cover} />
                        )
                      ) : (
                        <div className={cn("absolute inset-0 grid place-items-center bg-linear-to-br", TONE_BG[story.tone])}>
                          <div className="absolute left-[12%] top-[12%] size-20 rounded-full border border-ink/5" />
                          <div className="absolute bottom-[14%] right-[10%] size-24 rounded-full bg-panel/45" />
                          <div className="relative px-4 text-center">
                            <BookOpen className="mx-auto mb-3 size-9 text-cinnabar/75" aria-hidden="true" />
                            <p className="font-display text-3xl leading-tight text-ink">{story.title}</p>
                            <p className="mt-2 text-[10px] tracking-[0.16em] text-muted">{story.pinyin}</p>
                            <span className="mt-4 inline-flex rounded-full bg-panel/80 px-2.5 py-1 text-[10px] font-medium text-cinnabar ring-1 ring-line/70">
                              文字版
                            </span>
                          </div>
                        </div>
                      )}

                      {item.kind === "media" && (
                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/70 to-transparent p-3 pt-10">
                          <h3 className="font-display text-2xl text-panel">{story.title}</h3>
                          <p className="text-[11px] tracking-widest text-panel/80">{story.pinyin}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <p className="truncate text-sm text-ink-soft">{story.tagline}</p>
                      {item.kind === "media" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted">
                          <Image className="size-3" aria-hidden="true" />
                          图文
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-muted">待插图</span>
                      )}
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
