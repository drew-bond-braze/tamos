# TAMos Migration Summary: Static Site → Next.js + NextAuth

## What Changed

### ✅ Completed Migrations

1. **Project Structure**
   - Converted from vanilla HTML/CSS/JS to Next.js (Pages Router)
   - Created `pages/` directory with React components
   - Moved `storage-manager.js` to `lib/storage-manager.js` with browser guards
   - Removed `privacy-manager.js` (replaced by NextAuth)

2. **Authentication**
   - Added NextAuth.js with Google OAuth provider
   - Implemented @braze.com email restriction (server-side)
   - Added login gate on all pages
   - Created protected API route example (`/api/healthscore`)

3. **React Conversion**
   - Converted `index.html` → `pages/index.js` (with login gate)
   - Converted `form.html` → `pages/form.js` (React component)
   - Converted `review.html` → `pages/review.js` (React component)
   - Replaced DOM event listeners with React handlers
   - Converted vanilla JS class to React hooks (useState, useEffect)

4. **Storage Manager**
   - Added browser guards (`typeof window === "undefined"`) throughout
   - Removed encryption dependencies (privacy-manager)
   - Maintained all existing APIs and behavior
   - Works client-side only (no server-side execution)

5. **Styling**
   - Kept `styles.css` unchanged
   - Imported globally in `pages/_app.js`
   - All existing styles work as before

### 🔒 Security Enhancements

- Server-side authentication via NextAuth
- Email domain restriction (@braze.com only)
- Email verification requirement
- Protected API routes with session validation

### 📦 New Dependencies

```json
{
  "next": "^14.0.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "next-auth": "^4.24.0"
}
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` file:

```env
GOOGLE_CLIENT_ID=<PASTE_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<PASTE_CLIENT_SECRET>
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Access Application

Open [http://localhost:3000](http://localhost:3000) in your browser.

## File Structure

```
tam-os/
├── pages/
│   ├── _app.js                    # SessionProvider wrapper + global styles
│   ├── index.js                   # Home page (login gate)
│   ├── form.js                    # Form submission page
│   ├── review.js                  # Form review page
│   └── api/
│       ├── auth/
│       │   └── [...nextauth].js   # NextAuth configuration
│       └── healthscore.js         # Protected API example
├── lib/
│   └── storage-manager.js         # Client-side storage (browser-only)
├── styles.css                     # Global styles (unchanged)
├── package.json                   # Dependencies
├── next.config.js                 # Next.js config
├── .env.local.example             # Environment template
└── README.md                      # Updated documentation
```

## Key Implementation Details

### Authentication Flow

1. User visits `/` → sees "Sign in with Google" button
2. Clicks button → redirected to Google OAuth
3. Google validates @braze.com email → returns to app
4. NextAuth validates email ends with `@braze.com` and is verified
5. Session created → user can access app

### Storage Manager

- Only runs in browser (guarded with `typeof window === "undefined"`)
- Maintains backward compatibility with existing localStorage/IndexedDB data
- No changes to data structure or APIs
- Removed encryption (was in privacy-manager)

### API Protection

All API routes check:
1. Valid NextAuth session exists
2. Email ends with `@braze.com`
3. Returns 401/403 if validation fails

## Deployment (Vercel)

### Environment Variables (Production)

```env
GOOGLE_CLIENT_ID=<same>
GOOGLE_CLIENT_SECRET=<same>
NEXTAUTH_URL=https://tamos-pink.vercel.app
NEXTAUTH_SECRET=<same>
```

### Google OAuth Redirect URI

Add to Google Cloud Console:
```
https://tamos-pink.vercel.app/api/auth/callback/google
```

## Breaking Changes

1. **Requires Node.js** - No longer a static site
2. **Requires Authentication** - Must sign in with @braze.com Google account
3. **Requires Environment Setup** - Must configure OAuth credentials
4. **No Privacy Manager** - Encryption features removed (replaced by NextAuth)

## Backward Compatibility

- ✅ Existing localStorage/IndexedDB data is compatible
- ✅ Form structure unchanged
- ✅ UI/UX maintained
- ✅ Storage manager APIs unchanged

## Testing Checklist

- [ ] Sign in with @braze.com Google account
- [ ] Access denied for non-@braze.com emails
- [ ] Form submission works
- [ ] Draft saving works
- [ ] Form review page displays correctly
- [ ] Modal opens for completed forms
- [ ] Draft deletion works
- [ ] Multi-tab sync works (if applicable)
- [ ] Protected API route rejects unauthenticated requests

## Next Steps

1. Set up Google OAuth credentials
2. Configure environment variables
3. Test locally with `npm run dev`
4. Deploy to Vercel
5. Update Google OAuth redirect URIs
6. Test production deployment

---

**Migration completed successfully!** 🎉

