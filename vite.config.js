import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const basePath = mode === 'beta' ? '/gembook/beta/' : '/gembook/';

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
        workbox: {
          // 1. Forza Workbox ad accettare file fino a 15MB (risolve l'errore di build)
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        },
        manifest: {
          name: mode === 'beta' ? 'GemBook - eReader (BETA)' : 'GemBook - eReader',
          short_name: mode === 'beta' ? 'GemBook Beta' : 'GemBook',
          description: 'Il mio fantastico lettore EPUB',
          theme_color: '#5e35b1',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'web-app-manifest-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'web-app-manifest-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'web-app-manifest-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    build: {
      // Alza il limite del warning sui chunk a 1.5MB per pulire i log della build
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // 2. Splitting intelligente: separa React e isola i pacchetti giganti
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) {
                return 'vendor-react';
              }
              // Se usi librerie specifiche per epub (es. epubjs, jszip, ecc.) creano un loro chunk
              if (id.includes('epub') || id.includes('zip')) {
                return 'vendor-core-reader';
              }
              return 'vendor-others';
            }
          }
        }
      }
    }
  };
});