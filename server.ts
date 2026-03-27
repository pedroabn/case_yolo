/**
 * server.ts — Servidor de desenvolvimento local (apenas frontend).
 *
 * As rotas de API (/people, /import) foram migradas para funções AWS Lambda
 * definidas em backend/lambda_function.py e backend/import_lambda.py.
 * Para conectar o frontend às Lambdas, defina a variável VITE_API_URL no
 * arquivo .env com a URL do API Gateway gerada após o deploy:
 *
 *   VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev
 *
 * Para fazer o deploy do backend, execute na pasta backend/:
 *   serverless deploy
 */
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  if (process.env.NODE_ENV !== "production") {
    // Modo desenvolvimento: usa o Vite como middleware com HMR
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Modo produção: serve os arquivos estáticos do build
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor frontend rodando em http://localhost:${PORT}`);
    if (!process.env.VITE_API_URL) {
      console.warn(
        "AVISO: VITE_API_URL não definida. O app não conseguirá se conectar ao backend Lambda.\n" +
        "Defina VITE_API_URL no arquivo .env com a URL do API Gateway."
      );
    }
  });
}

startServer();
