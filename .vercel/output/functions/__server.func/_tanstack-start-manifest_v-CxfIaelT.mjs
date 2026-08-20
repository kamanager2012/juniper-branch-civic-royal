//#region node_modules/.nitro/vite/services/ssr/assets/_tanstack-start-manifest_v-CxfIaelT.js
var tsrStartManifest = () => ({ routes: {
	__root__: {
		filePath: "/workspace/src/routes/__root.tsx",
		children: [
			"/",
			"/login",
			"/story/$id",
			"/api/auth/$"
		],
		preloads: ["/assets/index-D5aF338L.js"],
		scripts: [{ attrs: {
			type: "module",
			async: !0,
			src: "/assets/index-D5aF338L.js"
		} }]
	},
	"/": {
		filePath: "/workspace/src/routes/index.tsx",
		children: void 0,
		preloads: [
			"/assets/routes-COcaYTDK.js",
			"/assets/utils-CHGrTMcj.js",
			"/assets/client-3UI0xLUg.js"
		]
	},
	"/login": {
		filePath: "/workspace/src/routes/login.tsx",
		children: void 0,
		preloads: ["/assets/login-D1XJk5gO.js", "/assets/client-3UI0xLUg.js"]
	},
	"/story/$id": {
		filePath: "/workspace/src/routes/story.$id.tsx",
		children: void 0,
		preloads: ["/assets/story._id-HDDKS5Ra.js", "/assets/utils-CHGrTMcj.js"]
	}
} });
//#endregion
export { tsrStartManifest };
