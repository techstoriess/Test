/**
 * dashboard.js — orchestrates the grid of ChartPane instances.
 *
 * Responsibilities:
 *   - Load provider config from /api/providers
 *   - Read/write chartCount from localStorage
 *   - Build & rebuild the CSS grid when count changes
 *   - Maintain one Socket.IO connection shared by all panes
 *   - Persist per-pane state in localStorage["paneStates"]
 */

(async () => {
  // ---------------------------------------------------------------------------
  // 1. Load provider config
  // ---------------------------------------------------------------------------
  let providers;
  try {
    const r = await fetch("/api/providers");
    providers = await r.json();
  } catch (e) {
    console.error("Failed to load providers", e);
    providers = {};
  }

  // ---------------------------------------------------------------------------
  // 2. Shared Socket.IO connection
  // ---------------------------------------------------------------------------
  const socket = io({ transports: ["websocket", "polling"] });
  socket.on("connect", () => console.log("[socket] connected", socket.id));
  socket.on("disconnect", () => console.log("[socket] disconnected"));

  // ---------------------------------------------------------------------------
  // 3. State
  // ---------------------------------------------------------------------------
  const COUNT_OPTIONS = [1, 2, 4, 6, 8];
  const GRID_CLASSES = { 1: "grid-1", 2: "grid-2", 4: "grid-4", 6: "grid-6", 8: "grid-8" };

  let chartCount = parseInt(localStorage.getItem("chartCount") || "4", 10);
  if (!COUNT_OPTIONS.includes(chartCount)) chartCount = 4;

  let panes = [];   // active ChartPane instances

  // ---------------------------------------------------------------------------
  // 4. DOM refs
  // ---------------------------------------------------------------------------
  const gridContainer  = document.getElementById("grid-container");
  const countSelect    = document.getElementById("chartCountSelect");
  countSelect.value    = String(chartCount);

  // ---------------------------------------------------------------------------
  // 5. Grid builder
  // ---------------------------------------------------------------------------
  function buildGrid(count) {
    // Save current pane states before destroying
    const savedStates = JSON.parse(localStorage.getItem("paneStates") || "[]");

    // Destroy existing panes
    panes.forEach(p => p.destroyChart());
    panes = [];
    gridContainer.innerHTML = "";

    // Apply grid class
    Object.values(GRID_CLASSES).forEach(c => gridContainer.classList.remove(c));
    gridContainer.classList.add(GRID_CLASSES[count] || "grid-4");

    // Create pane elements & ChartPane instances
    for (let i = 0; i < count; i++) {
      const paneEl = el("div", "chart-pane");
      gridContainer.appendChild(paneEl);
      const saved = savedStates[i] || null;
      const pane = new ChartPane(paneEl, i, providers, socket, saved);
      panes.push(pane);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Chart count selector
  // ---------------------------------------------------------------------------
  countSelect.addEventListener("change", () => {
    chartCount = parseInt(countSelect.value, 10);
    localStorage.setItem("chartCount", String(chartCount));
    buildGrid(chartCount);
  });

  // ---------------------------------------------------------------------------
  // 7. Initial render
  // ---------------------------------------------------------------------------
  buildGrid(chartCount);
})();
