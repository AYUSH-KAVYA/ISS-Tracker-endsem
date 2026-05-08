# ISS + News + AI Dashboard

React + Vite dashboard with:
- Live ISS tracking with path, speed, and nearest place
- People currently in space
- News board (2 categories x 5 articles = 10 total) with search/sort/refresh
- Restricted AI chatbot (answers using dashboard data only)
- Interactive charts (ISS speed line chart + news distribution doughnut)
- Dark/light mode, responsive layout, loading/error states, and toast notifications

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Fill keys:
   - `VITE_NEWS_API_KEY=...`
   - `VITE_AI_TOKEN=...`
4. Run:
   - `npm run dev`

## Build

- `npm run build`
- `npm run preview`

## Deployment Notes

- Never hardcode API keys.
- Add `VITE_NEWS_API_KEY` and `VITE_AI_TOKEN` in Vercel environment settings.
- External APIs are called through internal `/api/*` routes for reliability:
  - `/api/iss-now`
  - `/api/astros`
  - `/api/news`
  - `/api/chat`
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
