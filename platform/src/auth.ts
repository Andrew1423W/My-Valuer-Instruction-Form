import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

const hasEntra =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID && !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;

/**
 * Sign-in is Microsoft Entra ID (the firm's existing M365 tenant), so there
 * are no extra passwords to manage. In local development set DEV_USER_EMAIL
 * instead and the app acts as that seeded valuer — see src/lib/session.ts.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: hasEntra
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
        }),
      ]
    : [],
  session: { strategy: 'jwt' },
  trustHost: true,
});
