import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable compression for faster static file serving
  compress: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  
  webpack: (config) => {
    // Suppress warnings for optional React Native dependencies
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    
    // Ignore specific module warnings
    config.ignoreWarnings = [
      { module: /@metamask\/sdk/ },
      { module: /pino/ },
    ];
    
    return config;
  },
};

export default nextConfig;
