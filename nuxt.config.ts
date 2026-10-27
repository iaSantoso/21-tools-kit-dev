export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['@fontsource/roboto-mono/latin-400.css', '~/assets/css/main.css'],
  compatibilityDate: '2026-07-01',
  app: {
    head: {
      title: '21-tools-kit-dev — JSON Formatter & Diff Checker',
      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/21-tools-kit-logo.svg'
        },
        {
          rel: 'apple-touch-icon',
          href: '/21-tools-kit-logo.png'
        }
      ],
      meta: [
        {
          name: 'theme-color',
          content: '#edf5f3'
        },
        {
          property: 'og:image',
          content: '/21-tools-kit-logo.png'
        },
        {
          name: 'description',
          content: 'Format, validate, minify, and compare JSON with 21-tools-kit-dev.'
        }
      ]
    }
  }
})
