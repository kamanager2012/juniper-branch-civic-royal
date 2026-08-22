import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { Petals } from "@/components/petals";
import type { Story } from "@/data/stories";
import { cn } from "@/lib/utils";

export function IllustratedStoryReader({ story }: { story: Story }) {
  const [index, setIndex] = useState(0);
  const pages = story.pages;
  const page = pages[index]!;
  const last = pages.length - 1;
  const isCover = page.kind === "cover";
  const isMoral = page.kind === "moral";

  function go(next: number) {
    setIndex(Math.max(0, Math.min(last, next)));
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink" data-illustrated-story="true">
      <div className="absolute inset-0 book-stage">
        <img
          src={page.image}
          alt=""
          decoding="async"
          className={cn("h-full w-full object-cover", !isMoral && "kenburns", isMoral && "brightness-[0.55] saturate-[0.9]")}
        />
        <div className="absolute inset-0 bg-linear-to-b from-ink/20 via-transparent to-ink/60" />
        <Petals />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="grid size-12 place-items-center rounded-full bg-panel/90 text-ink shadow-panel transition-transform duration-150 active:scale-[0.96]"
          aria-label="返回书架"
        >
          <Home className="size-5" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="font-display text-xl text-panel drop-shadow-sm">{story.title}</p>
          <p className="text-xs tracking-widest text-panel/80">{story.pinyin}</p>
        </div>
        <span className="rounded-full bg-panel/90 px-3 py-2 text-xs font-medium text-cinnabar">图文版</span>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 items-end justify-center px-3 pb-3">
        <article className="paper-panel w-full max-w-2xl rounded-[28px] px-5 py-5 shadow-book">
          {isCover ? (
            <div className="text-center">
              <p className="text-xs tracking-[0.28em] text-muted">图文故事 · 旁白重制中</p>
              <h1 className="mt-2 font-display text-4xl text-cinnabar sm:text-5xl">{story.title}</h1>
              <p className="mt-1 text-sm tracking-[0.25em] text-muted">{story.pinyin}</p>
              <p className="mt-3 text-base text-ink-soft">{story.tagline}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted">当前版本只提供新正文与插图阅读。旧旁白已停用，重新生成并完成校验后才会恢复播放。</p>
            </div>
          ) : isMoral ? (
            <div className="text-center">
              <p className="text-xs tracking-[0.35em] text-muted">成语的意思</p>
              <h2 className="mt-1 font-display text-3xl text-cinnabar sm:text-4xl">{story.title}</h2>
              <p className="mt-3 text-base leading-relaxed text-ink-soft">{story.meaning}</p>
              <div className="my-4 h-px bg-line" />
              <p className="text-xs tracking-[0.35em] text-muted">小道理</p>
              <p className="mt-2 text-[1.05rem] leading-relaxed text-ink">{story.moral}</p>
            </div>
          ) : (
            <p className="page-copy min-h-20 text-center text-[1.35rem] leading-relaxed text-ink sm:text-2xl">{page.text}</p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="grid size-12 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 active:scale-[0.96] disabled:opacity-30"
              aria-label="上一页"
            >
              <ChevronLeft className="size-6" />
            </button>
            <div className="text-center">
              <p className="text-sm font-medium text-ink">{index + 1} / {pages.length}</p>
              <p className="mt-1 text-[11px] text-muted">旁白未校验，不提供播放</p>
            </div>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === last}
              className="grid size-12 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 active:scale-[0.96] disabled:opacity-30"
              aria-label="下一页"
            >
              <ChevronRight className="size-6" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="页码">
            {pages.map((item, pageIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(pageIndex)}
                className={cn("size-2.5 rounded-full transition-transform", pageIndex === index ? "scale-125 bg-cinnabar" : "bg-line")}
                aria-label={`第 ${pageIndex + 1} 页`}
              />
            ))}
          </div>

          {isMoral && (
            <Link
              to="/"
              className="mx-auto mt-5 flex h-12 max-w-xs items-center justify-center rounded-full bg-cinnabar px-6 text-base font-medium text-panel transition-transform duration-150 active:scale-[0.96]"
            >
              回书架
            </Link>
          )}
        </article>
      </section>
    </main>
  );
}
