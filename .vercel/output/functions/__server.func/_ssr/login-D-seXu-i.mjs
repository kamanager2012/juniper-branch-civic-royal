import { _ as Link, y as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as GROK_PROVIDERS } from "./router-6fUK5mfc.mjs";
import { n as signIn } from "./client-DvFalId7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/login-D-seXu-i.js
var import_jsx_runtime = require_jsx_runtime();
function Login() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-dvh place-items-center px-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm rounded-[32px] bg-panel p-7 shadow-book",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm tracking-[0.3em] text-muted",
					children: "家长中心"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-1 font-display text-4xl text-cinnabar",
					children: "登录"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm leading-relaxed text-ink-soft",
					children: "小朋友听故事不用登录。家长登录后，可以在这台设备上记下听过的书。"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6 space-y-3",
					children: GROK_PROVIDERS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => signIn(p.providerId, { callbackURL: "/" }),
						className: "h-12 w-full rounded-full border border-line bg-paper text-base text-ink transition-transform duration-150 ease-out hover:bg-paper-deep active:scale-[0.96]",
						children: [
							"使用 ",
							p.label,
							" 继续"
						]
					}, p.providerId))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/",
					className: "mt-6 block text-center text-sm text-ink-soft underline-offset-4 hover:underline",
					children: "回书架，先听故事"
				})
			]
		})
	});
}
//#endregion
export { Login as component };
