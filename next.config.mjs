/** @type {import('next').NextConfig} */
const nextConfig = {
  // subset-font（内部で harfbuzzjs の WASM を使用）は webpack バンドル対象から外し、
  // Node.js の require でそのまま読み込ませる（WASM のバンドルエラーを回避するため）
  experimental: {
    serverComponentsExternalPackages: ['subset-font', 'harfbuzzjs', 'sharp'],
  },
};

export default nextConfig;
