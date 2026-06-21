import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

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
    name: "Pare - Clean Up Pages",
    short_name: "Pare",
    description: "Hide unwanted content and restore it when needed.",
    action: {
      default_title: "Pare",
      default_icon: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        96: "icons/96.png",
        128: "icons/128.png",
      },
    },

    permissions: ["storage"],
    web_accessible_resources: [
      {
        resources: ["logo.svg"],
        matches: ["<all_urls>"],
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  }),
});
