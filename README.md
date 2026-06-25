# ReliefTrack MY

Open-source Malaysia Income Tax Relief Tracker (PWA). Built with Next.js 16 + Supabase + Google Drive.

🌐 **Live:** https://relieftrack.dysolvit.com

## For Malaysians, by Malaysians

Track every receipt, donation, and lifestyle relief for **YA 2025/2026** in one place. All your data stays in **your own Supabase project** and **your own Google Drive** — never on our servers.

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Auth**: Supabase Auth (Google OAuth, magic link)
- **Database**: Supabase Postgres (your own project)
- **Receipt storage**: Google Drive (OAuth, scoped to your account)
- **OCR**: On-device / your own endpoint
- **PWA wrapper**: [relieftrack-app](https://github.com/dandycrypto/relieftrack-app) (Expo/React Native)

## Features

- 📋 Profile wizard (marital status, children, disabilities, parents)
- 💸 Record tracker with tax-relief categories
- 🧾 Receipt photo → OCR → auto-categorize
- 📊 Tax relief calculation per LHDN categories
- 🔐 Row-level security via Supabase RLS
- 💾 Receipt backup to your Google Drive
- 📱 Mobile-first PWA

## Self-host / White-label

You need:
1. **Supabase** project (free tier OK) — for auth + database
2. **Google Cloud** OAuth credentials — for Drive backup
3. **Vercel / your own host** — to deploy

See `.env.local.example` for required env vars.

## Local development

```bash
pnpm install
cp .env.local.example .env.local  # fill in your Supabase + Google creds
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## License

Open-source. Built for Malaysia.

## Maintainer

@dandycrypto
