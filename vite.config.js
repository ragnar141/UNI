// zoom-timeline/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/REPO_NAME/",    // <-- replace with your repo name
  plugins: [react()],
  build: { outDir: "dist" }
});