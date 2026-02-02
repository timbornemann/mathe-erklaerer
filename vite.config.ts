import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3012,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Explicitly ensuring no build-time keys are leaked. 
        // User must provide key via UI.
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
