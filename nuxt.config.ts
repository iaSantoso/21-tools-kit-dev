export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['@fontsource/roboto-mono/latin-400.css', '~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
  app: {
    head: {
      title: 'JSON Glow — Formatter & Diff Checker',
      link: [
        {
          rel: 'icon',
          type: 'image/png',
          href: '/favicon-jb.png'
        },
        {
          rel: 'apple-touch-icon',
          href: '/favicon-jb.png'
        }
      ],
      meta: [
        {
          name: 'theme-color',
          content: '#0b0f14'
        },
        {
          property: 'og:image',
          content: '/favicon-jb.png'
        },
        {
          name: 'description',
          content: 'Format, validate, minify, and compare JSON with clear Git-style differences.'
        }
      ]
    }
  }
})
