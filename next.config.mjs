/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.(png|jpg|jpeg|gif|svg|webp)$/i,
      type: "asset/resource",
    });
    return config;
  },
};

export default nextConfig;
