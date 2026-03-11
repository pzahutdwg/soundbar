/* ===== SOUNDBOARD JS ===== */

// --- Theme Toggle ---
const btnDark  = document.getElementById('theme-dark');
const btnLight = document.getElementById('theme-light');


function setTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light');
    btnLight.classList.add('active');
    btnDark.classList.remove('active');
  } else {
    document.body.classList.remove('light');
    btnDark.classList.add('active');
    btnLight.classList.remove('active');
  }
  localStorage.setItem('sb-theme', theme);
}

btnDark.addEventListener('click',  () => setTheme('dark'));
btnLight.addEventListener('click', () => setTheme('light'));
setTheme(localStorage.getItem('sb-theme') || 'dark');


// --- Label Formatter ---
function formatLabel(filename) {
  return filename
    .replace(/\.(wav|mp3)$/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}


// --- Ticket Balance ---
const ticketBalanceEl = document.getElementById('ticket-balance');
let currentTickets = 0;

async function refreshTickets() {
  if (window.IS_OWNER) return;
  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) return;
    const data = await res.json();
    currentTickets = data.tickets ?? 0;
    if (ticketBalanceEl) ticketBalanceEl.textContent = currentTickets;
    return currentTickets;
  } catch {
    return currentTickets;
  }
}


// --- Payment Modal ---
const payModal         = document.getElementById('pay-modal');
const payPin           = document.getElementById('pay-pin');
const payError         = document.getElementById('pay-error');
const payModalSound    = document.getElementById('pay-modal-sound');
const payConfirm       = document.getElementById('pay-confirm');
const payCancel        = document.getElementById('pay-cancel');
const optTickets       = document.getElementById('opt-tickets');
const optDigi          = document.getElementById('opt-digi');
const pinSection       = document.getElementById('pin-section');
const modalTicketCount = document.getElementById('modal-ticket-count');
const savePinCheck     = document.getElementById('save-pin');

const noTicketsNotice  = document.getElementById('no-tickets-notice');

let pendingMeme = null;
let pendingBtn = null;
let payMode    = 'tickets'; // 'tickets' | 'digi'

function setPayMode(mode) {
  payMode = mode;
  optTickets.classList.toggle('active', mode === 'tickets');
  optDigi.classList.toggle('active',    mode === 'digi');
  pinSection.style.display = mode === 'digi' ? 'block' : 'none';
  if (mode === 'digi' && payPin) payPin.focus();
}

optTickets?.addEventListener('click', () => { if (!optTickets.disabled) setPayMode('tickets'); });
optDigi?.addEventListener('click',    () => setPayMode('digi'));

async function openPayModal(file, btn) {
  pendingMeme = file;
  pendingBtn = btn;
  payModalSound.textContent = formatLabel(file);
  payError.style.display    = 'none';

  // Pre-fill saved PIN
  if (payPin) payPin.value = localStorage.getItem('sb-pin') || '';
  if (savePinCheck) savePinCheck.checked = !!localStorage.getItem('sb-pin');

  // Fetch latest balance and update modal
  const balance = await refreshTickets();
  if (modalTicketCount) modalTicketCount.textContent = `${balance} tickets`;
  const hasTickets = balance >= 5;
  if (optTickets) optTickets.disabled = !hasTickets;
  if (noTicketsNotice) noTicketsNotice.style.display = hasTickets ? 'none' : 'block';

  // Auto-select best mode
  setPayMode(hasTickets ? 'tickets' : 'digi');

  payModal.style.display = 'flex';
}

function closePayModal() {
  payModal.style.display = 'none';
  if (pendingBtn) { pendingBtn.classList.remove('playing'); pendingBtn = null; }
  pendingMeme = null;
}

payCancel?.addEventListener('click', closePayModal);
payModal?.addEventListener('click',  (e) => { if (e.target === payModal) closePayModal(); });
payPin?.addEventListener('keydown',  (e) => { if (e.key === 'Enter') payConfirm.click(); });

savePinCheck?.addEventListener('change', () => {
  if (savePinCheck.checked && payPin?.value)
    localStorage.setItem('sb-pin', payPin.value);
  else
    localStorage.removeItem('sb-pin');
});

