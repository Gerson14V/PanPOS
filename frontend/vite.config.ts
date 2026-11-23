import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Bootstrap Icons declara la fuente con dos archivos externos (woff2 + woff).
 * En la caja (Edge --app + servidor `php -S` de un solo hilo) la petición de la
 * fuente a veces se pierde en la primera carga y los íconos salen como cuadros.
 * Este plugin deja solo el woff2 (todo navegador moderno lo soporta) para que
 * `assetsInlineLimit` lo incruste en el CSS: cero peticiones extra, cero carreras.
 */
function iconosIncrustados(): Plugin {
  return {
    name: 'panpos-iconos-incrustados',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('bootstrap-icons') || !id.endsWith('.css')) return null
      return code
        .replace(/,\s*url\("\.\/fonts\/bootstrap-icons\.woff\?[^"]*"\) format\("woff"\)/, '')
        .replace(/(bootstrap-icons\.woff2)\?[^"]*/, '$1')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [iconosIncrustados(), react()],
  build: {
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? true : undefined),
  },
})
