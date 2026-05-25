import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Importante: mantiene il percorso corretto per GitHub Pages
  base: '/gembook/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Istruisce il plugin su quali file iniettare nell'HTML e nella cache
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GemBook - eReader',
        short_name: 'GemBook',
        description: 'Il mio fantastico lettore EPUB',
        theme_color: '#5e35b1', // Il viola che usi nell'app
        background_color: '#ffffff', // Colore dello splash screen
        display: 'standalone', // <--- Rimuove la barra del browser
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
            // 'maskable' è FONDAMENTALE per Android.
            // Permette al sistema di ritagliare l'icona (es. tonda o quadrata)
            // senza tagliare via parti del logo 'G'.
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
});