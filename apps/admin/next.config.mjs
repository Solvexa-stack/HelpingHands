import { fileURLToPath } from 'url';

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/uploads/**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default config;
