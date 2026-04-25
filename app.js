// app.js — rendering, view switching, search, map interactivity
"use strict";

// ---------- Indexes ----------
const doorsById = Object.fromEntries(DOORS.map(d => [d.id, d]));
const boxesById = Object.fromEntries(BOXES.map(b => [b.id, b]));

// keyholeId -> "a" | "b"
function holeSuffix(keyholeId) {
  return keyholeId.endsWith("-a") ? "a" : "b";
}
function doorIdFromKeyhole(keyholeId) {
  return keyholeId.slice(0, -2); // strip "-a" / "-b"
}

// Build keyNumber -> [keyholeId, ...]
function buildKeysIndex() {
  const idx = {};
  for (const [hole, num] of Object.entries(KEY_ASSIGNMENTS)) {
    if (num === null || num === undefined || num === "") continue;
    const k = String(num);
    if (!idx[k]) idx[k] = [];
    idx[k].push(hole);
  }
  return idx;
}

// Door status based on its keyholes (1 or 2)
function doorStatus(doorId) {
  const aKey = `${doorId}-a`;
  const bKey = `${doorId}-b`;
  const hasAHole = aKey in KEY_ASSIGNMENTS;
  const hasBHole = bKey in KEY_ASSIGNMENTS;
  const a = KEY_ASSIGNMENTS[aKey];
  const b = KEY_ASSIGNMENTS[bKey];
  const aSet = hasAHole && a !== null && a !== undefined && a !== "";
  const bSet = hasBHole && b !== null && b !== undefined && b !== "";

  if (hasAHole && hasBHole) {
    if (aSet && bSet) return "full";
    if (aSet || bSet) return "partial";
    return "empty";
  }
  // single-keyhole door
  return aSet ? "full" : "empty";
}

// ---------- Map (SVG) ----------
//
// Coordinate system: viewBox 0 0 400 600.
// East column (right): boxes A, B, C, D top-to-bottom.
// West column (left):  E, [gap], F, G top-to-bottom.
// F is the L-corner so it is taller.
//
// Door rects sit on the appropriate edge of each box.

const MAP_BOXES = {
  // x, y, w, h
  A: { x: 230, y:  20, w: 150, h: 110 },
  B: { x: 230, y: 140, w: 150, h:  70 },
  C: { x: 230, y: 220, w: 150, h: 110 },
  X: { x: 230, y: 340, w: 150, h:  60 },
  D: { x: 230, y: 410, w: 150, h:  70 },
  E: { x:  20, y: 140, w: 130, h:  35 },
  F: { x:  20, y: 220, w: 130, h: 130 }, // corner, opposite C with corridor gap
  G: { x: -80, y: 220, w: 100, h: 130 }, // east wall (x=85) meets F's west wall
};

// For each door: which box, which side (n/s/e/w), and a fractional position
// along that edge (0..1). For boxes with two doors on the same side,
// idx 1 = north (lower fraction), idx 2 = south (higher fraction).
const DOOR_PLACEMENT = {
  "A-W1": { box: "A", side: "w", t: 0.30 },
  "A-W2": { box: "A", side: "w", t: 0.70 },
  "B-W":  { box: "B", side: "w", t: 0.50 },
  "C-W1": { box: "C", side: "w", t: 0.30 },
  "C-W2": { box: "C", side: "w", t: 0.70 },
  "D-W":  { box: "D", side: "w", t: 0.50 },
  "X-W":  { box: "X", side: "w", t: 0.50 },
  "E-E":  { box: "E", side: "e", t: 0.50 },
  "E-S":  { box: "E", side: "s", t: 0.70 },
  "F-E1": { box: "F", side: "e", t: 0.25 },
  "F-E2": { box: "F", side: "e", t: 0.70 },
  "F-S":  { box: "F", side: "s", t: 0.30 },
  "G-S":  { box: "G", side: "s", t: 0.50 },
};

const DOOR_W = 44;  // door rectangle dimensions on map (length along the wall)
const DOOR_T = 8;   // thickness perpendicular to wall
const HOLE_R = 3.2; // keyhole circle radius
const HOLE_INSET = 7; // distance from door end to keyhole center

