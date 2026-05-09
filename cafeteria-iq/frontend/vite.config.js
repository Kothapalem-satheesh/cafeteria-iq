import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: "0.0.0.0" },
  define: { global: "window" },
  resolve: {
    alias: {
      "buffer/": "buffer",
    },
  },
  optimizeDeps: {
    include: ["plotly.js", "react-plotly.js", "buffer"],
  },
});
