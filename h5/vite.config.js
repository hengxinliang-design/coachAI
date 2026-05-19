import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",   // 相对路径：确保 iOS file:// 加载时资源可寻址
});
