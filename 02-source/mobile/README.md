# Laras Field — Expo mobile app

Companion app for reconciliation analysts working away from the desk. It reuses the same Fastify API as the web console, so the triage queue, evidence and dispositions are shared in real time.

## Screens

| Tab | Purpose |
| --- | --- |
| **Triage** | Open queue with type/severity chips, risk-ranked cases, owner and ageing. |
| **Evidence** | Document register (kuitansi, invoices, evidence) with image preview and links back to cases. |
| **Capture** | Photograph a kuitansi, enter the declared nominal plus invoice number, upload to `/api/attachments`. RECEIPT uploads with an invoice number trigger a reconciliation run immediately. |

Tapping a case opens the exception detail: evidence values, ledger rows, invoice lines, linked kuitansi, attachments, assignment, resolution/ignore actions with audit history. Auditors get a read-only view.

## Run it

```bash
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH"
cd 02-source/mobile
npm install
npm start
```

Then press `i` (iOS simulator), `a` (Android emulator) or scan the QR with Expo Go.

The app needs a reachable API instance:

```bash
# terminal 1 — API on http://127.0.0.1:4100
cd 02-source/backend && npm run dev

# terminal 2 — optionally point the app at a LAN address (physical device)
cd 02-source/mobile
EXPO_PUBLIC_API_URL="http://192.168.1.20:4100" npm start
```

Defaults when `EXPO_PUBLIC_API_URL` is unset:

| Platform | URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:4100` |
| iOS simulator | `http://127.0.0.1:4100` |

For a physical device, use your machine's LAN IP and restart the API with `HOST=0.0.0.0` (the dev server binds to `127.0.0.1` by default). Expo Go can load the bundle over the LAN but cannot reach `127.0.0.1` of your laptop.

## Demo accounts

Password for all three: `laras2026`

| Email | Role | Mobile experience |
| --- | --- | --- |
| `rani@bcn.co.id` | ANALYST | Full triage, resolution, capture |
| `dimas@bcn.co.id` | SUPERVISOR | Full triage plus high-value approvals |
| `ayu@bcn.co.id` | AUDITOR | Read-only triage and evidence; Capture tab hidden |

Sessions are stored in `expo-secure-store` as `laras.session.token` / `laras.session.user` and revalidated against `/api/auth/me` on launch. Tokens expire after 12 hours; the app clears the session and returns to Login.

## Configuration

- `app.json` → `extra.apiUrl` is informational; the runtime value comes from `EXPO_PUBLIC_API_URL`.
- iOS bundle id `id.co.bcn.laras.field`, Android package `id.co.bcn.laras.field`.
- Camera and photo-library permissions are declared for both platforms.
- Uploads accept PDF/PNG/JPG/WEBP/SVG up to 8 MB. Photos are picked at 0.8 quality to stay inside the limit.
- Identical files are de-duplicated server-side by SHA-256; the UI shows an "Existing document reused" notice instead of creating a second row.

## Checks

```bash
npm run typecheck   # tsc --noEmit
```

This project was verified with TypeScript 5.6 in strict mode against Expo SDK 52 / React Native 0.76.6.