function svgEl(name, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderMap() {
  const svg = document.getElementById("map-svg");
  svg.innerHTML = "";

  // Dashed outline showing the L-shaped corridor between west boxes (F is the corner)
  const corridor = svgEl("path", {
    class: "corridor",
    d: "M 222 140 L 222 360 L 85 360 L 85 250",
  });
  svg.appendChild(corridor);

  // Boxes
  for (const [id, b] of Object.entries(MAP_BOXES)) {
    svg.appendChild(svgEl("rect", {
      class: "box-rect",
      x: b.x, y: b.y, width: b.w, height: b.h,
      rx: 6, ry: 6,
    }));
    svg.appendChild(svgEl("text", {
      class: "box-label",
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
    }, id));
  }

  // Doors
  for (const door of DOORS) {
    const place = DOOR_PLACEMENT[door.id];
    if (!place) continue;
    const b = MAP_BOXES[place.box];
    let x, y, w, h;
    if (place.side === "w") {
      x = b.x - DOOR_T / 2;
      y = b.y + b.h * place.t - DOOR_W / 2;
      w = DOOR_T; h = DOOR_W;
    } else if (place.side === "e") {
      x = b.x + b.w - DOOR_T / 2;
      y = b.y + b.h * place.t - DOOR_W / 2;
      w = DOOR_T; h = DOOR_W;
    } else if (place.side === "n") {
      x = b.x + b.w * place.t - DOOR_W / 2;
      y = b.y - DOOR_T / 2;
      w = DOOR_W; h = DOOR_T;
    } else { // s
      x = b.x + b.w * place.t - DOOR_W / 2;
      y = b.y + b.h - DOOR_T / 2;
      w = DOOR_W; h = DOOR_T;
    }

    const status = doorStatus(door.id);
    const rect = svgEl("rect", {
      class: `door-rect ${status}`,
      "data-door-id": door.id,
      x, y, width: w, height: h, rx: 2, ry: 2,
    });
    rect.appendChild(svgEl("title", {}, doorTitleText(door.id)));
    rect.addEventListener("click", () => onDoorClick(door.id));
    svg.appendChild(rect);

    // Keyhole markers — at each end of the door along its long axis.
    // For doors with only one keyhole (e.g. X-W), draw one centered.
    const hasA = (`${door.id}-a`) in KEY_ASSIGNMENTS;
    const hasB = (`${door.id}-b`) in KEY_ASSIGNMENTS;
    const isHorizontal = (place.side === "n" || place.side === "s");
    const cx0 = x + w / 2;
    const cy0 = y + h / 2;

    const holePositions = [];
    if (hasA && hasB) {
      // two keyholes near each end of the door
      if (isHorizontal) {
        holePositions.push({ id: `${door.id}-a`, cx: x + HOLE_INSET, cy: cy0 });
        holePositions.push({ id: `${door.id}-b`, cx: x + w - HOLE_INSET, cy: cy0 });
      } else {
        holePositions.push({ id: `${door.id}-a`, cx: cx0, cy: y + HOLE_INSET });
        holePositions.push({ id: `${door.id}-b`, cx: cx0, cy: y + h - HOLE_INSET });
      }
    } else if (hasA) {
      holePositions.push({ id: `${door.id}-a`, cx: cx0, cy: cy0 });
    }

    for (const hp of holePositions) {
      const val = KEY_ASSIGNMENTS[hp.id];
      const set = val !== null && val !== undefined && val !== "";
      const circle = svgEl("circle", {
        class: `keyhole-circle ${set ? "set" : "unset"}`,
        "data-keyhole-id": hp.id,
        cx: hp.cx, cy: hp.cy, r: HOLE_R,
      });
      circle.appendChild(svgEl("title", {}, keyholeTitleText(hp.id)));
      circle.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onDoorClick(door.id);
      });
      svg.appendChild(circle);
    }

    // Small label outside the door
    const labelOffset = 14;
    let lx = x + w / 2, ly = y + h / 2;
    if (place.side === "w") lx -= labelOffset;
    else if (place.side === "e") lx += labelOffset;
    else if (place.side === "n") ly -= labelOffset;
    else ly += labelOffset;
    svg.appendChild(svgEl("text", {
      class: "door-label",
      x: lx, y: ly,
    }, door.id));
  }
}

function doorTitleText(doorId) {
  const aKey = `${doorId}-a`, bKey = `${doorId}-b`;
  const parts = [doorId];
  if (aKey in KEY_ASSIGNMENTS) {
    const v = KEY_ASSIGNMENTS[aKey];
    parts.push(`a: ${v ?? "—"}`);
  }
  if (bKey in KEY_ASSIGNMENTS) {
    const v = KEY_ASSIGNMENTS[bKey];
    parts.push(`b: ${v ?? "—"}`);
  }
  return parts.join("  ·  ");
}

function keyholeTitleText(keyholeId) {
  const v = KEY_ASSIGNMENTS[keyholeId];
  if (v === null || v === undefined || v === "") {
    return `${keyholeId} — unassigned`;
  }
  return `${keyholeId} → key ${v}`;
}

