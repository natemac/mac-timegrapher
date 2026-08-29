# web

The browser timegrapher application. See the [repository
README](../README.md) for what this project is, how it relates to `tg`, and
its licence, and [docs/roadmap.md](../docs/roadmap.md) for where it is going.

    npm install
    npm run dev      # http://localhost:5173/tools/timegrapher/
    npm test
    npm run lint
    npm run build

The dev server and the production build are both served from
`/tools/timegrapher/` by default. Override that with `VITE_BASE`, for example
`VITE_BASE=/ npm run build` to serve from the root of a domain.

All source in this directory is GPLv2 (version 2 only), the same as the rest
of the repository.
