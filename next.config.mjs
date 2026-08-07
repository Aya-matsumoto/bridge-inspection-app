/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp はネイティブバイナリを含むため webpack バンドル対象から外し、
  // Node.js の require でそのまま読み込ませる
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
};

export default nextConfig;
