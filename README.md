# JSON Glow

Modern JSON beautifier built with Nuxt.

## Features

- Beautify and minify JSON
- Validate JSON with inline errors
- Copy and download output
- Upload JSON files
- Choose indent size
- Sort object keys

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Automatic Vercel deployment

Every push to `main` triggers the production workflow in
`.github/workflows/vercel-production.yml`.

Configure these repository secrets in GitHub under
**Settings → Secrets and variables → Actions**:

- `VERCEL_TOKEN`: a Vercel access token
- `VERCEL_ORG_ID`: the `orgId` from `.vercel/project.json`
- `VERCEL_PROJECT_ID`: the `projectId` from `.vercel/project.json`

Run `vercel link` once from this project directory to link the existing Vercel
project and obtain both IDs. The `.vercel` directory is ignored by Git.
