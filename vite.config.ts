import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensures relative paths for assets, making the build "pure static" and portable
  server: {
    host: true,
    allowedHosts: true // Allow all hosts (IPs, custom domains, tunneling) to access the dev server
  }
});