// ============================================================
// Authentification client : identité invité (persistée localement)
// + connexion Google (Google Identity Services) optionnelle.
// ============================================================
const GID_KEY = 'raw_guestid';

export function guestId() {
  let id = null;
  try { id = localStorage.getItem(GID_KEY); } catch {}
  if (!id) { id = 'g' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); try { localStorage.setItem(GID_KEY, id); } catch {} }
  return id;
}

// Affiche le bouton "Se connecter avec Google" si un client_id est fourni.
// onToken(idToken) est appelé quand l'utilisateur se connecte.
export function mountGoogle(clientId, btnEl, onToken) {
  if (!clientId || !btnEl) return false;
  const start = () => {
    try {
      window.google.accounts.id.initialize({ client_id: clientId, callback: (resp) => { if (resp && resp.credential) onToken(resp.credential); } });
      window.google.accounts.id.renderButton(btnEl, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill' });
      btnEl.style.display = '';
    } catch (e) { console.warn('[auth] Google Sign-In indisponible', e); }
  };
  if (window.google && window.google.accounts && window.google.accounts.id) { start(); return true; }
  const sc = document.createElement('script');
  sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
  sc.onload = start; sc.onerror = () => console.warn('[auth] échec du chargement de Google Identity');
  document.head.appendChild(sc);
  return true;
}
