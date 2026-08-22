import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Pause,
  Play,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
} from "lucide-react";
import { HighlightedText } from "@/components/highlighted-text";
import { Petals } from "@/components/petals";
import type { Story } from "@/data/stories";
import { activeCharIndex, charStartTimes } from "@/lib/highlight";
import { setMusicEnabled } from "@/lib/music";
import { getSettings, markFinished, markHeard, setSettings } from "@/lib/progress";
import { cn } from "@/lib/utils";

export function StoryReader({ story }: { story: Story }) {
  const pages = story.pages;
  const last = pages.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [active, setActive] = useState(-1);
  const [autoFlip, setAutoFlip] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [done, setDone] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timesRef = useRef<number[]>([]);
  const playingRef = useRef(false);
  const startedRef = useRef(false);
  const autoRef = useRef(true);
  const indexRef = useRef(0);
  const flipRef = useRef<number | null>(null);
  const flipping = useRef(false);
  const dragStartX = useRef<number | null>(null);
  const justFlipped = useRef(false);
  const [flip, setFlip] = useState<{
    dir: "next" | "prev";
    from: string;
    to: string;
    angle: number;
    dragging: boolean;
  } | null>(null);
  const flipLive = useRef(flip);
  flipLive.current = flip;

  playingRef.current = playing;
  startedRef.current = started;
  autoRef.current = autoFlip;
  indexRef.current = index;

  const page = pages[index]!;
  const TURN_MS = 780;

  useEffect(() => {
    const s = getSettings();
    setAutoFlip(s.autoFlip);
    setMusicOn(s.music);
  }, []);

  const clearFlip = () => {
    if (flipRef.current != null) {
      window.clearTimeout(flipRef.current);
      flipRef.current = null;
    }
  };

  const finishTurn = useCallback(
    (to: number) => {
      justFlipped.current = true;
      setIndex(to);
      setActive(-1);
      setFlip(null);
      flipLive.current = null;
      flipping.current = false;
    },
    [],
  );

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(last, next));
      const from = indexRef.current;
      if (clamped === from || flipping.current) return;
      clearFlip();
      flipping.current = true;
      const dir: "next" | "prev" = clamped > from ? "next" : "prev";
      setFlip({
        dir,
        from: pages[from]!.image,
        to: pages[clamped]!.image,
        angle: 0,
        dragging: false,
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlip((f) => (f ? { ...f, angle: dir === "next" ? -86 : 86 } : f));
        });
      });
      window.setTimeout(() => finishTurn(clamped), TURN_MS);
    },
    [last, pages, finishTurn],
  );

  const preloadAdjacentImages = useCallback(
    (at: number) => {
      const next = pages[at + 1];
      if (next) {
        const img = new Image();
        img.src = next.image;
      }
      const previous = pages[at - 1];
      if (previous) {
        const img = new Image();
        img.src = previous.image;
      }
    },
    [pages],
  );

  useEffect(() => {
    clearFlip();

    // Keep the event-bearing audio object ready, but do not bind a media URL
    // until the user explicitly starts the story. This preserves synchronous
    // play() inside the user gesture while avoiding speculative MP3 transfer.
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;

    const onMeta = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 5;
      timesRef.current = charStartTimes(page.text, dur);
    };
    const onTime = () => setActive(activeCharIndex(timesRef.current, audio.currentTime));
    const onEnded = () => {
      setActive(page.text.length);
      if (indexRef.current >= last) {
        markFinished(story.id);
        setDone(true);
        setPlaying(false);
        playingRef.current = false;
        return;
      }
      if (!autoRef.current) {
        setPlaying(false);
        playingRef.current = false;
        return;
      }
      flipRef.current = window.setTimeout(() => {
        go(indexRef.current + 1);
      }, 1100);
    };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);

    if (startedRef.current) {
      audio.preload = "auto";
      audio.src = page.audio;
      preloadAdjacentImages(index);

      if (playingRef.current) {
        const delay = justFlipped.current ? 220 : 0;
        justFlipped.current = false;
        window.setTimeout(() => {
          if (audioRef.current === audio && playingRef.current) {
            void audio.play().catch(() => {
              setPlaying(false);
              playingRef.current = false;
            });
          }
        }, delay);
      }
    }

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      if (audioRef.current === audio) audioRef.current = null;
      audio.removeAttribute("src");
      audio.load();
    };
  }, [page.audio, page.text, index, last, story.id, go, preloadAdjacentImages]);

  useEffect(() => () => {
    clearFlip();
    setMusicEnabled(false);
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (page.kind === "moral" && started) {
      markFinished(story.id);
      setDone(true);
    }
  }, [page.kind, started, story.id]);

  function begin() {
    const audio = audioRef.current;
    markHeard(story.id);
    startedRef.current = true;
    setStarted(true);
    setPlaying(true);
    playingRef.current = true;
    if (musicOn) setMusicEnabled(true);
    preloadAdjacentImages(indexRef.current);

    if (!audio) {
      setPlaying(false);
      playingRef.current = false;
      return;
    }

    audio.preload = "auto";
    audio.src = page.audio;
    void audio.play().catch(() => {
      setPlaying(false);
      playingRef.current = false;
    });
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!started) {
      begin();
      return;
    }
    if (playing) {
      audio?.pause();
      setPlaying(false);
      playingRef.current = false;
      clearFlip();
    } else {
      setPlaying(true);
      playingRef.current = true;
      void audio?.play();
    }
  }

  function replay() {
    clearFlip();
    setDone(false);
    setIndex(0);
    setActive(-1);
    setStarted(true);
    startedRef.current = true;
    setPlaying(true);
    playingRef.current = true;
    if (musicOn) setMusicEnabled(true);
  }

  function toggleMusic() {
    const next = !musicOn;
    setMusicOn(next);
    setSettings({ music: next });
    if (started) setMusicEnabled(next);
  }

  function toggleAuto() {
    const next = !autoFlip;
    setAutoFlip(next);
    setSettings({ autoFlip: next });
  }

  function fromControls(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, textarea, [data-no-flip]"));
  }

  function onPointerDown(e: PointerEvent) {
    if (flipping.current || fromControls(e.target) || !startedRef.current) return;
    dragStartX.current = e.clientX;
  }

  function onPointerMove(e: PointerEvent) {
    const start = dragStartX.current;
    if (start == null || flipping.current || !startedRef.current) return;
    const dx = e.clientX - start;
    const cur = flipLive.current;
    if (!cur) {
      if (Math.abs(dx) < 18) return;
      const dir: "next" | "prev" = dx < 0 ? "next" : "prev";
      const from = indexRef.current;
      const to = dir === "next" ? from + 1 : from - 1;
      if (to < 0 || to > last) return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const nextFlip = {
        dir,
        from: pages[from]!.image,
        to: pages[to]!.image,
        angle: 0,
        dragging: true,
      };
      flipLive.current = nextFlip;
      setFlip(nextFlip);
      return;
    }
    if (!cur.dragging) return;
    const w = Math.max(window.innerWidth, 1);
    let angle = (dx / w) * 95;
    angle = cur.dir === "next" ? Math.min(0, Math.max(-90, angle)) : Math.max(0, Math.min(90, angle));
    const nextFlip = { ...cur, angle };
    flipLive.current = nextFlip;
    setFlip(nextFlip);
  }

  function onPointerUp(e: PointerEvent) {
    const start = dragStartX.current;
    dragStartX.current = null;
    if (fromControls(e.target) || !startedRef.current) return;
    const cur = flipLive.current;
    if (cur?.dragging) {
      const should = cur.dir === "next" ? cur.angle < -14 : cur.angle > 14;
      if (should) {
        flipping.current = true;
        const to = cur.dir === "next" ? indexRef.current + 1 : indexRef.current - 1;
        const done = { ...cur, dragging: false, angle: cur.dir === "next" ? -86 : 86 };
        flipLive.current = done;
        setFlip(done);
        window.setTimeout(() => finishTurn(to), TURN_MS);
      } else {
        const back = { ...cur, dragging: false, angle: 0 };
        flipLive.current = back;
        setFlip(back);
        window.setTimeout(() => {
          setFlip(null);
          flipLive.current = null;
        }, 420);
      }
      return;
    }
    if (start == null || Math.abs(e.clientX - start) > 12) return;
    const r = e.clientX / Math.max(window.innerWidth, 1);
    if (r > 0.64) go(index + 1);
    else if (r < 0.36) go(index - 1);
  }

  const isCover = page.kind === "cover" && !started;
  const isMoral = page.kind === "moral";

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-ink">
      <div className="absolute inset-0 overflow-hidden book-stage">
        <img
          src={flip ? flip.to : page.image}
          alt=""
          className={cn(
            "h-full w-full object-cover",
            !flip && "kenburns",
            isMoral && "brightness-[0.55] saturate-[0.9]",
          )}
        />
        {flip && (
          <div
            className={cn("absolute inset-0 page-leaf", !flip.dragging && "page-turning")}
            style={{
              transformOrigin: flip.dir === "next" ? "right center" : "left center",
              transform: `rotateY(${flip.angle}deg)`,
            }}
          >
            <img src={flip.from} alt="" className="h-full w-full object-cover" />
            <div className="fold-shade" />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-b from-ink/20 via-transparent to-ink/55" />
        <Petals />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link
          to="/"
          className="grid size-12 place-items-center rounded-full bg-panel/90 text-ink shadow-panel transition-transform duration-150 ease-out active:scale-[0.96]"
          aria-label="返回书架"
        >
          <Home className="size-5" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="font-display text-xl text-panel drop-shadow-sm">{story.title}</p>
          <p className="text-xs tracking-widest text-panel/80">{story.pinyin}</p>
        </div>
        <button
          type="button"
          onClick={toggleMusic}
          className="grid size-12 place-items-center rounded-full bg-panel/90 text-ink shadow-panel transition-transform duration-150 ease-out active:scale-[0.96]"
          aria-label={musicOn ? "关闭音乐" : "打开音乐"}
        >
          {musicOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
      </header>

      <div
        className="relative z-10 min-h-0 flex-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {isCover && (
          <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
            <div className="rise-in w-full max-w-md rounded-[28px] bg-panel/95 px-6 py-5 text-center shadow-book">
              <h1 className="font-display text-4xl text-cinnabar sm:text-5xl">{story.title}</h1>
              <p className="mt-1 text-sm tracking-[0.28em] text-muted">{story.pinyin}</p>
              <p className="mt-2 text-base text-ink-soft">{story.tagline}</p>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={begin}
                className="mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-cinnabar text-lg font-medium text-panel transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <Play className="size-5 fill-current" />
                开始听故事
              </button>
            </div>
          </div>
        )}

        {isMoral && started && (
          <div className="absolute inset-x-0 top-16 bottom-3 z-20 flex items-center justify-center px-3">
            <div className="w-[min(92%,26rem)] rounded-[28px] bg-panel/96 px-5 py-5 shadow-book rise-in">
              <p className="text-center text-xs tracking-[0.35em] text-muted">成语的意思</p>
              <h2 className="mt-1 text-center font-display text-3xl text-cinnabar sm:text-4xl">
                {story.title}
              </h2>
              <p className="mt-3 text-center text-base leading-relaxed text-ink-soft">{story.meaning}</p>
              <div className="my-3 h-px bg-line" />
              <p className="text-center text-xs tracking-[0.35em] text-muted">小道理</p>
              <p className="mt-2 text-center text-[1.05rem] leading-relaxed text-ink">{story.moral}</p>
              <button
                type="button"
                onClick={togglePlay}
                className="mx-auto mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-paper-deep px-5 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
                {playing ? "暂停讲解" : "听讲解"}
              </button>
              <div className="mt-4 flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-8",
                      done ? "fill-star text-star" : "text-line",
                      done && "animate-[star-pop_500ms_ease-out_both]",
                    )}
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={replay}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-cinnabar text-base font-medium text-panel transition-transform duration-150 ease-out active:scale-[0.96]"
                >
                  <RotateCcw className="size-4" />
                  再听一遍
                </button>
                <Link
                  to="/"
                  className="flex h-12 flex-1 items-center justify-center rounded-full border border-line bg-paper text-base font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
                >
                  回书架
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isCover && !isMoral && (
        <footer className="relative z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="paper-panel mx-auto w-full max-w-2xl rounded-[28px] px-4 py-3">
            <HighlightedText
              key={page.id}
              text={page.text}
              active={active}
              className="page-copy min-h-16 text-center text-[1.35rem] text-ink sm:text-2xl"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                className="grid size-12 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-30"
                aria-label="上一页"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="grid size-16 place-items-center rounded-full bg-cinnabar text-panel shadow-book transition-transform duration-150 ease-out active:scale-[0.96]"
                aria-label={playing ? "暂停" : "播放"}
              >
                {playing ? <Pause className="size-7 fill-current" /> : <Play className="size-7 fill-current" />}
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                disabled={index === last}
                className="grid size-12 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-30"
                aria-label="下一页"
              >
                <ChevronRight className="size-6" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {pages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => go(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-200",
                    i === index ? "w-6 bg-cinnabar" : "w-2 bg-line",
                  )}
                  aria-label={`第 ${i + 1} 页`}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted">
              <button type="button" onClick={toggleAuto} className="py-1">
                自动翻页 {autoFlip ? "开" : "关"}
              </button>
              <span>
                {index + 1} / {pages.length}
              </span>
              <button type="button" onClick={replay} className="py-1">
                重播
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}