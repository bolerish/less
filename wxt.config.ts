import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "wxt";
import { bolerishTokens } from "./build/bolerish-tokens";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  entrypointsDir: "entries",
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  autoIcons: {
    baseIconPath: "assets/logo.svg",
    developmentIndicator: false,
    sizes: [128, 96, 48, 32, 16],
  },
  alias: {
    "~assets": "./src/assets",
    "~entries": "./src/entries",
    "~features": "./src/features",
    "~shared": "./src/shared",
  },
  manifest: {
    name: "__MSG_ext_name__",
    short_name: "Veil",
    description: "__MSG_ext_description__",
    default_locale: "en",
    action: {
      default_title: "Veil",
      default_icon: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        96: "icons/96.png",
        128: "icons/128.png",
      },
    },

    permissions: ["storage", "activeTab", "webNavigation", "scripting"],
  },
  vite: () => ({
    plugins: [bolerishTokens(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  }),
});
