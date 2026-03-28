import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // Habilita Hot Module Replacement (HMR) a menos que DISABLE_HMR esteja definido como "true"
      hmr: process.env.DISABLE_HMR !== "true",
      // Proxy para chamadas API durante o desenvolvimento local
      proxy: {
        // Se VITE_API_URL não estiver definido no .env ou for vazio,
        // redireciona requisições para /api para localhost:8000
        // (útil se você tiver um servidor backend local em :8000)
        "/api": {
          target: env.VITE_API_URL || "http://localhost:8000",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/import": {
           target: env.VITE_API_URL || "http://localhost:8000",
           changeOrigin: true,
           secure: false,
           rewrite: (path) => path.replace(/^\/import/, "/api/import"),
         },
      },
    },
  };
});