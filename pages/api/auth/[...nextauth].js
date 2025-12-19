import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          hd: "braze.com", // Hint to Google to show only @braze.com accounts
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Require email to be verified
      if (!profile?.email_verified) {
        return false;
      }
      
      // Require email to end with @braze.com
      if (!profile?.email?.endsWith("@braze.com")) {
        return false;
      }
      
      return true;
    },
    async session({ session, token }) {
      // Ensure email is in session
      if (session?.user?.email && !session.user.email.endsWith("@braze.com")) {
        return null; // Reject session if email doesn't match
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)