function onDoorClick(doorId) {
  // Switch to By Door view and scroll to the card.
  setView("doors");
  const card = document.querySelector(`[data-door-card="${doorId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("highlight");
    setTimeout(() => card.classList.remove("highlight"), 1800);
  }
}

// ---------- By Door view ----------
function renderDoors() {
  const list = document.getElementById("doors-list");
  list.innerHTML = "";

  for (const door of DOORS) {
    const box = boxesById[door.box];
    const facingName = { N: "North", S: "South", E: "East", W: "West" }[door.facing];

    const card = document.createElement("article");
    card.className = `card box-${door.box}`;
    card.dataset.doorCard = door.id;
    card.dataset.search =
      `${door.id} ${door.box} box${door.box} ${facingName} ${KEY_ASSIGNMENTS[`${door.id}-a`] ?? ""} ${KEY_ASSIGNMENTS[`${door.id}-b`] ?? ""}`
      .toLowerCase().replace(/\s+/g, " ");

    const aVal = KEY_ASSIGNMENTS[`${door.id}-a`];
    const bKey = `${door.id}-b`;
    const hasB = bKey in KEY_ASSIGNMENTS;
    const bVal = KEY_ASSIGNMENTS[bKey];

    card.innerHTML = `
      <div class="card-header">
        <h2 class="card-title">${door.id}</h2>
        <span class="card-sub">${box.label} · faces ${facingName}</span>
      </div>
      <div class="keyhole-row">
        <span class="keyhole-label">Hole a</span>
        ${renderKeyNum(aVal)}
      </div>
      ${hasB ? `
      <div class="keyhole-row">
        <span class="keyhole-label">Hole b</span>
        ${renderKeyNum(bVal)}
      </div>` : ""}
    `;
    list.appendChild(card);
  }
}

function renderKeyNum(val) {
  if (val === null || val === undefined || val === "") {
    return `<span class="key-num empty">—</span>`;
  }
  return `<span class="key-num">${escapeHtml(String(val))}</span>`;
}

// ---------- By Key view ----------
function renderKeys() {
  const list = document.getElementById("keys-list");
  const unassignedWrap = document.getElementById("unassigned-wrap");
  list.innerHTML = "";
  unassignedWrap.innerHTML = "";

  const idx = buildKeysIndex();
  const keyNums = Object.keys(idx).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  if (keyNums.length === 0) {
    list.innerHTML = `<p class="empty-state">No keys assigned yet. Edit <code>data.js</code> to populate <code>KEY_ASSIGNMENTS</code>.</p>`;
  } else {
    for (const num of keyNums) {
      const holes = idx[num];
      const card = document.createElement("article");
      card.className = "key-card";
      card.dataset.keyCard = num;
      card.dataset.search = `key ${num} ${holes.join(" ")}`.toLowerCase();
      card.innerHTML = `
        <span class="key-num">${escapeHtml(num)}</span>
        <div class="opens">
          ${holes.map(h => `<span class="keyhole-tag">${h}</span>`).join("")}
        </div>
      `;
      list.appendChild(card);
    }
  }

  // Unassigned keyholes
  const unassigned = Object.entries(KEY_ASSIGNMENTS)
    .filter(([, v]) => v === null || v === undefined || v === "")
    .map(([h]) => h);

  if (unassigned.length > 0) {
    const det = document.createElement("details");
    det.className = "unassigned-section";
    det.innerHTML = `
      <summary>Unassigned keyholes (${unassigned.length})</summary>
      <div class="unassigned-list">
        ${unassigned.map(h => `<span class="keyhole-tag">${h}</span>`).join("")}
      </div>
    `;
    unassignedWrap.appendChild(det);
  }
}

// ---------- View switching ----------
function setView(name) {
  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === `view-${name}`);
  });
}

// ---------- Search ----------
function applySearch(q) {
  const query = q.trim().toLowerCase();

  // Door cards
  document.querySelectorAll("[data-door-card]").forEach(card => {
    const match = !query || card.dataset.search.includes(query);
    card.style.display = match ? "" : "none";
  });

  // Key cards
  document.querySelectorAll("[data-key-card]").forEach(card => {
    const match = !query || card.dataset.search.includes(query);
    card.style.display = match ? "" : "none";
  });

  // Map highlight: doors matching the query get highlighted
  document.querySelectorAll(".door-rect").forEach(r => {
    r.classList.remove("highlight");
  });
  if (query) {
    // Highlight any door whose id or assigned key numbers match
    for (const door of DOORS) {
      const a = String(KEY_ASSIGNMENTS[`${door.id}-a`] ?? "").toLowerCase();
      const b = String(KEY_ASSIGNMENTS[`${door.id}-b`] ?? "").toLowerCase();
      const hay = `${door.id} ${door.box} ${a} ${b}`.toLowerCase();
      if (hay.includes(query)) {
        const el = document.querySelector(`.door-rect[data-door-id="${door.id}"]`);
        if (el) el.classList.add("highlight");
      }
    }
  }
}

// ---------- Utils ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Init ----------
function init() {
  renderMap();
  renderDoors();
  renderKeys();

  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  const search = document.getElementById("search");
  search.addEventListener("input", e => applySearch(e.target.value));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
