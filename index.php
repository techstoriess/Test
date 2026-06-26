<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Code Optimizer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

<!-- ── Header ─────────────────────────────────────── -->
<header>
  <div class="logo">
    <div class="logo-icon">&#9889;</div>
    <span class="logo-text">AI Code Optimizer</span>
  </div>
  <span class="logo-sub">Claude &bull; ChatGPT &bull; Gemini</span>
  <button class="config-btn" id="config-btn">&#9881; API Keys</button>
</header>

<!-- ── Main ───────────────────────────────────────── -->
<main class="container">
  <div class="main-grid">

    <!-- Left: Input Panel -->
    <aside>
      <form id="optimizer-form">

        <!-- Code / Prompt Input -->
        <div class="panel">
          <p class="panel-title">&#128196; Your Code or Prompt</p>

          <div class="field">
            <label for="language">Language / Framework</label>
            <select id="language" name="language">
              <option value="auto">Auto-detect</option>
              <optgroup label="Backend">
                <option value="PHP">PHP</option>
                <option value="Python">Python</option>
                <option value="JavaScript (Node.js)">JavaScript (Node.js)</option>
                <option value="Ruby">Ruby</option>
                <option value="Go">Go</option>
                <option value="Java">Java</option>
                <option value="C#">C#</option>
                <option value="Rust">Rust</option>
                <option value="C++">C++</option>
              </optgroup>
              <optgroup label="Frontend">
                <option value="JavaScript">JavaScript</option>
                <option value="TypeScript">TypeScript</option>
                <option value="React / JSX">React / JSX</option>
                <option value="Vue.js">Vue.js</option>
                <option value="HTML/CSS">HTML/CSS</option>
              </optgroup>
              <optgroup label="Database">
                <option value="SQL">SQL</option>
              </optgroup>
              <optgroup label="Other">
                <option value="Shell / Bash">Shell / Bash</option>
                <option value="YAML">YAML</option>
                <option value="JSON">JSON</option>
              </optgroup>
            </select>
          </div>

          <div class="field">
            <label for="prompt">Paste your code or describe what you need</label>
            <textarea id="prompt" name="prompt" placeholder="// Paste your code here, or describe what you want to build / fix...&#10;&#10;function example() {&#10;    // ...&#10;}" spellcheck="false"></textarea>
            <div class="char-counter" id="char-counter">0 / 32,000 chars</div>
          </div>
        </div>

        <!-- Task Selection -->
        <div class="panel" style="margin-top:1rem;">
          <p class="panel-title">&#127919; Optimization Task</p>
          <div class="task-grid">
            <div class="task-pill">
              <input type="radio" name="task" id="task-optimize" value="optimize" checked>
              <label for="task-optimize">&#9889; Optimize</label>
            </div>
            <div class="task-pill">
              <input type="radio" name="task" id="task-review" value="review">
              <label for="task-review">&#128269; Review</label>
            </div>
            <div class="task-pill">
              <input type="radio" name="task" id="task-fix" value="fix">
              <label for="task-fix">&#128295; Fix Bugs</label>
            </div>
            <div class="task-pill">
              <input type="radio" name="task" id="task-refactor" value="refactor">
              <label for="task-refactor">&#9881; Refactor</label>
            </div>
            <div class="task-pill">
              <input type="radio" name="task" id="task-document" value="document">
              <label for="task-document">&#128221; Document</label>
            </div>
          </div>
        </div>

        <!-- Model Selection -->
        <div class="panel" style="margin-top:1rem;">
          <p class="panel-title">&#129504; AI Models</p>
          <div class="model-grid">
            <div class="model-card claude">
              <input type="checkbox" class="model-check" id="model-claude" name="models[]" value="claude" checked>
              <label for="model-claude">
                <span class="model-icon">&#9889;</span>
                Claude
              </label>
            </div>
            <div class="model-card openai">
              <input type="checkbox" class="model-check" id="model-openai" name="models[]" value="openai">
              <label for="model-openai">
                <span class="model-icon">&#129302;</span>
                ChatGPT
              </label>
            </div>
            <div class="model-card gemini">
              <input type="checkbox" class="model-check" id="model-gemini" name="models[]" value="gemini">
              <label for="model-gemini">
                <span class="model-icon">&#10024;</span>
                Gemini
              </label>
            </div>
          </div>
          <p style="font-size:0.73rem;color:var(--text-muted);margin-top:.8rem;">
            Keys are loaded from environment variables. Click <strong>API Keys</strong> in the header to set them for this session.
          </p>
        </div>

        <button type="submit" class="btn-submit" id="submit-btn">
          &#9889; Optimize
        </button>

      </form>
    </aside>

    <!-- Right: Results Panel -->
    <section class="panel">
      <p class="panel-title">&#128200; Results</p>
      <div id="results-area">
        <div class="placeholder-msg">
          <div class="big-icon">&#9889;</div>
          <p>Submit your code to see AI-powered suggestions.</p>
          <p style="font-size:.8rem;">Supports Claude, ChatGPT &amp; Gemini side-by-side.</p>
        </div>
      </div>
    </section>

  </div>
</main>

<!-- ── API Keys Modal ─────────────────────────────── -->
<div class="modal-overlay" id="config-modal" role="dialog" aria-modal="true" aria-label="Configure API Keys">
  <div class="modal">
    <div class="modal-header">
      <h2>&#9881; API Keys</h2>
      <button class="btn-close" id="close-modal" aria-label="Close">&times;</button>
    </div>
    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:1.2rem;">
      Keys are stored in <strong>session memory only</strong> — never sent to any server except the respective AI API.
      Alternatively, set environment variables <code>CLAUDE_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code> on the server.
    </p>

    <div class="field">
      <label for="key-claude">&#9889; Claude (Anthropic) API Key</label>
      <input type="text" id="key-claude" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
    </div>
    <div class="field">
      <label for="key-openai">&#129302; OpenAI (ChatGPT) API Key</label>
      <input type="text" id="key-openai" placeholder="sk-…" autocomplete="off" spellcheck="false">
    </div>
    <div class="field">
      <label for="key-gemini">&#10024; Google Gemini API Key</label>
      <input type="text" id="key-gemini" placeholder="AIza…" autocomplete="off" spellcheck="false">
    </div>

    <button class="btn-save" id="save-config">Save for this session</button>
  </div>
</div>

<script src="js/main.js"></script>
</body>
</html>