payConfirm?.addEventListener('click', async () => {
  payError.style.display = 'none';

  let body;
  if (payMode === 'tickets') {
    body = { meme: pendingMeme, useTickets: true };
  } else {
    const pin = payPin.value.trim();
    if (!pin) {
      payError.textContent   = 'Please enter your PIN.';
      payError.style.display = 'block';
      return;
    }
    if (savePinCheck?.checked) localStorage.setItem('sb-pin', pin);
    else                       localStorage.removeItem('sb-pin');
    body = { meme: pendingMeme, pin };
  }

  payConfirm.disabled    = true;
  payConfirm.textContent = 'Processing...';

  try {
    // Update body to use 'meme' parameter instead of 'sfx'
    if (body.sfx) {
      body.meme = body.sfx;
      delete body.sfx;
    }
    const res  = await fetch('/api/playSound', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 200) {
      payModal.style.display = 'none';
      if (pendingBtn) {
        pendingBtn.classList.add('playing');
        const played = pendingBtn;
        setTimeout(() => played.classList.remove('playing'), 2000);
      }
      // Update ticket balance from response
      if (data.tickets != null) {
        currentTickets = data.tickets;
        if (ticketBalanceEl) ticketBalanceEl.textContent = currentTickets;
      }
      pendingMeme = null;
      pendingBtn = null;
    } else if (res.status === 429) {
      payError.textContent   = 'Another sound is already playing. Try again later.';
      payError.style.display = 'block';
      if (pendingBtn) pendingBtn.classList.remove('playing');
    } else {
      payError.textContent   = data.error || 'Payment failed. Please try again.';
      payError.style.display = 'block';
      if (pendingBtn) pendingBtn.classList.remove('playing');
    }
  } catch {
    payError.textContent   = 'Network error. Please try again.';
    payError.style.display = 'block';
    if (pendingBtn) pendingBtn.classList.remove('playing');
  } finally {
    payConfirm.disabled    = false;
    payConfirm.textContent = 'Play';
  }
});


// --- Owner Play (no payment) ---
async function ownerPlay(file, btn) {
  const wasPlaying = btn.classList.contains('playing');
  document.querySelectorAll('.sound-btn.playing').forEach(b => b.classList.remove('playing'));
  if (wasPlaying) return;

  btn.classList.add('playing');
  setTimeout(() => btn.classList.remove('playing'), 2000);

  try {
    const res = await fetch('/api/playSound', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ meme: file })
    });
    if (res.status === 429) {
      btn.classList.remove('playing');
      alert('Another sound is already playing. Try again later.');
    } else if (!res.ok) {
      btn.classList.remove('playing');
      btn.style.borderColor = 'red';
      setTimeout(() => (btn.style.borderColor = ''), 800);
    }
  } catch (err) {
    console.error('[Play] Network error:', err);
    btn.classList.remove('playing');
    btn.style.borderColor = 'red';
    setTimeout(() => (btn.style.borderColor = ''), 800);
  }
}


// --- Attach Button Logic ---
function attachAudioLogic(btn) {
  const file = btn.dataset.sound;
  if (!file) return;

  let cooldown = false;

  btn.addEventListener('click', () => {
    if (cooldown) return;
    cooldown = true;
    setTimeout(() => { cooldown = false; }, 2000);
    if (window.IS_OWNER) ownerPlay(file, btn);
    else                 openPayModal(file, btn);
  });
}


// --- Fetch Sounds ---
function fetchSounds() {
  return fetch('/api/getSounds')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      console.log('[Client] Received sounds data:', data);
      return data.memeSFX || [];
    })
    .catch(err => { console.error('[Sounds] Failed:', err); return []; });
}


// --- Build Sound Grid ---
function buildSoundGrid(sfxList) {
  const grid = document.querySelector('.sound-grid');
  if (!grid) return;

  console.log('[Grid] Building with sounds:', sfxList);

  sfxList
    .filter(filename => filename !== 'disabled')
    .forEach(filename => {
      const btn = document.createElement('button');
      btn.className = 'sound-btn';
      btn.dataset.sound = filename;

      const labelEl = document.createElement('span');
      labelEl.className = 'label';
      labelEl.textContent = formatLabel(filename);

      const barEl = document.createElement('span');
      barEl.className = 'play-bar';

      btn.appendChild(labelEl);
      btn.appendChild(barEl);
      grid.appendChild(btn);

      attachAudioLogic(btn);
    });
}


// --- Search Filter ---
document.getElementById('search').addEventListener('input', function () {
  const q = this.value.trim().toLowerCase();
  document.querySelectorAll('.sound-btn').forEach(btn => {
    const label = btn.querySelector('.label')?.textContent.toLowerCase() || '';
    btn.classList.toggle('hidden', q !== '' && !label.includes(q));
  });
});


// --- Init ---
if (!window.IS_OWNER) refreshTickets();
fetchSounds().then(buildSoundGrid);


