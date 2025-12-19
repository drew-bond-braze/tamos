# TAM-OS (Technical Account Manager Operating System)

A Next.js web application for managing customer health assessments and form submissions. Built with Next.js, React, and NextAuth for secure authentication.

## 🚀 Features

### Core Functionality
- **Form Submission**: Complete customer health assessment forms
- **Draft Management**: Save and resume incomplete forms
- **Form Review**: View and manage submitted forms and drafts
- **Local Storage**: All data stored locally in the browser (client-side persistence)
- **Secure Authentication**: Google OAuth with @braze.com email restriction

### Data Management
- **Draft Auto-Save**: Forms can be saved as drafts
- **Form Validation**: Client-side validation before submission
- **Data Persistence**: Uses localStorage and IndexedDB for reliable storage
- **Multi-tab Safe**: Handles concurrent access across browser tabs

## 📁 Project Structure

```
tam-os/
├── pages/
│   ├── _app.js              # Next.js app wrapper with SessionProvider
│   ├── index.js             # Home page with login gate
│   ├── form.js              # Form submission page
│   ├── review.js            # Form review and management page
│   └── api/
│       ├── auth/
│       │   └── [...nextauth].js  # NextAuth configuration
│       └── healthscore.js   # Protected API endpoint example
├── lib/
│   └── storage-manager.js   # Data storage and persistence (browser-only)
├── styles.css                # Application styling
├── package.json             # Dependencies
├── next.config.js           # Next.js configuration
└── .env.local.example       # Environment variables template
```

## 🛠️ Technical Stack

- **Framework**: Next.js 14 (Pages Router)
- **Frontend**: React 18
- **Authentication**: NextAuth.js (Auth.js) with Google OAuth
- **Storage**: localStorage, sessionStorage, IndexedDB (client-side only)
- **Deployment**: Vercel-ready

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Google OAuth credentials (Client ID and Secret)
- A @braze.com Google account for testing

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tam-os
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and add your credentials:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_nextauth_secret_here
   ```
   
   **Generate NEXTAUTH_SECRET:**
   ```bash
   openssl rand -base64 32
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Configure OAuth consent screen:
   - User Type: Internal (for @braze.com only)
   - Scopes: email, profile
6. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (for local dev)
     - `https://tamos-pink.vercel.app/api/auth/callback/google` (for production)
7. Copy the Client ID and Client Secret to your `.env.local`

## 🔐 Authentication

### Access Control
- **Email Restriction**: Only users with `@braze.com` email addresses can sign in
- **Email Verification**: Requires verified Google email
- **Server-side Validation**: All API routes check authentication and email domain

### Sign In Flow
1. User clicks "Sign in with Google"
2. Google OAuth consent screen appears (filtered to @braze.com)
3. User grants permissions
4. NextAuth validates email ends with `@braze.com` and is verified
5. User is redirected to the app

## 📋 Usage Guide

### Submitting Forms
1. Sign in with your @braze.com Google account
2. Navigate to **Submit Form** page
3. Fill out the customer health assessment
4. Click **"Save Draft"** to save progress
5. Click **"Submit Form"** when complete

### Managing Drafts
1. Go to the **Review Forms** page
2. View all drafts and completed forms
3. Click on a draft to continue editing
4. Use the delete button (🗑️) to remove drafts

### Data Management
- **Drafts**: Saved to localStorage/IndexedDB (client-side only)
- **Submissions**: Stored locally in browser
- **Multi-tab**: Changes sync across browser tabs

## 🔧 Configuration

### Environment Variables

#### Local Development (`.env.local`)
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_key
```

#### Production (Vercel Environment Variables)
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=https://tamos-pink.vercel.app
NEXTAUTH_SECRET=your_secret_key
```

### Storage Options
- **localStorage**: Primary storage for drafts and submissions
- **IndexedDB**: Backup storage for larger datasets
- **sessionStorage**: Temporary storage for active sessions

## 🚢 Deployment

### Vercel Deployment

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial Next.js migration"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [Vercel](https://vercel.com)
   - Import your GitHub repository
   - Add environment variables (same as `.env.local` but with production URL)
   - Deploy

3. **Update Google OAuth Redirect URI**
   - Add `https://your-domain.vercel.app/api/auth/callback/google` to authorized redirect URIs in Google Cloud Console

## 📊 API Routes

### Protected Endpoints

All API routes require authentication and @braze.com email verification.

**Example: `/api/healthscore`**
- Method: POST
- Authentication: Required (NextAuth session)
- Email Restriction: Must be @braze.com
- Response: JSON with submission confirmation

## 🔒 Security

### Authentication
- Server-side session validation
- Email domain restriction (@braze.com only)
- Email verification requirement
- Secure cookie-based sessions

### Data Storage
- All form data stored client-side (localStorage/IndexedDB)
- No sensitive data sent to server (except via protected API routes)
- Browser-based encryption not included (removed privacy-manager)

## 🐛 Troubleshooting

### Common Issues

1. **"Sign in with Google" not working**
   - Check Google OAuth credentials in `.env.local`
   - Verify redirect URI matches in Google Cloud Console
   - Ensure NEXTAUTH_URL matches your current URL

2. **"Access denied" error**
   - Verify your email ends with `@braze.com`
   - Check that email is verified in Google account
   - Review NextAuth callbacks in `pages/api/auth/[...nextauth].js`

3. **Drafts not saving**
   - Check browser storage permissions
   - Verify localStorage/IndexedDB is enabled
   - Check browser console for errors

4. **Forms not loading**
   - Clear browser cache and reload
   - Check that storage-manager.js is loading correctly
   - Verify browser compatibility

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🔄 Migration from Static Site

### What Changed
- ✅ Converted from vanilla HTML/JS to Next.js + React
- ✅ Added NextAuth with Google OAuth (@braze.com restriction)
- ✅ Moved `storage-manager.js` to `lib/` with browser guards
- ✅ Removed `privacy-manager.js` (replaced by NextAuth)
- ✅ Converted DOM event listeners to React handlers
- ✅ Added login gate on all pages
- ✅ Created protected API route example
- ✅ Maintained existing UI/UX and styling

### Breaking Changes
- Requires Node.js and npm to run
- Requires Google OAuth setup
- Requires @braze.com email to access
- Client-side storage unchanged (backward compatible with existing data)

## 📈 Performance

### Optimization Features
- Server-side rendering for initial page load
- Client-side hydration for interactivity
- Efficient React state management
- Debounced auto-save to prevent excessive writes
- Minimal bundle size with Next.js optimizations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

© 2024 TAM-OS. All rights reserved.

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify environment variables are set correctly
4. Check Next.js and NextAuth documentation

---

**Note**: This application stores form data locally in your browser. Make sure to export your data regularly for backup purposes. Authentication is handled server-side via NextAuth.
