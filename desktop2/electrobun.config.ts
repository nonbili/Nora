import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Nora",
		identifier: "jp.nonbili.nora",
		version: "0.1.8",
	},
	build: {
		bun: {
			entrypoint: "src/main/index.ts",
		},
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
			icon: "icon.png",
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
