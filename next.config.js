/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfill Node built-ins that @google/earthengine references in browser bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        os: false,
        path: false,
        url: false,
        zlib: false,
        buffer: false,
        util: false,
        assert: false,
        events: false,
        querystring: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
