/**
 * Where public/ files (assets/maps, assets/voice, ...) are served from, relative to the current page.
 * The game page lives one folder down (game/index.html, with `<meta name="site-root" content="../">`) while the
 * Trojan Horse homepage is the site root, so relative asset URLs must climb back up. Pages at the root (the
 * narration preview) have no meta and use Vite's base.
 */
export const SITE_ROOT =
  document.querySelector<HTMLMetaElement>('meta[name="site-root"]')?.content ?? import.meta.env.BASE_URL;
