import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    // 로컬 개발 시 /api 요청을 wrangler dev(8787)로 전달
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
