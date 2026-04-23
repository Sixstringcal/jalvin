// ─────────────────────────────────────────────────────────────────────────────
// @jalvin/webpack-plugin — Webpack 5 loader + plugin for Jalvin
//
// webpack.config.js usage:
//
//   const JalvinPlugin = require("@jalvin/webpack-plugin");
//
//   module.exports = {
//     module: {
//       rules: [
//         {
//           test: /\.jalvin$/,
//           use: [
//             // Run ts-loader AFTER jalvin (loaders are applied right-to-left)
//             { loader: "ts-loader", options: { transpileOnly: true } },
//             { loader: "@jalvin/webpack-plugin/loader" },
//           ],
//         },
//       ],
//     },
//     plugins: [new JalvinPlugin()],
//   };
//
// ─────────────────────────────────────────────────────────────────────────────

import type { Compiler, WebpackPluginInstance } from "webpack";

export interface JalvinWebpackOptions {
  /** Emit TypeScript type annotations. Default: false */
  emitTypes?: boolean;
  /** Runtime package. Default: "@jalvin/runtime" */
  runtimeImport?: string;
}

export class JalvinPlugin implements WebpackPluginInstance {
  constructor(private readonly opts: JalvinWebpackOptions = {}) {}

  apply(compiler: Compiler): void {
    const PLUGIN_NAME = "JalvinPlugin";

    // Inject the loader for .jalvin files automatically
    compiler.hooks.afterEnvironment.tap(PLUGIN_NAME, () => {
      const rules = compiler.options.module?.rules;
      if (!rules) return;

      // Only inject if not already configured manually
      const alreadyConfigured = rules.some(
        (r) => r && typeof r === "object" && "test" in r &&
          r.test instanceof RegExp && r.test.test(".jalvin")
      );
      if (alreadyConfigured) return;

      rules.push({
        test: /\.jalvin$/,
        use: [
          {
            loader: require.resolve("./loader"),
            options: this.opts,
          },
        ],
      });
    });

    // Resolve .jalvin without explicit extension
    compiler.hooks.afterEnvironment.tap(PLUGIN_NAME, () => {
      const extensions = compiler.options.resolve?.extensions;
      if (extensions && !extensions.includes(".jalvin")) {
        extensions.push(".jalvin");
      }
    });
  }
}

export default JalvinPlugin;
