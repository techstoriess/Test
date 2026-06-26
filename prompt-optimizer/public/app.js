const textarea = document.getElementById('idea-input');
const charCount = document.getElementById('char-count');
const optimizeBtn = document.getElementById('optimize-btn');
const resultsSection = document.getElementById('results-section');
const toast = document.getElementById('toast');

const MAX_CHARS = 1000;

textarea.addEventListener('input', () => {
  const len = textarea.value.length;
  if (len > MAX_CHARS) textarea.value = textarea.value.slice(0, MAX_CHARS);
  charCount.textContent = `${textarea.value.length} / ${MAX_CHARS}`;
});

textarea.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') optimizeBtn.click();
});

optimizeBtn.addEventListener('click', async () => {
  const idea = textarea.value.trim();
  if (!idea) {
    textarea.focus();
    return;
  }

  setLoadingState(true);
  resultsSection.classList.remove('hidden');
  resetCards();
  window.scrollTo({ top: resultsSection.offsetTop - 20, behavior: 'smooth' });

  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea }),
    });

    if (!response.ok) throw new Error('Server error');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) continue;
          handleEvent(data);
        } catch {}
      }
    }
  } catch (err) {
    ['claude', 'gemini', 'chatgpt'].forEach((p) => {
      setCardError(p, 'Connection failed. Is the server running?');
    });
  } finally {
    setLoadingState(false);
  }
});

function handleEvent(data) {
  const { provider, status, result, message } = data;
  const badge = document.getElementById(`status-${provider}`);

  if (status === 'loading') {
    badge.textContent = 'loading';
    badge.className = 'status-badge loading';
    showSkeleton(provider);
  } else if (status === 'success') {
    badge.textContent = 'done';
    badge.className = 'status-badge success';
    renderResult(provider, result);
  } else if (status === 'error') {
    badge.textContent = 'error';
    badge.className = 'status-badge error';
    setCardError(provider, message);
  }
}

function resetCards() {
  ['claude', 'gemini', 'chatgpt'].forEach((p) => {
    const badge = document.getElementById(`status-${p}`);
    badge.textContent = 'waiting';
    badge.className = 'status-badge';
    showSkeleton(p);
  });
}

function showSkeleton(provider) {
  const body = document.getElementById(`${provider}-result`);
  body.innerHTML = `
    <div class="skeleton-loader">
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line"></div>
    </div>`;
}

function renderResult(provider, markdown) {
  const body = document.getElementById(`${provider}-result`);
  body.innerHTML = marked.parse(markdown || '');
}

function setCardError(provider, msg) {
  const body = document.getElementById(`${provider}-result`);
  body.innerHTML = `<div class="error-msg">⚠ ${msg}</div>`;
}

function setLoadingState(loading) {
  optimizeBtn.disabled = loading;
  optimizeBtn.innerHTML = loading
    ? `<span class="spinner"></span><span class="btn-text">Optimizing…</span>`
    : `<span class="btn-text">Optimize Prompt</span><span class="btn-icon">→</span>`;
}

// Copy buttons
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const body = document.getElementById(targetId);
    const text = body.innerText;
    if (!text || body.querySelector('.skeleton-loader') || body.querySelector('.error-msg')) return;

    navigator.clipboard.writeText(text).then(() => {
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2000);
    });
  });
});
