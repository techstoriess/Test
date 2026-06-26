/* AI Code Optimizer — Frontend Logic */

const API_ENDPOINT = 'api/optimize.php';
const MAX_CHARS    = 32000;

// ── DOM refs ───────────────────────────────────────────────
const form         = document.getElementById('optimizer-form');
const promptTA     = document.getElementById('prompt');
const charCounter  = document.getElementById('char-counter');
const submitBtn    = document.getElementById('submit-btn');
const resultsArea  = document.getElementById('results-area');
const configBtn    = document.getElementById('config-btn');
const modal        = document.getElementById('config-modal');
const closeModal   = document.getElementById('close-modal');
const saveConfig   = document.getElementById('save-config');

// ── API key storage (sessionStorage, never persisted to server) ──
const KEY_STORE = {
  get: k  => sessionStorage.getItem(`aikey_${k}`) ?? '',
  set: (k, v) => v ? sessionStorage.setItem(`aikey_${k}`, v)
                   : sessionStorage.removeItem(`aikey_${k}`),
};

// ── Character counter ──────────────────────────────────────
promptTA.addEventListener('input', () => {
  const len = promptTA.value.length;
  charCounter.textContent = `${len.toLocaleString()} / ${MAX_CHARS.toLocaleString()} chars`;
  charCounter.classList.toggle('warn', len > MAX_CHARS * 0.9);
});

// ── Config modal ───────────────────────────────────────────
configBtn.addEventListener('click', () => {
  document.getElementById('key-claude').value  = KEY_STORE.get('claude');
  document.getElementById('key-openai').value  = KEY_STORE.get('openai');
  document.getElementById('key-gemini').value  = KEY_STORE.get('gemini');
  modal.classList.add('open');
});

closeModal.addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

saveConfig.addEventListener('click', () => {
  KEY_STORE.set('claude', document.getElementById('key-claude').value.trim());
  KEY_STORE.set('openai', document.getElementById('key-openai').value.trim());
  KEY_STORE.set('gemini', document.getElementById('key-gemini').value.trim());
  modal.classList.remove('open');
  showToast('API keys saved for this session.');
});

// ── Form submit ────────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();

  const prompt = promptTA.value.trim();
  if (!prompt) { showToast('Please enter code or a prompt.', true); return; }
  if (prompt.length > MAX_CHARS) { showToast(`Prompt too long (max ${MAX_CHARS} chars).`, true); return; }

  const checkedModels = [...document.querySelectorAll('.model-check:checked')].map(el => el.value);
  if (!checkedModels.length) { showToast('Select at least one AI model.', true); return; }

  const task     = document.querySelector('input[name="task"]:checked')?.value ?? 'optimize';
  const language = document.getElementById('language').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Analyzing…';
  showSpinner();

  try {
    const body = { prompt, task, models: checkedModels, language };

    // Attach session-stored keys so PHP can override env vars if present
    const keys = { claude: KEY_STORE.get('claude'), openai: KEY_STORE.get('openai'), gemini: KEY_STORE.get('gemini') };
    const hasKey = Object.values(keys).some(Boolean);
    if (hasKey) body.keys = keys;

    const res  = await fetch(API_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      showError(json.error ?? `HTTP ${res.status}`);
      return;
    }

    renderResults(json.results, task);

  } catch (err) {
    showError('Network error: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Optimize';
  }
});

// ── Rendering ──────────────────────────────────────────────
const MODEL_META = {
  claude: { label: 'Claude',   icon: '⚡', colorClass: 'claude'  },
  openai: { label: 'ChatGPT',  icon: '🤖', colorClass: 'openai'  },
  gemini: { label: 'Gemini',   icon: '✨', colorClass: 'gemini'  },
};

function renderResults(results, task) {
  const models = Object.keys(results);

  // Stats bar
  const totalMs = Object.values(results).reduce((s, r) => s + (r.time_ms ?? 0), 0);
  const statsHtml = `
    <div class="stats-bar">
      <span><strong>${models.length}</strong> model${models.length > 1 ? 's' : ''}</span>
      <span>Task: <strong>${capitalize(task)}</strong></span>
      <span>Total time: <strong>${(totalMs / 1000).toFixed(1)}s</strong></span>
    </div>`;

  // Build tabs + content
  const tabsHtml = models.map((m, i) => {
    const meta = MODEL_META[m] ?? { label: m, icon: '?', colorClass: '' };
    const isErr = !!results[m].error;
    return `<button class="tab-btn ${meta.colorClass}${i === 0 ? ' active' : ''}" data-tab="${m}">
      ${meta.icon} ${meta.label}${isErr ? ' ⚠' : ''}
    </button>`;
  }).join('');

  const contentHtml = models.map((m, i) => {
    const meta   = MODEL_META[m] ?? { label: m, icon: '?', colorClass: '' };
    const result = results[m];
    const timeMs = result.time_ms ?? 0;

    if (result.error) {
      return `<div class="tab-content${i === 0 ? ' active' : ''}" data-tab="${m}">
        <div class="error-card">Error from ${meta.label}: ${escapeHtml(result.error)}</div>
      </div>`;
    }

    const text = result.result ?? '';
    return `<div class="tab-content${i === 0 ? ' active' : ''}" data-tab="${m}">
      <div class="result-card ${meta.colorClass}">
        <div class="result-header">
          <div class="result-model-badge">
            <span class="badge-dot"></span>
            ${meta.icon} ${meta.label}
          </div>
          <div class="result-meta">
            <span>${(timeMs / 1000).toFixed(2)}s</span>
            <button class="copy-btn" data-copy="${escapeAttr(text)}">Copy</button>
          </div>
        </div>
        <div class="result-body">${formatOutput(text)}</div>
      </div>
    </div>`;
  }).join('');

  resultsArea.innerHTML = statsHtml +
    `<div class="results-tabs">${tabsHtml}</div>` +
    contentHtml;

  // Tab switching
  resultsArea.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tab;
      resultsArea.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      resultsArea.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      resultsArea.querySelector(`.tab-content[data-tab="${t}"]`).classList.add('active');
    });
  });

  // Copy buttons
  resultsArea.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
  });

  resultsArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Helpers ────────────────────────────────────────────────
function showSpinner() {
  resultsArea.innerHTML = `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <p>Calling AI models… this may take a moment.</p>
    </div>`;
}

function showError(msg) {
  resultsArea.innerHTML = `<div class="error-card">${escapeHtml(msg)}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function formatOutput(text) {
  // Render fenced code blocks with a subtle wrapper
  let out = escapeHtml(text);
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<div style="background:rgba(0,0,0,.35);border:1px solid #2e3250;border-radius:6px;padding:.8rem 1rem;margin:.6rem 0;overflow-x:auto;"><code>${code}</code></div>`
  );
  // Bold
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: '999',
    background: isError ? '#7f1d1d' : '#1e3a5f',
    color: isError ? '#fca5a5' : '#bfdbfe',
    border: `1px solid ${isError ? '#dc2626' : '#3b82f6'}`,
    padding: '.7rem 1.2rem', borderRadius: '8px', fontSize: '.85rem',
    boxShadow: '0 4px 20px rgba(0,0,0,.5)', maxWidth: '340px',
    animation: 'fadeIn .2s ease',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
