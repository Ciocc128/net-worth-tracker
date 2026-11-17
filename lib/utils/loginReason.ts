/**
 * The `?reason=` of /login that carries a sign-out the app did on its own (S2 RU7).
 *
 * Its own module, not `authNarrative.ts`: `ActiveAccountProvider` sits in the root layout, and
 * importing the narrative module there would ship every sentence of the auth pages to every route.
 */
export const LOGIN_REASON_NOT_ALLOWED = 'not-allowed';
