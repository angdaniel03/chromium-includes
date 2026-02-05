 import { defineConfig } from 'vite'
 import react from '@vitejs/plugin-react'
 import tailwindcss from '@tailwindcss/postcss'
 import autoprefixer from 'autoprefixer'

 export default defineConfig({
   plugins: [react()],
   // Replace 'dashboard' with your GitLab project name
   base: '/dashboard/',
   css: {
 postcss: {
   plugins: [tailwindcss, autoprefixer],
 },
   },
 })