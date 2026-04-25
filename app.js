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
  A: { x: 310, y:  20, w: 150, h: 110 },
  B: { x: 310, y: 140, w: 150, h:  70 },
  C: { x: 310, y: 220, w: 150, h: 110 },
  X: { x: 310, y: 340, w: 150, h:  60 },
  D: { x: 310, y: 410, w: 150, h:  70 },
  E: { x: 100, y: 140, w: 130, h:  35 },
  MAIN: { x: 100, y: 180, w: 130, h: 35 },
  F: { x: 100, y: 220, w: 130, h: 130 }, // corner, opposite C with corridor gap
  G: { x:   0, y: 220, w: 100, h: 130 }, // east wall (x=100) meets F's west wall
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
  "MAIN-E": { box: "MAIN", side: "e", t: 0.50 },
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

function isHitHorizontal(side) {
  return side === "n" || side === "s";
}

function renderMap() {
  const svg = document.getElementById("map-svg");
  svg.innerHTML = "";

  // Dashed outline showing the L-shaped corridor between west boxes (F is the corner)
  const corridor = svgEl("path", {
    class: "corridor",
    d: "M 302 140 L 302 360 L 165 360 L 165 250",
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

    // Larger transparent tap-target underneath door rect (so keyholes stay on top)
    const padX = isHitHorizontal(place.side) ? 12 : 8;
    const padY = isHitHorizontal(place.side) ? 8 : 12;
    const hit = svgEl("rect", {
      class: "door-hit",
      "data-door-id": door.id,
      x: x - padX, y: y - padY,
      width: w + padX * 2, height: h + padY * 2,
      fill: "transparent",
      "pointer-events": "all",
    });
    hit.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onDoorClick(door.id);
    });
    svg.appendChild(hit);

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

// ---------- Map zoom & pan ----------
const VB_BASE = { x: 0, y: 0, w: 480, h: 600 };
const VB = { ...VB_BASE };
const MIN_SCALE = 1;
const MAX_SCALE = 6;

function applyViewBox() {
  const svg = document.getElementById("map-svg");
  if (svg) svg.setAttribute("viewBox", `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
}

function currentScale() {
  return VB_BASE.w / VB.w;
}

function clampViewBox() {
  // Clamp scale via width
  const minW = VB_BASE.w / MAX_SCALE;
  const maxW = VB_BASE.w / MIN_SCALE;
  if (VB.w < minW) {
    const ratio = minW / VB.w;
    VB.w *= ratio; VB.h *= ratio;
  }
  if (VB.w > maxW) {
    VB.w = VB_BASE.w; VB.h = VB_BASE.h;
  }
  // Clamp pan: don't allow viewBox to drift more than its own size away from base
  const maxX = VB_BASE.x + VB_BASE.w - VB.w * 0.1;
  const minX = VB_BASE.x - VB.w * 0.9;
  const maxY = VB_BASE.y + VB_BASE.h - VB.h * 0.1;
  const minY = VB_BASE.y - VB.h * 0.9;
  // When fully zoomed out, center exactly
  if (currentScale() <= 1.001) {
    VB.x = VB_BASE.x; VB.y = VB_BASE.y;
  } else {
    if (VB.x < minX) VB.x = minX;
    if (VB.x > maxX) VB.x = maxX;
    if (VB.y < minY) VB.y = minY;
    if (VB.y > maxY) VB.y = maxY;
  }
}

function clientToSvg(clientX, clientY) {
  const svg = document.getElementById("map-svg");
  const rect = svg.getBoundingClientRect();
  // SVG uses preserveAspectRatio xMidYMid meet — compute the rendered viewBox area
  const scale = Math.min(rect.width / VB.w, rect.height / VB.h);
  const renderedW = VB.w * scale;
  const renderedH = VB.h * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;
  const sx = (clientX - rect.left - offsetX) / scale + VB.x;
  const sy = (clientY - rect.top - offsetY) / scale + VB.y;
  return { x: sx, y: sy, scale };
}

function zoomAt(svgX, svgY, factor) {
  // Keep (svgX, svgY) at the same screen position after scaling
  const newW = VB.w / factor;
  const newH = VB.h / factor;
  // svgX = VB.x + tx * VB.w  =>  tx = (svgX - VB.x) / VB.w
  const tx = (svgX - VB.x) / VB.w;
  const ty = (svgY - VB.y) / VB.h;
  VB.x = svgX - tx * newW;
  VB.y = svgY - ty * newH;
  VB.w = newW;
  VB.h = newH;
  clampViewBox();
  applyViewBox();
}

function resetZoom() {
  VB.x = VB_BASE.x; VB.y = VB_BASE.y;
  VB.w = VB_BASE.w; VB.h = VB_BASE.h;
  applyViewBox();
}

function setupMapInteractions() {
  const viewport = document.getElementById("map-viewport");
  const svg = document.getElementById("map-svg");
  if (!viewport || !svg) return;

  const pointers = new Map(); // pointerId -> { x, y }
  let dragStartedAt = 0;
  let totalMove = 0;
  let lastPan = null;
  let pinchPrevDist = 0;
  let pinchPrevMid = null;
  let suppressClickUntil = 0;
  let lastTapTime = 0;
  let lastTapPos = null;

  function pointersArr() { return Array.from(pointers.values()); }

  viewport.addEventListener("pointerdown", (ev) => {
    viewport.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    dragStartedAt = performance.now();
    totalMove = 0;
    if (pointers.size === 1) {
      lastPan = { x: ev.clientX, y: ev.clientY };
      svg.classList.add("panning");
    } else if (pointers.size === 2) {
      const [p1, p2] = pointersArr();
      pinchPrevDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchPrevMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      lastPan = null;
    }
  });

  viewport.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    const prev = pointers.get(ev.pointerId);
    const dx = ev.clientX - prev.x;
    const dy = ev.clientY - prev.y;
    totalMove += Math.abs(dx) + Math.abs(dy);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 1 && lastPan) {
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / VB.w, rect.height / VB.h);
      VB.x -= dx / scale;
      VB.y -= dy / scale;
      clampViewBox();
      applyViewBox();
      lastPan = { x: ev.clientX, y: ev.clientY };
    } else if (pointers.size === 2) {
      const [p1, p2] = pointersArr();
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      if (pinchPrevDist > 0) {
        const factor = dist / pinchPrevDist;
        const sp = clientToSvg(mid.x, mid.y);
        zoomAt(sp.x, sp.y, factor);
        // also pan by midpoint movement
        if (pinchPrevMid) {
          const rect = svg.getBoundingClientRect();
          const scale = Math.min(rect.width / VB.w, rect.height / VB.h);
          VB.x -= (mid.x - pinchPrevMid.x) / scale;
          VB.y -= (mid.y - pinchPrevMid.y) / scale;
          clampViewBox();
          applyViewBox();
        }
      }
      pinchPrevDist = dist;
      pinchPrevMid = mid;
    }
  });

  function endPointer(ev) {
    if (!pointers.has(ev.pointerId)) return;
    const wasMulti = pointers.size > 1;
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) {
      pinchPrevDist = 0;
      pinchPrevMid = null;
    }
    if (pointers.size === 1) {
      const remaining = pointersArr()[0];
      lastPan = { x: remaining.x, y: remaining.y };
    } else if (pointers.size === 0) {
      svg.classList.remove("panning");
      lastPan = null;
    }

    const elapsed = performance.now() - dragStartedAt;
    // If the gesture was a drag/pinch, suppress the synthetic click that follows.
    if (wasMulti || totalMove > 6 || elapsed > 350) {
      suppressClickUntil = performance.now() + 400;
    } else if (pointers.size === 0) {
      // Detect double-tap
      const now = performance.now();
      const pos = { x: ev.clientX, y: ev.clientY };
      if (lastTapPos && now - lastTapTime < 320 &&
          Math.hypot(pos.x - lastTapPos.x, pos.y - lastTapPos.y) < 30) {
        // double-tap: zoom in or reset
        const sp = clientToSvg(pos.x, pos.y);
        if (currentScale() > 1.5) {
          resetZoom();
        } else {
          zoomAt(sp.x, sp.y, 2.5);
        }
        suppressClickUntil = performance.now() + 400;
        lastTapTime = 0;
        lastTapPos = null;
      } else {
        lastTapTime = now;
        lastTapPos = pos;
      }
    }
  }

  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("pointerleave", endPointer);

  // Suppress click events that follow a drag/pinch
  viewport.addEventListener("click", (ev) => {
    if (performance.now() < suppressClickUntil) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  }, true);

  // Wheel zoom (desktop)
  viewport.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.0015);
    const sp = clientToSvg(ev.clientX, ev.clientY);
    zoomAt(sp.x, sp.y, factor);
  }, { passive: false });

  // Zoom buttons
  viewport.querySelectorAll(".zoom-btn").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const action = btn.dataset.zoom;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const sp = clientToSvg(cx, cy);
      if (action === "in") zoomAt(sp.x, sp.y, 1.5);
      else if (action === "out") zoomAt(sp.x, sp.y, 1 / 1.5);
      else if (action === "reset") resetZoom();
    });
  });
}

// ---------- Init ----------
function init() {
  renderMap();
  renderDoors();
  renderKeys();
  setupMapInteractions();
  applyViewBox();

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
