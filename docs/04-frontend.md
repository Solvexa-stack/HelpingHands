# Frontend — Public Website (`apps/web`)

## Overview

The public-facing Next.js 14 application that participants use to browse projects, register, manage their account, and receive their donation QR codes.

- **Port:** 3000
- **Framework:** Next.js 14 App Router
- **i18n:** next-intl with locale segment (`/en/`, `/ar/`, `/fr/`)
- **Styling:** Tailwind CSS + Radix UI
- **State:** React Context (auth) + React Query (server state)

---

## Routes

All routes are prefixed with `[locale]` (en / ar / fr).

| Route | Page File | Auth? | Description |
|-------|-----------|-------|-------------|
| `/` | `[locale]/page.tsx` | No | Home: hero, stats, featured projects, latest news |
| `/projects` | `[locale]/projects/page.tsx` | No | Projects list with filters |
| `/projects/[id]` | `[locale]/projects/[id]/page.tsx` | No | Project detail with donation CTA |
| `/donations/[token]` | `[locale]/donations/[token]/page.tsx` | No | Donation verification page (QR landing) |
| `/auth/login` | `[locale]/auth/login/page.tsx` | No (redirect if logged in) | Participant login |
| `/auth/register` | `[locale]/auth/register/page.tsx` | No (redirect if logged in) | Participant registration |
| `/dashboard` | `[locale]/dashboard/page.tsx` | Yes (participant) | Own donation history + profile |
| `/blogs` | `[locale]/blogs/page.tsx` | No | Blog listing |
| `/news` | `[locale]/news/page.tsx` | No | News listing |
| `/events` | `[locale]/events/page.tsx` | No | Events listing |
| `/about` | `[locale]/about/page.tsx` | No | About Us content |
| `/contact` | `[locale]/contact/page.tsx` | No | Contact form |

---

## Directory Structure

```
apps/web/src/
├── app/
│   └── [locale]/
│       ├── layout.tsx              # Root layout (providers, fonts, locale)
│       ├── page.tsx                # Home page
│       ├── auth/
│       │   ├── login/page.tsx
│       │   └── register/page.tsx
│       ├── projects/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── donations/
│       │   └── [token]/page.tsx   # QR token verification landing
│       ├── dashboard/page.tsx
│       ├── blogs/page.tsx
│       ├── news/page.tsx
│       ├── events/page.tsx
│       ├── about/page.tsx
│       └── contact/page.tsx
│
├── components/
│   ├── layout/
│   │   ├── navbar.tsx             # Top nav with locale switcher + auth menu
│   │   └── footer.tsx
│   ├── projects/
│   │   ├── project-card.tsx       # Project summary card
│   │   └── project-filters.tsx    # Category / search filter bar
│   ├── donations/
│   │   └── donate-button.tsx      # CTA opens donation modal
│   ├── blocks/
│   │   └── block-card.tsx         # Generic content card (news, blog, event)
│   └── ui/
│       └── progress-bar.tsx       # Funding progress bar
│
├── contexts/
│   └── auth-context.tsx           # AuthProvider: login, register, logout, refreshUser
│
├── lib/
│   ├── api.ts                     # Axios instance + all API calls
│   ├── auth.ts                    # Token storage helpers
│   └── utils.ts                   # cn(), date formatters, etc.
│
├── middleware.ts                   # next-intl locale detection & routing
├── i18n.ts                        # next-intl config
└── providers.tsx                  # Wraps: AuthProvider, QueryClientProvider, ToastProvider
```

---

## Authentication

### Token Storage (`lib/auth.ts`)

```typescript
getStoredTokens()   // { accessToken, refreshToken } from localStorage
setTokens(...)      // Write both tokens to localStorage
clearTokens()       // Remove both tokens
isAuthenticated()   // Boolean — has valid token in storage
```

Keys: `access_token`, `refresh_token`

### Auth Context (`contexts/auth-context.tsx`)

```typescript
const { user, login, register, logout, refreshUser } = useAuth()
```

- `user` is `null` when not logged in.
- `login(email, password)` calls `/auth/login`, stores tokens, sets user.
- `logout()` calls `/auth/logout`, clears tokens.
- On mount, if tokens exist, calls `/auth/me` to restore session.

### Axios Auto-Refresh (`lib/api.ts`)

The Axios instance has a response interceptor:

1. On **401**, attempt `POST /auth/refresh` using the stored refreshToken.
2. If refresh succeeds, store new tokens and **retry the original request**.
3. If refresh fails, clear tokens and redirect to `/[locale]/auth/login`.

---

## i18n (Multi-language)

**Supported locales:** `en`, `ar`, `fr`

**Translation files:** `apps/web/messages/en.json`, `messages/ar.json`

**RTL support:** Arabic (`ar`) uses `dir="rtl"` on the `<html>` tag, applied via the locale layout.

**Locale switching:** The navbar renders a language picker that replaces the locale segment in the current URL.

**Adding a new language:**

1. Create `messages/fr.json` with all keys from `en.json`.
2. Add the locale code to `i18n.ts` locales array.
3. Add the language record in the Admin → Languages page.

---

## API Client (`lib/api.ts`)

All API calls are grouped by domain:

```typescript
// Auth
authApi.login(email, password)
authApi.register(data)
authApi.logout()
authApi.forgotPassword(email)
authApi.resetPassword(token, password)
authApi.getMe()

// Projects
projectsApi.list(filters)          // { category?, location?, search?, page?, limit? }
projectsApi.get(id)

// Donations
donationsApi.list(filters)
donationsApi.get(id)
donationsApi.getByToken(token)     // QR landing page
donationsApi.create(projectId, amount)
donationsApi.cancel(id)
donationsApi.getQr(token)
donationsApi.downloadQrUrl(token)  // Returns URL string for <a href> download

// Blocks (content)
blocksApi.list(category?, page?, limit?)
blocksApi.getBySlug(slug)
blocksApi.get(id)

// Languages
languagesApi.list()

// Participants (own profile)
participantsApi.get(id)
participantsApi.update(id, data)
```

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Key Patterns

**Server vs. Client components:**
- Page components that only list data are Server Components (no `"use client"`, fetch directly).
- Interactive components (forms, modals, buttons with state) are Client Components.

**Locale-aware links:** Use `next-intl`'s `Link` component instead of Next.js's `Link` so the current locale is preserved automatically.

**QR Token Page:** `/donations/[token]` is a public page. It calls `donationsApi.getByToken(token)` and shows the donation's status, amount, and project name. This is the page encoded in each QR code.
