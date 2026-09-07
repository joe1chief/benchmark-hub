/**
 * GitHub Pages 专用构建配置
 * 
 * 使用方法：
 *   pnpm build:ghpages
 * 
 * 构建产物在 dist-ghpages/ 目录，可直接推送到 gh-pages 分支
 * 
 * 注意：
 * - base 设置为 './' 以支持相对路径（适配任意 GitHub Pages 子路径）
 * - 如果部署在 https://username.github.io/repo-name/ 则需要将 base 改为 '/repo-name/'
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";

// Validate the assets consumed by the website before bundling either target.
const htmlBuildProcessAudit = {
  name: "html-build-process-audit",
  apply: "build" as const,
  buildStart() {
    execFileSync(process.execPath, [
      path.resolve(import.meta.dirname, "scripts/benchmark_build_process/audit_build_process_assets.mjs"),
      "--root", import.meta.dirname, "--html",
    ], { stdio: "inherit" });
  },
};

export default defineConfig({
  plugins: [htmlBuildProcessAudit, react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "/llm-benchmark-costco/",
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-ghpages'),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      external: ['mermaid'],
      output: {
        // 代码分割：将大型依赖单独打包
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['lucide-react', 'framer-motion'],
          'router': ['wouter'],
        },
        globals: {
          mermaid: 'mermaid',
        },
      },
    },
  },
});
