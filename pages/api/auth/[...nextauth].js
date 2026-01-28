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
        if (!token.email && user.email) {
          token.email = user.email;
        }
      }

      const tokenEmail = token?.email || user?.email;
      if (tokenEmail && (!token.sheetData || typeof token.sheetData !== "object")) {
        try {
          const sheetData = await getUser(tokenEmail);
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
        let sheetData =
          token?.sheetData && typeof token.sheetData === "object" ? token.sheetData : null;
        if (!sheetData && session.user.email) {
          try {
            sheetData = await getUser(session.user.email);
          } catch (error) {
            console.error("Error fetching user from sheet during session phase:", error);
          }
        }

        const mergedUser = {
          ...(sheetData && typeof sheetData === "object" ? sheetData : {}),
          ...session.user,
          image: token.picture || session.user.image
        };

        const resolvedUserId =
          mergedUser.user_id ||
          mergedUser.userId ||
          mergedUser.email_address ||
          mergedUser.email ||
          mergedUser.id ||
          token.sub;

        session.user = {
          ...mergedUser,
          id: resolvedUserId
        };

        if (sheetData && typeof sheetData === "object") {
          token.sheetData = sheetData;
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