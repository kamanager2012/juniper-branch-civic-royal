import { o as __toESM } from "../_runtime.mjs";
import { R as require_react, _ as Link, y as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as Star } from "../_libs/lucide-react.mjs";
import { r as signOut, t as authClient } from "./client-DvFalId7.mjs";
import { l as stories, n as allProgress, r as cn, t as Petals } from "./utils-BOGDZ_4D.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BMg3IYO-.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Current user + loading state. Same behavior in live preview and when deployed:
*   - Auth enabled (default) -> the real signed-in user; `user` is `null` while
*                            the session resolves (`isPending: true`) and when
*                            signed out (`isPending: false`). Session comes from
*                            Better Auth `useSession()` → `/api/auth/get-session`
*                            (cookie when deployed; bearer in live preview).
*   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
*
* Protect a route by waiting out `isPending` before acting on `user` —
* redirecting on `user: null` alone bounces signed-in visitors to sign-in on
* every hard reload:
*
*   import { RedirectToSignIn } from "@/lib/auth/gates";
*   const { user, isPending } = useCurrentUserState();
*   if (isPending) return null;              // still resolving — don't redirect yet
*   if (!user) return <RedirectToSignIn />;  // definitely signed out
*
* `authEnabled` is a module-level constant fixed at load, so the guarded hook
* call keeps a stable hook order across every render of a given component.
*/
function useCurrentUserState() {
	const { data, isPending } = authClient.useSession();
	const user = data?.user;
	return {
		user: user ? {
			id: user.id,
			displayName: user.name ?? null,
			primaryEmail: user.email ?? null,
			profileImageUrl: user.image ?? null,
			isDevFallback: false
		} : null,
		isPending
	};
}
function AuthSlot() {
	const { user, isPending } = useCurrentUserState();
	if (isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-10 w-16 animate-pulse rounded-full bg-ink/10" });
	if (user) {
		const label = user.displayName ?? user.primaryEmail ?? "家长";
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [user.profileImageUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: user.profileImageUrl,
				alt: "",
				className: "size-8 rounded-full object-cover"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "grid size-8 place-items-center rounded-full bg-cinnabar text-sm text-panel",
				children: label.slice(0, 1)
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => void signOut(),
				className: "text-sm text-ink-soft underline-offset-4 hover:underline",
				children: "退出"
			})]
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
		to: "/login",
		className: "rounded-full border border-line bg-panel/80 px-3 py-2 text-sm text-ink-soft transition-transform duration-150 ease-out hover:bg-panel active:scale-[0.96]",
		children: "家长"
	});
}
var TONE_RING = {
	wheat: "ring-wheat/70",
	bamboo: "ring-bamboo/70",
	bell: "ring-bell/70",
	pasture: "ring-pasture/70",
	well: "ring-well/70",
	temple: "ring-temple/70"
};
function Home() {
	const [progress, setProgress] = (0, import_react.useState)({});
	(0, import_react.useEffect)(() => {
		setProgress(allProgress());
	}, []);
	const heard = Object.values(progress).filter((p) => p.heard).length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative min-h-dvh overflow-hidden",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Petals, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative mx-auto w-full max-w-5xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "mb-6 flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm tracking-[0.35em] text-muted",
						children: "给小朋友的有声绘本"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-1 font-display text-5xl text-cinnabar sm:text-6xl",
						children: "成语故事"
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthSlot, {})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "relative mb-8 overflow-hidden rounded-[32px] book-spine",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: "/stories/bookshelf-hero.jpg",
							alt: "",
							className: "h-44 w-full object-cover sm:h-56"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-linear-to-r from-ink/55 via-ink/20 to-transparent" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "absolute inset-0 flex flex-col justify-end p-5 sm:p-7",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-display text-2xl text-panel sm:text-3xl",
									children: "轻轻点开一本"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-sm text-panel/85",
									children: [
										"听故事 · 看图画 · 懂道理 · 共 ",
										stories.length,
										" 本"
									]
								}),
								heard > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-2 text-xs text-panel/75",
									children: [
										"已经听过 ",
										heard,
										" 本"
									]
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mb-4 font-display text-2xl text-ink",
					children: "书架"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6",
					children: stories.map((story, i) => {
						const stars = progress[story.id]?.stars ?? 0;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "rise-in",
							style: { animationDelay: `${i * 70}ms` },
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/story/$id",
								params: { id: story.id },
								className: "group block focus:outline-none",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
									className: cn("overflow-hidden rounded-[28px] bg-panel ring-4 book-spine transition-transform duration-200 ease-out group-hover:-translate-y-1 group-active:scale-[0.98]", TONE_RING[story.tone]),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "relative aspect-book overflow-hidden",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: story.cover,
											alt: "",
											className: "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/70 to-transparent p-3 pt-10",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
												className: "font-display text-2xl text-panel",
												children: story.title
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-[11px] tracking-widest text-panel/80",
												children: story.pinyin
											})]
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between px-3 py-2.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "truncate text-sm text-ink-soft",
											children: story.tagline
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "flex gap-0.5",
											"aria-label": `${stars} 颗星`,
											children: [
												0,
												1,
												2
											].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, { className: cn("size-3.5", s < stars ? "fill-star text-star" : "text-line") }, s))
										})]
									})]
								})
							})
						}, story.id);
					})
				})
			]
		})]
	});
}
//#endregion
export { Home as component };
