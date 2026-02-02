import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    eslint: {
        // Allow production builds to succeed even with ESLint errors
        // TODO: Fix pre-existing ESLint errors and remove this
        ignoreDuringBuilds: true,
    },
};

export default nextConfig;
