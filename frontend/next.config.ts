import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.25",
    "localhost:3000",
    "float-festivity-spotter.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.ngrok.app",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:5000/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:5000/uploads/:path*",
      },
      {
        source: "/socket.io",
        destination: "http://127.0.0.1:5000/socket.io",
      },
      {
        source: "/socket.io/:path*",
        destination: "http://127.0.0.1:5000/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
