import { o as __toESM } from "../_runtime.mjs";
import { R as require_react, _ as Link, y as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as RotateCcw, c as House, i as Star, l as ChevronRight, n as Volume2, o as Play, s as Pause, t as VolumeX, u as ChevronLeft } from "../_libs/lucide-react.mjs";
import { i as Route$1 } from "./router-6fUK5mfc.mjs";
import { a as getStory, c as setSettings, i as getSettings, o as markFinished, r as cn, s as markHeard, t as Petals } from "./utils-BOGDZ_4D.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/story._id-Cyxvd1C0.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function HighlightedText({ text, active, className }) {
	const chars = Array.from(text);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("text-pretty leading-[1.7] tracking-wide", className),
		children: chars.map((ch, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: cn("transition-colors duration-150", i <= active && i >= 0 && "char-on"),
			children: ch
		}, `${i}-${ch}`))
	});
}
var PAUSE = /[，。！？、：；,.!?…—]/;
function charStartTimes(text, duration) {
	const weights = Array.from(text).map((ch) => {
		if (PAUSE.test(ch)) return 1.85;
		if (ch.trim() === "") return .2;
		return 1;
	});
	const total = weights.reduce((a, b) => a + b, 0) || 1;
	let t = .12;
	const usable = Math.max(duration - .28, .4);
	return weights.map((w) => {
		const start = t;
		t += w / total * usable;
		return start;
	});
}
function activeCharIndex(times, current) {
	if (times.length === 0) return -1;
	let i = 0;
	while (i < times.length - 1 && current >= times[i + 1]) i += 1;
	if (current < times[0]) return -1;
	return i;
}
/** Quiet pentatonic music-box loop. Original, no samples. */
var ctx = null;
var master = null;
var timer = null;
var step = 0;
var wanted = false;
var NOTES = [
	293.66,
	329.63,
	392,
	440,
	523.25,
	587.33
];
var PATTERN = [
	0,
	2,
	4,
	2,
	5,
	4,
	2,
	1,
	0,
	2,
	3,
	2,
	4,
	2,
	0,
	-1
];
function beep(freq, when, dur) {
	if (!ctx || !master) return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	const filter = ctx.createBiquadFilter();
	osc.type = "triangle";
	osc.frequency.setValueAtTime(freq, when);
	filter.type = "lowpass";
	filter.frequency.setValueAtTime(1400, when);
	gain.gain.setValueAtTime(1e-4, when);
	gain.gain.exponentialRampToValueAtTime(.045, when + .03);
	gain.gain.exponentialRampToValueAtTime(1e-4, when + dur);
	osc.connect(filter);
	filter.connect(gain);
	gain.connect(master);
	osc.start(when);
	osc.stop(when + dur + .02);
}
function tick() {
	if (!ctx || !master || !wanted) return;
	const i = PATTERN[step % PATTERN.length];
	const now = ctx.currentTime;
	if (i >= 0) {
		beep(NOTES[i], now, .42);
		if (step % 4 === 0) beep(NOTES[0] / 2, now, .7);
	}
	step += 1;
}
function startMusic() {
	wanted = true;
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!ctx) {
		ctx = new AC();
		master = ctx.createGain();
		master.gain.value = .55;
		master.connect(ctx.destination);
	}
	ctx.resume();
	if (timer != null) return;
	tick();
	timer = window.setInterval(tick, 520);
}
function stopMusic() {
	wanted = false;
	if (timer != null) {
		window.clearInterval(timer);
		timer = null;
	}
	if (ctx) ctx.suspend();
}
function setMusicEnabled(on) {
	if (on) startMusic();
	else stopMusic();
}
function StoryReader({ story }) {
	const pages = story.pages;
	const last = pages.length - 1;
	const [index, setIndex] = (0, import_react.useState)(0);
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [started, setStarted] = (0, import_react.useState)(false);
	const [active, setActive] = (0, import_react.useState)(-1);
	const [autoFlip, setAutoFlip] = (0, import_react.useState)(true);
	const [musicOn, setMusicOn] = (0, import_react.useState)(true);
	const [done, setDone] = (0, import_react.useState)(false);
	const audioRef = (0, import_react.useRef)(null);
	const timesRef = (0, import_react.useRef)([]);
	const playingRef = (0, import_react.useRef)(false);
	const autoRef = (0, import_react.useRef)(true);
	const indexRef = (0, import_react.useRef)(0);
	const flipRef = (0, import_react.useRef)(null);
	const flipping = (0, import_react.useRef)(false);
	const dragStartX = (0, import_react.useRef)(null);
	const justFlipped = (0, import_react.useRef)(false);
	const [flip, setFlip] = (0, import_react.useState)(null);
	const flipLive = (0, import_react.useRef)(flip);
	flipLive.current = flip;
	playingRef.current = playing;
	autoRef.current = autoFlip;
	indexRef.current = index;
	const page = pages[index];
	const TURN_MS = 780;
	(0, import_react.useEffect)(() => {
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
	const finishTurn = (0, import_react.useCallback)((to) => {
		justFlipped.current = true;
		setIndex(to);
		setActive(-1);
		setFlip(null);
		flipLive.current = null;
		flipping.current = false;
	}, []);
	const go = (0, import_react.useCallback)((next) => {
		const clamped = Math.max(0, Math.min(last, next));
		const from = indexRef.current;
		if (clamped === from || flipping.current) return;
		clearFlip();
		flipping.current = true;
		const dir = clamped > from ? "next" : "prev";
		setFlip({
			dir,
			from: pages[from].image,
			to: pages[clamped].image,
			angle: 0,
			dragging: false
		});
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				setFlip((f) => f ? {
					...f,
					angle: dir === "next" ? -86 : 86
				} : f);
			});
		});
		window.setTimeout(() => finishTurn(clamped), TURN_MS);
	}, [
		last,
		pages,
		finishTurn
	]);
	(0, import_react.useEffect)(() => {
		clearFlip();
		const audio = new Audio(page.audio);
		audio.preload = "auto";
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
		if (playingRef.current) {
			const delay = justFlipped.current ? 220 : 0;
			justFlipped.current = false;
			window.setTimeout(() => {
				if (audioRef.current === audio && playingRef.current) audio.play().catch(() => {
					setPlaying(false);
					playingRef.current = false;
				});
			}, delay);
		}
		const nxt = pages[index + 1];
		if (nxt) {
			const img = new Image();
			img.src = nxt.image;
		}
		const prv = pages[index - 1];
		if (prv) {
			const img = new Image();
			img.src = prv.image;
		}
		return () => {
			audio.pause();
			audio.src = "";
			audio.removeEventListener("loadedmetadata", onMeta);
			audio.removeEventListener("timeupdate", onTime);
			audio.removeEventListener("ended", onEnded);
		};
	}, [
		page.audio,
		page.text,
		index,
		last,
		pages,
		story.id,
		go
	]);
	(0, import_react.useEffect)(() => () => {
		clearFlip();
		setMusicEnabled(false);
		audioRef.current?.pause();
	}, []);
	(0, import_react.useEffect)(() => {
		if (page.kind === "moral" && started) {
			markFinished(story.id);
			setDone(true);
		}
	}, [
		page.kind,
		started,
		story.id
	]);
	function begin() {
		markHeard(story.id);
		setStarted(true);
		setPlaying(true);
		playingRef.current = true;
		if (musicOn) setMusicEnabled(true);
		audioRef.current?.play().catch(() => {
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
			audio?.play();
		}
	}
	function replay() {
		clearFlip();
		setDone(false);
		setIndex(0);
		setActive(-1);
		setStarted(true);
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
	function onPointerDown(e) {
		if (flipping.current) return;
		dragStartX.current = e.clientX;
		e.currentTarget.setPointerCapture?.(e.pointerId);
	}
	function onPointerMove(e) {
		const start = dragStartX.current;
		if (start == null || flipping.current) return;
		const dx = e.clientX - start;
		const cur = flipLive.current;
		if (!cur) {
			if (Math.abs(dx) < 18) return;
			const dir = dx < 0 ? "next" : "prev";
			const from = indexRef.current;
			const to = dir === "next" ? from + 1 : from - 1;
			if (to < 0 || to > last) return;
			const nextFlip = {
				dir,
				from: pages[from].image,
				to: pages[to].image,
				angle: 0,
				dragging: true
			};
			flipLive.current = nextFlip;
			setFlip(nextFlip);
			return;
		}
		if (!cur.dragging) return;
		let angle = dx / Math.max(window.innerWidth, 1) * 95;
		angle = cur.dir === "next" ? Math.min(0, Math.max(-90, angle)) : Math.max(0, Math.min(90, angle));
		const nextFlip = {
			...cur,
			angle
		};
		flipLive.current = nextFlip;
		setFlip(nextFlip);
	}
	function onPointerUp(e) {
		const start = dragStartX.current;
		dragStartX.current = null;
		const cur = flipLive.current;
		if (cur?.dragging) {
			if (cur.dir === "next" ? cur.angle < -14 : cur.angle > 14) {
				flipping.current = true;
				const to = cur.dir === "next" ? indexRef.current + 1 : indexRef.current - 1;
				const done = {
					...cur,
					dragging: false,
					angle: cur.dir === "next" ? -86 : 86
				};
				flipLive.current = done;
				setFlip(done);
				window.setTimeout(() => finishTurn(to), TURN_MS);
			} else {
				const back = {
					...cur,
					dragging: false,
					angle: 0
				};
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
		if (r > .64) go(index + 1);
		else if (r < .36) go(index - 1);
	}
	const isCover = page.kind === "cover" && !started;
	const isMoral = page.kind === "moral";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative isolate flex min-h-dvh flex-col bg-ink",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute inset-0 overflow-hidden book-stage",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: flip ? flip.to : page.image,
						alt: "",
						className: cn("h-full w-full object-cover", !flip && "kenburns", isMoral && "brightness-[0.55] saturate-[0.9]")
					}),
					flip && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: cn("absolute inset-0 page-leaf", !flip.dragging && "page-turning"),
						style: {
							transformOrigin: flip.dir === "next" ? "right center" : "left center",
							transform: `rotateY(${flip.angle}deg)`
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: flip.from,
							alt: "",
							className: "h-full w-full object-cover"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fold-shade" })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-linear-to-b from-ink/20 via-transparent to-ink/55" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Petals, {})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "grid size-12 place-items-center rounded-full bg-panel/90 text-ink shadow-panel transition-transform duration-150 ease-out active:scale-[0.96]",
						"aria-label": "返回书架",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(House, { className: "size-5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 text-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-xl text-panel drop-shadow-sm",
							children: story.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs tracking-widest text-panel/80",
							children: story.pinyin
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: toggleMusic,
						className: "grid size-12 place-items-center rounded-full bg-panel/90 text-ink shadow-panel transition-transform duration-150 ease-out active:scale-[0.96]",
						"aria-label": musicOn ? "关闭音乐" : "打开音乐",
						children: musicOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-5" })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative z-10 min-h-0 flex-1",
				onPointerDown,
				onPointerMove,
				onPointerUp,
				onPointerCancel: onPointerUp,
				children: [isCover && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rise-in w-full max-w-md rounded-[28px] bg-panel/95 px-6 py-5 text-center shadow-book",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "font-display text-4xl text-cinnabar sm:text-5xl",
								children: story.title
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm tracking-[0.28em] text-muted",
								children: story.pinyin
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-base text-ink-soft",
								children: story.tagline
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: begin,
								className: "mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-cinnabar text-lg font-medium text-panel transition-transform duration-150 ease-out active:scale-[0.96]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-5 fill-current" }), "开始听故事"]
							})
						]
					})
				}), isMoral && started && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "absolute inset-x-0 top-16 bottom-3 z-20 flex items-center justify-center px-3",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "w-[min(92%,26rem)] rounded-[28px] bg-panel/96 px-5 py-5 shadow-book rise-in",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-center text-xs tracking-[0.35em] text-muted",
								children: "成语的意思"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "mt-1 text-center font-display text-3xl text-cinnabar sm:text-4xl",
								children: story.title
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 text-center text-base leading-relaxed text-ink-soft",
								children: story.meaning
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-3 h-px bg-line" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-center text-xs tracking-[0.35em] text-muted",
								children: "小道理"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-center text-[1.05rem] leading-relaxed text-ink",
								children: story.moral
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: togglePlay,
								className: "mx-auto mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-paper-deep px-5 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96]",
								children: [playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4 fill-current" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4 fill-current" }), playing ? "暂停讲解" : "听讲解"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 flex justify-center gap-2",
								children: [
									0,
									1,
									2
								].map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, {
									className: cn("size-8", done ? "fill-star text-star" : "text-line", done && "animate-[star-pop_500ms_ease-out_both]"),
									style: { animationDelay: `${i * 120}ms` }
								}, i))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-col gap-2 sm:flex-row",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: replay,
									className: "flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-cinnabar text-base font-medium text-panel transition-transform duration-150 ease-out active:scale-[0.96]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-4" }), "再听一遍"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/",
									className: "flex h-12 flex-1 items-center justify-center rounded-full border border-line bg-paper text-base font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96]",
									children: "回书架"
								})]
							})
						]
					})
				})]
			}),
			!isCover && !isMoral && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "relative z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "paper-panel mx-auto w-full max-w-2xl rounded-[28px] px-4 py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HighlightedText, {
							text: page.text,
							active,
							className: "page-copy min-h-16 text-center text-[1.35rem] text-ink sm:text-2xl"
						}, page.id),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex items-center justify-between gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => go(index - 1),
									disabled: index === 0,
									className: "grid size-12 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-30",
									"aria-label": "上一页",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "size-6" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: togglePlay,
									className: "grid size-16 place-items-center rounded-full bg-cinnabar text-panel shadow-book transition-transform duration-150 ease-out active:scale-[0.96]",
									"aria-label": playing ? "暂停" : "播放",
									children: playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-7 fill-current" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-7 fill-current" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => go(index + 1),
									disabled: index === last,
									className: "grid size-12 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-30",
									"aria-label": "下一页",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "size-6" })
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 flex items-center justify-center gap-1.5",
							children: pages.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => go(i),
								className: cn("h-2 rounded-full transition-all duration-200", i === index ? "w-6 bg-cinnabar" : "w-2 bg-line"),
								"aria-label": `第 ${i + 1} 页`
							}, p.id))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 flex items-center justify-center gap-4 text-xs text-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: toggleAuto,
									className: "py-1",
									children: ["自动翻页 ", autoFlip ? "开" : "关"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
									index + 1,
									" / ",
									pages.length
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: replay,
									className: "py-1",
									children: "重播"
								})
							]
						})
					]
				})
			})
		]
	});
}
function StoryRoute() {
	const { id } = Route$1.useParams();
	const story = getStory(id);
	if (!story) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-dvh place-items-center px-6 text-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "font-display text-3xl text-cinnabar",
			children: "没有找到这本故事"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/",
			className: "mt-4 inline-flex h-12 items-center rounded-full bg-cinnabar px-6 text-panel",
			children: "回书架"
		})] })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StoryReader, { story });
}
//#endregion
export { StoryRoute as component };
