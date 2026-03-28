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
      // Habilita Hot Module Replacement (HMR)
      hmr: process.env.DISABLE_HMR !== "true",
      // Permite acesso externo ao container
      host: "0.0.0.0",
      port: 5173,
      // Proxy para chamadas API durante o desenvolvimento local
      proxy: {
        "/api": {
          target: env.VITE_API_URL || "http://localhost:8000",
          changeOrigin: true,
          secure: false,
          // ✅ CORRETO: barra escapada no regex
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/import": {
          target: env.VITE_API_URL || "http://localhost:8000",
          changeOrigin: true,
          secure: false,
          // ✅ CORRETO: barra escapada no regex
          rewrite: (path) => path.replace(/^\/import/, "/api/import"),
        },
      },
    },
  };
});