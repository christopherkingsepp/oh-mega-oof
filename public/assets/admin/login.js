// Halduspaneeli sisselogimisvorm: saadab parooli fetch'iga /api/admin/login'i (JSON).
// Õnnestumisel laeb sama lehe uuesti — server näitab siis rakenduse kesta.
const form = document.getElementById('login-form');
const input = document.getElementById('password');
const errorEl = document.getElementById('login-error');
const toggle = document.querySelector('[data-toggle-password]');

toggle?.addEventListener('click', () => {
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Peida' : 'Näita';
  toggle.setAttribute('aria-pressed', String(show));
  input.focus();
});

function showError(msg) {
  errorEl.textContent = msg;
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const password = input.value;
  if (!password) {
    showError('Sisesta parool.');
    input.focus();
    return;
  }
  showError('');
  button.disabled = true;
  button.textContent = 'Kontrollin…';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* mitte-JSON */
    }
    if (res.ok && data?.ok) {
      button.textContent = 'Sisse logitud ✓';
      // Sama aadress uuesti: /admin või /admin/tellimused jne.
      location.replace(location.pathname + location.search);
      return;
    }
    showError(data?.error || (res.status === 429 ? 'Liiga palju katseid. Oota natuke ja proovi uuesti.' : 'Sisselogimine ebaõnnestus. Proovi uuesti.'));
    input.select();
  } catch {
    showError('Ühendus serveriga katkes. Kontrolli internetiühendust ja proovi uuesti.');
  }
  button.disabled = false;
  button.textContent = 'Logi sisse';
});
