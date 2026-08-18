/**
 * Vite 构建与测试配置。
 *
 * 构建：把客户端插件打包成 DSH 模块加载器要求的 classic script。DSH 客户端
 * bundle 的契约是调用 `window.__ModuleLoader__.load({ id, factory })`，其中
 * factory 接收一个 CJS 风格的 `require`。Vite 库模式先产出标准 IIFE 产物，
 * 再由 `dshLoaderWrapper` 插件在 generateBundle 阶段把它包进 loader 调用闭包。
 * 相比旧的手写内联脚本（tsc + 按行剥 import/export），这里由 rollup 负责真正的
 * 模块解析、依赖打包与 tree-shaking——src/client 因此可以自由 import 第三方包，
 * 这是下个版本引入外部依赖的前提。
 *
 * 测试：vitest 直接复用本配置（environment: node），跑 test/*.test.ts。
 */
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

const ID = "dsh-message-copy-enhance";

/** generateBundle 阶段把 IIFE 产物包装成 `window.__ModuleLoader__.load({...})`。 */
function dshLoaderWrapper(): Plugin {
	return {
		name: "dsh-loader-wrapper",
		apply: "build",
		generateBundle(_options, bundle) {
			for (const file of Object.values(bundle)) {
				if (file.type !== "chunk" || !file.isEntry) continue;
				const body = file.code
					.split("\n")
					.map((line) => `\t\t${line}`)
					.join("\n");
				file.code = [
					"window.__ModuleLoader__.load({",
					`\tid: ${JSON.stringify(ID)},`,
					"\tfactory: (require) => {",
					// 库模式的 IIFE 产物是 `var __dshPlugin = (function(exports){…})({})`
					// 声明语句：执行后把导出对象返回给 DSH 加载器。
					body,
					"\t\treturn __dshPlugin;",
					"\t}",
					"});",
					"",
				].join("\n");
			}
		},
	};
}

export default defineConfig({
	build: {
		lib: {
			// 客户端入口；index.ts 导出 { name, inject, apply }，即 DSH 期望的插件形态。
			entry: "src/client/index.ts",
			formats: ["iife"],
			name: "__dshPlugin",
			fileName: () => "client.js",
		},
		outDir: "dist",
		emptyOutDir: true,
		minify: false,
		target: "es2022",
		sourcemap: false,
	},
	plugins: [dshLoaderWrapper()],
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
