import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // SOSTITUISCI CON IL NOME ESATTO DEL TUO REPOSITORY SU GITHUB (con le barre!)
  base: '/librain/',

  plugins: [
    react(),
    VitePWA({
      // ... (il resto della tua configurazione PWA)
    })
  ]
})