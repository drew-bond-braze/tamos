import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { getUser } from "../google_sheets/users";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          hd: "braze.com",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!profile?.email_verified || !profile?.email?.endsWith("@braze.com")) {
        return false;
      }
      return true;
    },

    async jwt({ token, user, profile }) {
      if (user) {
        token.picture = user.image || profile?.picture || token.picture;
      }

      if (token?.email && !token.sheetData) {
        try {
          const sheetData = await getUser(token.email);
          token.sheetData = sheetData;
        } catch (error) {
          console.error("Error fetching user from sheet during JWT phase:", error);
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session?.user) {
        if (!session.user.email?.endsWith("@braze.com")) return null;
        const sheetData =
          token?.sheetData && typeof token.sheetData === "object" ? token.sheetData : null;
        const { email_address, ...otherSheetFields } = sheetData || {};

        session.user = {
          ...session.user,
          image: token.picture || session.user.image,
          ...otherSheetFields
        };

        if (!session.user.id) {
          session.user.id =
            sheetData?.id ||
            sheetData?.user_id ||
            token.sub ||
            session.user.email;
        }
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