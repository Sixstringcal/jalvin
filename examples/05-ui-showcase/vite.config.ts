import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import jalvin from "@jalvin/vite-plugin";

export default defineConfig({
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
