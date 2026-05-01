import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import jalvin from "@jalvin/vite-plugin";

export default defineConfig({
  server: {
    port: 3333,
    strictPort: true,
  },
  preview: {
    port: 3333,
    strictPort: true,
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      include: [/node_modules/, /packages\/runtime\/dist/],
    },
  },
  plugins: [
    jalvin({
      entry: {
        file: "./UIShowcase.jalvin",
        component: "UIShowcase",
        title: "@jalvin/ui Showcase",
      },
    }),
    react(),
  ],
});
