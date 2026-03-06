import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  async rewrites() {
    const backend = 'http://127.0.0.1:8000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/dl/:path*', destination: `${backend}/dl/:path*` },
      { source: '/s/:path*', destination: `${backend}/s/:path*` },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb'
    }
  }
};

export default nextConfig;
