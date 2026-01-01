This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploy to GitHub Pages

This project is set up to export static assets and publish them to GitHub Pages.

### Automatic (recommended)

1. Ensure your default branch is `main` or `master`.
2. Push to GitHub. The workflow `.github/workflows/deploy.yml` will build, export, and deploy the site to the `gh-pages` environment.
3. In your repository settings, enable GitHub Pages to serve from the `gh-pages` branch (GitHub Pages → Source → GitHub Actions).

### Manual

```bash
pnpm install
NEXT_PUBLIC_GITHUB_PAGES=true pnpm run build
NEXT_PUBLIC_GITHUB_PAGES=true pnpm run export
touch out/.nojekyll
# deploy the contents of ./out to gh-pages
```
