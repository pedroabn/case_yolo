import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Sem proxy — o frontend fala diretamente com o API Gateway da AWS.
// VITE_API_URL no .env aponta para: https://xxx.execute-api.us-east-2.amazonaws.com/dev/api
// App.tsx usa: ${VITE_API_URL}/people, ${VITE_API_URL}/import etc.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== "true",
    host: "0.0.0.0",
    port: 5173,
  },
});