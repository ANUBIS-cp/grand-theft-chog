# Chog City

A city game for the 1,969 Chog NFTs on Monad. Traits are skills, Chogs rep trait gangs, gangs fight for turf, and every
Chog keeps a record that stays with the NFT. Built for Chogathon 2026.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Live (building): https://chogcity.35-212-31-75.sslip.io/

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js app |
| `packages/data` | Chog traits (from the verified metadata snapshot), skills, gangs, districts |
| `tools/images` | Fetches every Chog image from IPFS once and writes resized copies |
| `deploy` | Server setup, Caddy, systemd, deploy script |

## Commands

```bash
npm ci
npm test          # data and rules tests
npm run typecheck
npm run dev       # web app on http://localhost:3000
deploy/deploy.sh  # ship the current commit (add --config to also install Caddy/systemd files)
```

`packages/data/scripts/verify-onchain.ts` checks the data against the Chog contract.
