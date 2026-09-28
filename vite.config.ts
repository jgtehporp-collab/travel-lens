import type { IncomingMessage, ServerResponse } from "node:http";
import { type Plugin, defineConfig, loadEnv } from "vite";

/**
 * 로컬 개발용: /api/* 요청을 api/*.ts 의 GET/POST 핸들러로 직접 전달한다.
 * (배포 환경에서는 Vercel이 같은 파일을 Functions로 실행)
 */
function vercelApiDev(): Plugin {
  return {
    name: "vercel-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(/^\/api\/([a-z-]+)$/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const handler = mod[req.method ?? "GET"] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const request = new Request(url, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          if ((err as Error).message?.includes("Failed to load")) return next();
          server.config.logger.error(String(err));
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "dev server error" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env.local 의 ANTHROPIC_API_KEY, APP_TOKEN 등을 서버 코드(process.env)에서 읽을 수 있게
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    server: { host: true },
    plugins: [vercelApiDev()],
  };
});
