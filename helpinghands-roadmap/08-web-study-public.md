# Step 08 — Public Website: Study, Vote & Online Payment

## Context

You are working on `apps/web/src/`.
The API is fully built. The public site uses Next.js 14 App Router with next-intl.
Add new pages for study reading, voting, and the Stripe/PayPal online donation flow.

---

## New routes

```
apps/web/src/app/[locale]/
├── projects/[id]/
│   ├── page.tsx              ← MODIFY: add study status banner + donate button logic
│   └── study/
│       └── page.tsx          ← NEW: full study detail with vote form
├── donations/
│   ├── [token]/page.tsx      ← existing QR page, no change
│   ├── success/page.tsx      ← NEW: after online payment success
│   └── cancel/page.tsx       ← NEW: after online payment cancelled
└── dashboard/page.tsx        ← MODIFY: add online donations, vote history, notifications
```

---

## Modify: `projects/[id]/page.tsx`

### Study status banner
Above the donate section, show a banner based on the project's study status:

| Study status | Banner shown |
|---|---|
| `null` (no study yet) | Nothing (project not yet in study phase) |
| `draft` / `in_review` | "This project is currently under review. Donations open after approval." |
| `published` / `voting_open` | "Community vote is open! Read the study and cast your vote." + link |
| `voting_closed` | "Voting has ended. Awaiting final approval." |
| `approved` | Nothing — show donation options normally |
| `rejected` | "This project was not approved at this time." |

### Donate button logic
- If study status is NOT `approved`: disable the donate button, show tooltip "Donations open after study approval"
- If study approved: show TWO donation options:
  1. "Donate with Cash" → existing QR flow (modal with amount input)
  2. "Donate Online" → new Stripe/PayPal flow (shows provider selection)

---

## New page: `projects/[id]/study/page.tsx`

### Content
Full public view of the published study. Only visible when `status >= published`.

Layout:
1. **Project header**: name, type, location, cover image
2. **Study summary**: executive summary text
3. **Sections list**: each section as an expandable card showing full content + attached files
4. **Vote section**: (see below)
5. **Results section**: vote chart (once voting has happened)

### Vote section (conditional)

**Not logged in**: Show "Login to vote" button.
**Logged in, voting not open**: Show "Voting opens on [date]" or "Voting has closed."
**Logged in, voting open, not voted yet**: Show vote form:
```
How do you vote on this study?

  [✓ In favour]    [✗ Against]    [— Abstain]

Optional comment: [textarea]

[Submit my vote]
```

**Logged in, already voted**: Show their vote with option to change it (while voting is still open).

---

## New page: `donations/success/page.tsx`

Shown after successful Stripe/PayPal redirect.

```
✓ Thank you for your donation!

Your donation of $500 to Green Farm Project has been confirmed.
Transaction ID: pi_3P...
A confirmation email has been sent to your@email.com

[View your donations →]     [Back to projects →]
```

Read transaction details from the URL query params (`?session_id=...`) and call `GET /payments/donations/:id/status` to confirm.

---

## New page: `donations/cancel/page.tsx`

```
Payment was cancelled.

Your donation was not processed. You can try again at any time.

[Try again →]     [Back to project →]
```

Read `?projectId=...` from URL to provide the correct "Try again" link.

---

## Online donation flow (in project detail page)

When user clicks "Donate Online":
1. Show amount input + currency selector
2. Show provider buttons: [Pay with Stripe] [Pay with PayPal]
3. On provider click: call `POST /payments/checkout` with `{ projectId, amount, provider }`
4. API returns `{ checkoutUrl }` → redirect user to `checkoutUrl`
5. Stripe/PayPal redirects back to `success` or `cancel` URL

```typescript
// In lib/api.ts
paymentsApi.createCheckout(projectId: number, amount: number, provider: 'stripe' | 'paypal')
```

---

## Modify: `dashboard/page.tsx` — Participant Dashboard

### Add tab: "My Votes"
List of all studies the participant voted on:
- Project name
- Study status
- Their vote (badge: For / Against / Abstain)
- Date voted
- Link to study page

### Add tab: "Online Donations"
List all online donations with:
- Project name
- Amount + currency
- Provider (Stripe badge / PayPal badge)
- Status badge (pending / completed / failed)
- Date
- Download receipt button (for completed donations — shows a simple printable confirmation page)

### Add notification bell
Same bell icon as admin dashboard. Call `GET /notifications/unread-count` and show in header.
Dropdown with last 10 notifications, mark as read on click.

---

## i18n: add to message files

Add translation keys to `messages/en.json` and `messages/ar.json`:

```json
{
  "study": {
    "underReview": "This project is currently under review",
    "voteOpen": "Community vote is open!",
    "readStudy": "Read the study and vote",
    "approved": "Study approved — donations are open",
    "rejected": "This project was not approved",
    "vote": {
      "for": "In favour",
      "against": "Against",
      "abstain": "Abstain",
      "submit": "Submit my vote",
      "change": "Change my vote",
      "yourVote": "Your vote",
      "loginToVote": "Login to vote"
    }
  },
  "payment": {
    "donateOnline": "Donate Online",
    "donateCash": "Donate with Cash",
    "selectProvider": "Choose payment method",
    "stripe": "Credit / Debit Card",
    "paypal": "PayPal",
    "success": {
      "title": "Thank you for your donation!",
      "confirmed": "Your donation has been confirmed"
    },
    "cancel": {
      "title": "Payment was cancelled",
      "message": "Your donation was not processed"
    }
  }
}
```

---

## Important UX rules

- The study page must be fully server-rendered for SEO (use Next.js Server Components)
- Vote form must be a Client Component (uses state and auth context)
- Online payment redirect must happen client-side (window.location.href = checkoutUrl)
- Show a loading spinner while awaiting the checkout URL from the API
- The success page must verify the payment server-side before showing "confirmed" — never trust the URL alone
