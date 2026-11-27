/*
 * Private test build flags. Both come from the local build environment only (never from the repository):
 * VITE_PRIVATE_BUILD=true turns on the invite-only gate; VITE_PRIVATE_CAR_URL points at the full-detail test car
 * (a gitignored file under public/private-assets/ with a random name, uploaded only to the private deployment).
 */
const env = import.meta.env as Record<string, string | undefined>;
export const PRIVATE_BUILD = env.VITE_PRIVATE_BUILD === 'true';
export const PRIVATE_CAR_URL = PRIVATE_BUILD && env.VITE_PRIVATE_CAR_URL ? `${import.meta.env.BASE_URL}${env.VITE_PRIVATE_CAR_URL}` : '';
if (PRIVATE_BUILD && typeof document !== 'undefined') {
  const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow, noarchive'; document.head.appendChild(m);
}
