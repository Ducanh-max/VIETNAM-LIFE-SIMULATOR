const KEY = 'vietnam-life.player-name';

export function loadPlayerName() {
  try { return window.localStorage.getItem(KEY)?.trim() || ''; } catch { return ''; }
}

export function savePlayerName(name: string) {
  try { window.localStorage.setItem(KEY, name.trim()); } catch { /* private mode: keep name for this visit only */ }
}
