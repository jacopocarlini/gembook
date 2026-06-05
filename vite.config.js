import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Se la modalità è 'beta', il base path sarà '/gembook/beta/', altrimenti il classico '/gembook/'
  const basePath = mode === 'beta' ? '/gembook/beta/' : '/gembook/';

  return {
    // Mantiene il percorso dinamico in base all'ambiente
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
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
    ]
  };
});