# Dontalist

Dental clinic CRM. Angular 22, server-side rendered. Product direction: [country packs and Morocco-first scope](docs/product-direction-country-packs.md). Current product audit: [docs/product-audit.md](docs/product-audit.md). Backend/domain planning: [docs/domain-model.md](docs/domain-model.md). Design rules: [DESIGN.md](DESIGN.md). Calendar contract: [DENTEUS.md](DENTEUS.md). Claude handoff: [docs/claude-handoff-2026-11-10.md](docs/claude-handoff-2026-11-10.md). Database readiness handoff: [docs/database-readiness-handoff.md](docs/database-readiness-handoff.md).

Needs Node `^22.22.3`, `^24.15.0` or newer (Angular 22's requirement).

```bash
npm install
npm start            # dev server on http://localhost:4200
npm test             # unit tests (Vitest)
npm run build        # browser + server bundles in dist/calendar-app
NG_ALLOWED_HOSTS=localhost npm run serve:ssr:calendar-app   # run the built SSR server on :4000
```

`NG_ALLOWED_HOSTS` is a comma-separated list of host names the server will answer to; production hosts are also listed in `angular.json` (`security.allowedHosts`).
