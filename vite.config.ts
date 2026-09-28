// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // La API (Express + MySQL + Socket.IO) corre en el puerto 3001; Vite la expone en el mismo 8080
  vite: {
    server: {
      host: true,
      allowedHosts: true, // permite abrirla también desde un túnel (cloudflared/ngrok)
      port: 8080,
      proxy: {
        "/api": { target: "http://localhost:3001", xfwd: true },
        "/uploads": "http://localhost:3001",
        "/socket.io": { target: "http://localhost:3001", ws: true, xfwd: true },
      },
    },
  },
});
