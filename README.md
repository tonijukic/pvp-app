# PVP Ops — Pravo v praksi

Standalone multi-user web app (PWA) for Nina's legal practice: **Zadeve, Ure, Roki, Stroški**
(matters, time, deadlines, costs), plus a **legislation radar** (Phase 2). Cloned from the
`dashboard-v2` stack (React + Vite + Express + Drizzle/Neon + Render). **Separate from F45** —
own repo, Render service, Neon DB, and user accounts. Toni owns the infra until transfer to Nina.

## Run locally (in-memory, no DB)

```bash
cd pvp-app
corepack enable           # provides pnpm
pnpm install
cp .env.example .env      # leave DATABASE_URL unset -> in-memory storage
pnpm dev                  # http://localhost:5173  (login: PVP_ADMIN_USER / PVP_ADMIN_PASS)
```

> Node **22** is recommended (`.nvmrc`). Local Node 26 runs `pnpm dev` (tsx) fine but the
> production Vite build has known friction on 26 — build/deploy under Node 22.

## Status

- **Phase 0 (done):** scaffold, shared schema (users + tracker tables), auth (break-glass admin
  + DB accounts, roles `admin`/`member`), in-memory storage, bootable skeleton (login + shell).
- **Phase 1 (next):** tracker CRUD APIs + UI + PWA quick-entry, deadline reminders, monthly
  hours/cost summary. Then deploy to Render + create accounts.
- **Phase 2:** legislation radar (PISRS + IP-RS → weekly email digest + in-app section).

## Safety

All Nina-facing mail is gated by `PVP_REMINDERS_AUTOSEND` / `PVP_RADAR_AUTOSEND` (default **false**
→ drafts + previews only). Client matter data lives in its own Neon DB, never sent to third-party AI.

See `docs/pvp-app.md` for full architecture, ops, and handoff notes.
