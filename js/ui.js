/* Section: js/ui.js — JavaScript module */
const Visual = (() => {
  const S = {
    lastMove: null,
    prevMove: null,
    undoMove: null,
    souflaRemove: null,
    souflaForcePath: [],
    souflaMarks: [],
    souflaForcePathsAll: [],
    ignoredKills: [],
    forcedOpeningArrow: null,
    highlightCells: [],
crownQueue: [],
    showCoords: false,
  };

  const SouflaFX = {
    active: false,
    redPaths: [],
    undoArrow: null,
  };

  function clearSouflaFX(noDraw) {

    SouflaFX.active = false;
    SouflaFX.redPaths = [];
    SouflaFX.undoArrow = null;
    S.souflaForcePath = [];
    S.souflaRemove = null;
    S.souflaMarks = [];
    S.souflaForcePathsAll = [];
    S.showCoords = false;
    if (S._activeStyle && S._activeStyle.kind === "souflaPreview") S._activeStyle = null;
    if (!noDraw) draw();
  }

  function renderSouflaPreview(canvas, payload) {
    if (!canvas) return;
    payload = payload || {};

    const saved = {
      active: SouflaFX.active,
      redPaths: SouflaFX.redPaths.slice(),
      undoArrow: SouflaFX.undoArrow ? { ...SouflaFX.undoArrow } : null,
      forcePath: Array.isArray(S.souflaForcePath) ? S.souflaForcePath.slice() : [],
      forcePathsAll: Array.isArray(S.souflaForcePathsAll) ? S.souflaForcePathsAll.map((p) => p.slice()) : [],
      remove: S.souflaRemove,
      marks: Array.isArray(S.souflaMarks) ? S.souflaMarks.slice() : [],
      activeStyle: S._activeStyle || null,
      showCoords: !!S.showCoords,
      activeCanvas: S._activeCanvas || null,
    };

    try {
      S._activeStyle = {
  kind: "souflaPreview",
  arrow: { lineWidth: 6.6, head: 22 },
  arrowStrong: { lineWidth: 9.2, head: 28 },
  forceAllAlpha: 0.55,
  colors: {

souflaRed: "#dc2626",
souflaRedText: "#111827",

souflaGreen: "#166534",
souflaGreenStrong: "#14532d",
removeRing: "rgba(220, 38, 38, 0.95)",
  },
  coords: {
font: "bold 18px ui-monospace, monospace",
lineWidth: 4,
radiusMul: 0.28,
bgLight: "rgba(255,255,255,0.72)",
bgDark: "rgba(0,0,0,0.55)",
fillLight: "#111827",
fillDark: "#f8fafc",
strokeLight: "rgba(255,255,255,1)",
strokeDark: "rgba(0,0,0,0.95)",
  },
};
      S.showCoords = !!(Game && Game.settings && Game.settings.showCoords);

      SouflaFX.active = true;
      SouflaFX.redPaths = Array.isArray(payload.redPaths) ? payload.redPaths.slice() : [];
      SouflaFX.undoArrow = null;

      S.souflaRemove = null;
      S.souflaMarks = Array.isArray(payload.marks) ? payload.marks.slice() : [];
      S.souflaForcePathsAll = Array.isArray(payload.forcePathsAll) ? payload.forcePathsAll.map((p) => p.slice()) : [];
      S.souflaForcePath = Array.isArray(payload.highlightForcePath) ? payload.highlightForcePath.slice() : [];

      const __bs = Game.settings.boardStyle;
      Game.settings.boardStyle = "2d";
      draw(canvas);
      Game.settings.boardStyle = __bs;

      if (payload.removeRingIdx != null) {
        const prevCv = S._activeCanvas;
        try {
          S._activeCanvas = canvas;
          const ctx = canvas.getContext("2d");
          const [x, y, stepX, stepY] = cellCenter(payload.removeRingIdx);
          const rad = Math.max(6, Math.min(stepX, stepY) / 2 - 25);
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, rad + 6, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(6, rad * 0.18);
          ctx.strokeStyle =
            (S._activeStyle && S._activeStyle.colors && S._activeStyle.colors.removeRing) ||
            "rgba(220, 38, 38, 0.95)";
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.restore();
        } catch {
        } finally {
          S._activeCanvas = prevCv;
        }
      }
    } finally {
      SouflaFX.active = saved.active;
      SouflaFX.redPaths = saved.redPaths;
      SouflaFX.undoArrow = saved.undoArrow;

      S.souflaForcePath = saved.forcePath;
      S.souflaForcePathsAll = saved.forcePathsAll;
      S.souflaRemove = saved.remove;
      S.souflaMarks = saved.marks;

      S._activeStyle = saved.activeStyle;
      S.showCoords = saved.showCoords;
      S._activeCanvas = saved.activeCanvas;
    }
  }

  function setSouflaIgnoredPaths(list) {
    SouflaFX.active = true;
    SouflaFX.redPaths = list.slice();
    draw();
  }
  function setSouflaUndoArrow(from, to) {
  SouflaFX.active = true;

  try {
    if (Array.isArray(from)) {
      const nodes = from.map((n) => Number(n)).filter(Number.isFinite);
      SouflaFX.undoArrow = nodes.length >= 2 ? { nodes } : null;
    } else if (Array.isArray(to)) {
      const nodes = [from].concat(to).map((n) => Number(n)).filter(Number.isFinite);
      SouflaFX.undoArrow = nodes.length >= 2 ? { nodes } : null;
    } else if (from != null && to != null) {
      const a = Number(from), b = Number(to);
      SouflaFX.undoArrow = (Number.isFinite(a) && Number.isFinite(b)) ? { nodes: [a, b] } : null;
    } else {
      SouflaFX.undoArrow = null;
    }
  } catch {
    SouflaFX.undoArrow = null;
  }

  draw();
}

function applySouflaFXBatch(payload, opts) {
  payload = payload || {};
  opts = opts || {};
  const noDraw = !!opts.noDraw;

  const redSegments = payload.redSegments;
  const removeIdx = payload.removeIdx;
  const forcePath = payload.forcePath;
  const undoArrow = payload.undoArrow;

  const hasAny =
  (Array.isArray(redSegments) && redSegments.length) ||
  (removeIdx != null) ||
  (Array.isArray(forcePath) && forcePath.length) ||
  (undoArrow && (
    (Array.isArray(undoArrow.nodes) && undoArrow.nodes.length >= 2) ||
    (undoArrow.from != null && Array.isArray(undoArrow.path) && undoArrow.path.length) ||
    (undoArrow.from != null && undoArrow.to != null)
  ));

  SouflaFX.active = !!hasAny;
  SouflaFX.redPaths = Array.isArray(redSegments) ? redSegments.slice() : [];
  
SouflaFX.undoArrow = null;
try {
  if (undoArrow) {
    if (Array.isArray(undoArrow.nodes)) {
      const nodes = undoArrow.nodes.map((n) => Number(n)).filter(Number.isFinite);
      if (nodes.length >= 2) SouflaFX.undoArrow = { nodes };
    } else if (undoArrow.from != null && Array.isArray(undoArrow.path)) {
      const nodes = [undoArrow.from].concat(undoArrow.path).map((n) => Number(n)).filter(Number.isFinite);
      if (nodes.length >= 2) SouflaFX.undoArrow = { nodes };
    } else if (undoArrow.from != null && undoArrow.to != null) {
      const a = Number(undoArrow.from), b = Number(undoArrow.to);
      if (Number.isFinite(a) && Number.isFinite(b)) SouflaFX.undoArrow = { nodes: [a, b] };
    }
  }
} catch {}

  S.souflaRemove = (removeIdx != null) ? removeIdx : null;
  S.souflaForcePath = Array.isArray(forcePath) ? forcePath.slice() : [];

  if (!noDraw) draw();
}

  function moveColorForSide(side) {
    const s = (side != null) ? side : (Game.lastMoveSide != null ? Game.lastMoveSide : Game.player);
    return s === BOT ? "#22c55e" : "#3b82f6";
  }

function _setLastMoveInternal(fr, path, side) {
  if (fr == null || !Array.isArray(path) || path.length === 0) {
    S.lastMove = null;
    return;
  }
  const s = (side != null) ? side : (Game.lastMoveSide != null ? Game.lastMoveSide : Game.player);
  S.lastMove = { from: fr, path: path.slice(), color: moveColorForSide(s), side: s };
}

function setLastMove(fr, to, side) {
  if (fr == null || to == null) return _setLastMoveInternal(null, [], side);
  _setLastMoveInternal(fr, [to], side);
}

function setLastMovePath(fr, path, side) {
  _setLastMoveInternal(fr, path, side);
}

  function clearPrevMove() {
    S.prevMove = null;
  }

  function promoteLastMoveToPrev() {
    S.prevMove = S.lastMove ? { ...S.lastMove, path: S.lastMove.path.slice() } : null;
    S.lastMove = null;
  }

  function setUndoMove(fr, to) {
  if (fr == null || to == null) {
    S.undoMove = null;
    draw();
    return;
  }
  S.undoMove = { from: fr, path: [to] };
  draw();
  setTimeout(() => {
    S.undoMove = null;
    draw();
  }, 1200);
}

function setUndoMovePath(fr, path) {
  if (fr == null || !Array.isArray(path) || !path.length) {
    S.undoMove = null;
    draw();
    return;
  }
  S.undoMove = { from: fr, path: path.slice() };
  draw();
  setTimeout(() => {
    S.undoMove = null;
    draw();
  }, 1200);
}

  function setSouflaRemove(idx) {
    S.souflaRemove = idx;
    draw();
  }

  function setSouflaForcePath(path) {
    S.souflaForcePath = path.slice();
    draw();
  }

  function setIgnoredKills(list) {
    S.ignoredKills = list.slice();
    draw();
  }

  function setForcedOpeningArrow(fr, to) {
    S.forcedOpeningArrow = { from: fr, to: to };
    draw();
  }
  function clearForcedOpeningArrow() {
    S.forcedOpeningArrow = null;
    draw();
  }

  function setHighlightCells(cells) {
    S.highlightCells = cells || [];
  }
  function queueCrown(idx) {
    S.crownQueue.push(idx);
    setTimeout(() => {
      S.crownQueue.shift();
      draw();
    }, 1200);
  }

  function setSuspended(v) {

    S._suspendDraw = !!v;

    if (!S._suspendDraw && S._pendingDraw) {

      S._pendingDraw = false;

      draw();

    }

  }


  function draw(canvasOverride) {
    if (S._suspendDraw || (Game && ((Game._simDepth || 0) > 0 || Game._souflaApplying))) { S._pendingDraw = true; return; }
    const cv = canvasOverride || qs("#board");
    const prevCv = S._activeCanvas || null;
    S._activeCanvas = cv;
    try {
      const ctx = cv.getContext("2d");
    const W = cv.width,
      H = cv.height;
    ctx.clearRect(0, 0, W, H);

    
    
    const __is3d = !!(Game.settings && Game.settings.boardStyle === "3d");

    if (!__is3d) {
      drawGrid(ctx, W, H);
    }
    if (S.showCoords || Game.settings.showCoords) drawCoords(ctx, W, H);

    for (const [r, c] of S.highlightCells) {
      drawCellHighlight(ctx, r, c);
    }
    if (!__is3d) {
      drawPieces(ctx);
    }
    drawCapturedNumbers(ctx);

    if (S.prevMove) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      drawPath(
        ctx,
        S.prevMove.from,
        S.prevMove.path,
        S.prevMove.color || "#22c55e"
      );
      ctx.restore();
    }
    if (S.lastMove)
      drawPath(
        ctx,
        S.lastMove.from,
        S.lastMove.path,
        S.lastMove.color || "#22c55e"
      );

    
if (S.undoMove && S.undoMove.from != null && Array.isArray(S.undoMove.path) && S.undoMove.path.length) {
  try {
    const nodes = [S.undoMove.from].concat(S.undoMove.path).map((n) => Number(n)).filter(Number.isFinite);
    if (nodes.length >= 2) {
      for (let i = nodes.length - 1; i >= 1; i--) {
        drawArrow(ctx, nodes[i], nodes[i - 1], "#facc15");
      }
    }
  } catch {}
}
    if (S.forcedOpeningArrow)
      drawArrow(
        ctx,
        S.forcedOpeningArrow.from,
        S.forcedOpeningArrow.to,
        "#ef4444"
      );
if (S.souflaRemove != null) {
      drawX(ctx, S.souflaRemove, "#ef4444");
    }

    if (S.souflaMarks && S.souflaMarks.length) {
      for (const mi of S.souflaMarks) drawX(ctx, mi, "#ef4444");
    }

    if (SouflaFX.active) {
      const colR =
        (S._activeStyle && S._activeStyle.colors && S._activeStyle.colors.souflaRed) ||
        "#ef4444";
      const colJump =
        (S._activeStyle && S._activeStyle.colors && S._activeStyle.colors.souflaRedText) ||
        "#b91c1c";
      for (const seg of SouflaFX.redPaths) {
        let cur = seg.from;
        for (let i = 0; i < seg.path.length; i++) {
          drawArrow(ctx, cur, seg.path[i], colR);
          if (!(S._activeStyle && S._activeStyle.kind === "souflaPreview") && seg.jumps && seg.jumps[i] != null) {
            drawNumberOnIdx(ctx, seg.jumps[i], String(i + 1), colJump);
          }
          cur = seg.path[i];
        }
      }
    }
    if (S.souflaForcePathsAll && S.souflaForcePathsAll.length) {
      const colG =
        (S._activeStyle && S._activeStyle.colors && S._activeStyle.colors.souflaGreen) ||
        "#22c55e";
      ctx.save();
      ctx.globalAlpha = (S._activeStyle && typeof S._activeStyle.forceAllAlpha === "number") ? S._activeStyle.forceAllAlpha : 0.35;
      for (const pp of S.souflaForcePathsAll) {
        if (!pp || pp.length < 2) continue;
        for (let i = 0; i < pp.length - 1; i++) {
          drawArrow(ctx, pp[i], pp[i + 1], colG);
        }
      }
      ctx.restore();
    }

    if (S.souflaForcePath?.length) {
      const p = S.souflaForcePath;
      const colGS =
        (S._activeStyle && S._activeStyle.colors && S._activeStyle.colors.souflaGreenStrong) ||
        "#22c55e";
      const strong = (S._activeStyle && S._activeStyle.arrowStrong) ? S._activeStyle.arrowStrong : null;
      for (let i = 0; i < p.length - 1; i++) {
        drawArrow(ctx, p[i], p[i + 1], colGS, strong);
      }
    }

    
if (SouflaFX.active && SouflaFX.undoArrow && Array.isArray(SouflaFX.undoArrow.nodes)) {
  try {
    const nodes = SouflaFX.undoArrow.nodes.map((n) => Number(n)).filter(Number.isFinite);
    if (nodes.length >= 2) {
      for (let i = 0; i < nodes.length - 1; i++) {
        drawArrow(ctx, nodes[i], nodes[i + 1], "#facc15");
      }
    }
  } catch {}
}

    for (const idx of S.crownQueue) {
      drawCrownPulse(ctx, idx);
    }
    } finally {
      S._activeCanvas = prevCv;
    }

    try { if (Game.settings.boardStyle === '3d') Board3D.syncIfNeeded();     } catch {}
  }

  function cellCenter(idx) {
    const [r0, c0] = idxToRC(idx);
    const [r, c] = toViewRC(r0, c0);

    const cv = S._activeCanvas || qs("#board");
    const stepX = cv.width / BOARD_N;
    const stepY = cv.height / BOARD_N;
    const x = c * stepX + stepX / 2;
    const y = r * stepY + stepY / 2;
    return [x, y, stepX, stepY];
  }

  function drawGrid(ctx, W, H) {
    ctx.save();
    const stepX = W / BOARD_N;
    const stepY = H / BOARD_N;

    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--diag")
        .trim() || "#b8c7f0";
    ctx.lineWidth = 2;
    for (const line of DIAG_A_LINES) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const [r0, c0] = line[i];
        const [r, c] = toViewRC(r0, c0);
        const x = c * stepX + stepX / 2,
          y = r * stepY + stepY / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (const line of DIAG_B_LINES) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const [r0, c0] = line[i];
        const [r, c] = toViewRC(r0, c0);
        const x = c * stepX + stepX / 2,
          y = r * stepY + stepY / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--grid")
        .trim() || "#cbd5e1";
    ctx.lineWidth = 1.5;
    for (let r = 0; r < BOARD_N; r++) {
      const y = r * stepY + stepY / 2;
      ctx.beginPath();
      ctx.moveTo(stepX / 2, y);
      ctx.lineTo(W - stepX / 2, y);
      ctx.stroke();
    }
    for (let c = 0; c < BOARD_N; c++) {
      const x = c * stepX + stepX / 2;
      ctx.beginPath();
      ctx.moveTo(x, stepY / 2);
      ctx.lineTo(x, H - stepY / 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#667085";
    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        const x = c * stepX + stepX / 2;
        const y = r * stepY + stepY / 2;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawCoords(ctx, W, H) {
    ctx.save();

    const style = (S._activeStyle && S._activeStyle.coords) ? S._activeStyle.coords : null;
    const isDark = document.documentElement.classList.contains("dark");

    if (!style) {
      ctx.fillStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--muted")
          .trim() || "#475569";
      ctx.font = "12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const stepX = W / BOARD_N;
      const stepY = H / BOARD_N;
      for (let r = 0; r < BOARD_N; r++) {
        for (let c = 0; c < BOARD_N; c++) {
          const [vr, vc] = toViewRC(r, c);
          const x = vc * stepX + stepX / 2;
          const y = vr * stepY + stepY / 2;
          ctx.fillText(`${r + 1}.${c + 1}`, x, y);
        }
      }
      ctx.restore();
      return;
    }

    ctx.font = style.font || "bold 15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const stepX = W / BOARD_N;
    const stepY = H / BOARD_N;
    const minSide = Math.min(stepX, stepY);
    const radiusMul = style.radiusMul || 0.22;
    const radius = Math.max(10, minSide * radiusMul);

    const bg = isDark ? (style.bgDark || "rgba(0,0,0,0.35)") : (style.bgLight || "rgba(255,255,255,0.55)");
    const fill = isDark ? (style.fillDark || "#f8fafc") : (style.fillLight || "#111827");
    const stroke = isDark ? (style.strokeDark || "rgba(0,0,0,0.85)") : (style.strokeLight || "rgba(255,255,255,0.95)");

    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        const [vr, vc] = toViewRC(r, c);
        const x = vc * stepX + stepX / 2;
        const y = vr * stepY + stepY / 2;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();

        ctx.lineWidth = style.lineWidth != null ? style.lineWidth : 3;
        ctx.strokeStyle = stroke;
        ctx.strokeText(`${r + 1}.${c + 1}`, x, y);

        ctx.fillStyle = fill;
        ctx.fillText(`${r + 1}.${c + 1}`, x, y);
      }
    }

    ctx.restore();
  }
  function drawCellHighlight(ctx, r, c) {
    ctx.save();
    const cv = S._activeCanvas || qs("#board");
    const stepX = cv.width / BOARD_N;
    const stepY = cv.height / BOARD_N;
    const minSide = Math.min(stepX, stepY);
    const [vr, vc] = toViewRC(r, c);
    const cx = vc * stepX + stepX / 2;
    const cy = vr * stepY + stepY / 2;

    const radius = minSide * 0.28;
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);

    ctx.fillStyle = "#ef4444";
    ctx.globalAlpha = 0.18;
    ctx.fillRect(-radius, -radius, 2 * radius, 2 * radius);

    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(3.5, minSide * 0.05);
    ctx.strokeStyle = "#b91c1c";
    ctx.strokeRect(-radius, -radius, 2 * radius, 2 * radius);

    ctx.restore();
  }

  function pieceFill(v) {
    const owner = pieceOwner(v);
    return owner === BOT
      ? ["#fafafa", "#d4d4d4"]
      : ["#0b1220", "#1f2937"];
  }

  function drawPieces(ctx) {
    const cv = S._activeCanvas || qs("#board");
    const stepX = cv.width / BOARD_N;
    const stepY = cv.height / BOARD_N;
    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        const v = Game.board[r][c];
        if (!v) continue;
        const [vr, vc] = toViewRC(r, c);
        const x = vc * stepX + stepX / 2;
        const y = vr * stepY + stepY / 2;

        const rad = Math.max(1, Math.min(stepX, stepY) / 2 - 25);
        const [c1, c2] = pieceFill(v);
        const grad = ctx.createRadialGradient(
          x - rad * 0.3,
          y - rad * 0.3,
          rad * 0.2,
          x,
          y,
          rad
        );
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = pieceOwner(v) === BOT ? "#facc15" : "#fb923c";
        ctx.stroke();

        if (Math.abs(v) === 2) {
          ctx.beginPath();
          ctx.arc(x, y, rad * 0.8, 0, Math.PI * 2);
          ctx.lineWidth = 4;
          ctx.strokeStyle = "#f5c542";
          ctx.stroke();
        }

        const dotR = rad * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = pieceOwner(v) === BOT ? "#3b82f6" : "#facc15";
        ctx.fill();

        ctx.restore();
      }
    }
  }
  function drawCapturedNumbers(ctx) {
    const order = TurnFX.capturedOrder;
    if (!order || !order.length) return;
    const cv = S._activeCanvas || qs("#board");
    const stepX = cv.width / BOARD_N;
    const stepY = cv.height / BOARD_N;
    const minSide = Math.min(stepX, stepY);
    ctx.save();
    ctx.font = `bold ${Math.max(
      16,
      (minSide * 0.34) | 0
    )}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < order.length; i++) {
      const idx = order[i];
      const [r0, c0] = idxToRC(idx);
      const [r, c] = toViewRC(r0, c0);
      const x = c * stepX + stepX / 2;
      const y = r * stepY + stepY / 2;

      ctx.lineWidth = Math.max(3, minSide * 0.06);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(String(i + 1), x, y);
      ctx.fillStyle = "#fef08a";
      ctx.fillText(String(i + 1), x, y);
    }
    ctx.restore();
  }

  function drawNumberOnIdx(ctx, idx, text, color) {
    const [x, y, stepX, stepY] = cellCenter(idx);
    const minSide = Math.min(stepX, stepY);
    ctx.save();
    ctx.font = `bold ${Math.max(
      16,
      (minSide * 0.34) | 0
    )}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, minSide * 0.06);
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || "#fef08a";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawArrow(ctx, fromIdx, toIdx, color, opts) {
    const [x1, y1] = cellCenter(fromIdx);
    const [x2, y2] = cellCenter(toIdx);

    const base = (S._activeStyle && S._activeStyle.arrow) ? S._activeStyle.arrow : null;
    const st = opts || base || {};
    const lw = st.lineWidth != null ? st.lineWidth : 4.5;
    const head = st.head != null ? st.head : 16;

    ctx.save();
    ctx.strokeStyle = color || "#22c55e";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(ang - Math.PI / 6),
      y2 - head * Math.sin(ang - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - head * Math.cos(ang + Math.PI / 6),
      y2 - head * Math.sin(ang + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawPath(ctx, fromIdx, pathList, color) {
    let cur = fromIdx;
    for (const to of pathList) {
      drawArrow(ctx, cur, to, color);
      cur = to;
    }
  }
  function drawX(ctx, idx, color) {
    const [x, y, stepX, stepY] = cellCenter(idx);
    const rad = Math.max(1, Math.min(stepX, stepY) / 2 - 25);
    const s = Math.max(6, rad * 0.9);
    ctx.save();
    ctx.strokeStyle = color || "#ef4444";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x - s, y + s);
    ctx.lineTo(x + s, y - s);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrownPulse(ctx, idx) {
    const [x, y, stepX, stepY] = cellCenter(idx);
    const r = (Math.min(stepX, stepY) / 2) * 0.9;
    ctx.save();
    ctx.strokeStyle = "#fcd34d";
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  return {
    draw,
    setSuspended,
    getHighlightCells: () => (S.highlightCells || []),
    setLastMove,
    setLastMovePath,
    clearPrevMove,
    promoteLastMoveToPrev,
    setUndoMove,
    setUndoMovePath,
    setSouflaRemove,
    setSouflaForcePath,
    setIgnoredKills,
    setForcedOpeningArrow,
    clearForcedOpeningArrow,
    setHighlightCells,
queueCrown,
    capturedOrderPush(idx) {
      TurnFX.capturedOrder.push(idx);
      draw();
    },
    clearCapturedOrder() {
      TurnFX.reset();
      draw();
    },
    setShowCoords(v) {
      S.showCoords = !!v;
      draw();
    },
    setSouflaIgnoredPaths: setSouflaIgnoredPaths,
    setSouflaUndoArrow: setSouflaUndoArrow,
    clearSouflaFX: clearSouflaFX,
    applySouflaFXBatch: applySouflaFXBatch,
  renderSouflaPreview: renderSouflaPreview,
  };
})();







function trBegin(payload) {
  try {
    if (typeof TrainRecorder === "undefined") return null;
    return TrainRecorder.beginDecision(payload);
  } catch {
    return null;
  }
}

function trEnd(token, payload) {
  try {
    if (typeof TrainRecorder === "undefined") return;
    TrainRecorder.endDecision(token, payload);
  } catch {}
}





function boardIdxFromClient(canvas, clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;

  if (!(x >= 0 && y >= 0 && x < canvas.width && y < canvas.height)) return null;

  const stepX = canvas.width / BOARD_N;
  const stepY = canvas.height / BOARD_N;

  const cView = Math.floor(x / stepX);
  const rView = Math.floor(y / stepY);

  if (rView < 0 || rView >= BOARD_N || cView < 0 || cView >= BOARD_N) return null;

  const [r, c] = fromViewRC(rView, cView);
  return rcToIdx(r, c);
}

function boardIdxFromEvent(canvas, ev) {
  return boardIdxFromClient(canvas, ev.clientX, ev.clientY);
}

const Input = {
  selected: null,

  onBoardClick(ev) {
    const cv = qs("#board");
    if (Game.gameOver) return;
    
    try {
      if (window.Online && window.Online.isActive && window.Online.isSpectator) {
        const idxSp = boardIdxFromEvent(cv, ev);
        if (idxSp != null) {
          try {
            const vSp = valueAt(idxSp);
            if (vSp) {
              Modal.open({
                title: t("modals.notice"),
                text: (t("spectator.only")),
                allowSpectator: true,
                okLabel: t("modals.close"),
              });
            }
          } catch (_) {}
        }
        return;
      }
    } catch (_) {}

    if (window.Online && window.Online.isActive) {
      if (Game.player !== window.Online.mySide) {
        popup(t("status.wait"));
        return;
      }
    }

    if (Game.awaitingPenalty) {
      return;
    }

    const idx = boardIdxFromEvent(cv, ev);
    if (idx == null) return;
    const [r, c] = idxToRC(idx);
        if (shouldShowKillTimerAlert(idx)) {
      popup(
        t("chain.notice.body"),
        t("modals.notice")
      );
      return;
    }

    if (Game.forcedEnabled && Game.forcedPly < 10) {
      if (Game.player !== humanSide()) return;

      const step = Game.forcedSeq[Game.forcedPly];

      const fr0 = rcToIdx(step[0][0], step[0][1]);
      const to1 = rcToIdx(step[1][0], step[1][1]);
      const isChainOpening = step.length > 2;
      const toFinal = isChainOpening
        ? rcToIdx(step[step.length - 1][0], step[step.length - 1][1])
        : to1;

      let frExp = fr0;
      let toExp = to1;

      if (
        isChainOpening &&
        Game.inChain &&
        Game.chainPos != null &&
        Turn.ctx?.startedFrom === fr0
      ) {
        if (Game.chainPos === to1) {
          frExp = to1;
          toExp = toFinal;
        }
      }

      if (Input.selected == null) {

        const v = valueAt(idx);
        const allowedStart =
          Game.inChain && Game.chainPos != null ? Game.chainPos : frExp;

        if (idx !== allowedStart || pieceOwner(v) !== Game.player) {
          Visual.setForcedOpeningArrow(frExp, toExp);
          UI.status(
            t("status.forcedMove", {
              from: rcStr(frExp),
              to: rcStr(toExp),
            })
          );

          Modal.open({
            title: t("modals.forcedOpening.title"),
            body: `<div>${t("modals.forcedOpening.body")
              }</div>`,
            buttons: [
              {
                label: t("modals.close"),
                className: "primary",
                onClick: () => { Modal.close(); UI.showSettingsModal(prefill); },
              },
            ],
          });
          return;
        }
        Input.selected = idx;
        Visual.setHighlightCells([[r, c]]);
        Visual.draw();
        return;
      } else {
        const v = valueAt(Input.selected);

        if (
          isChainOpening &&
          Input.selected === fr0 &&
          idx === toFinal &&
          (!Game.inChain || Game.chainPos == null)
        ) {
          Visual.setForcedOpeningArrow(fr0, toFinal);
          const msg =
            t("status.forcedChainStepByStep");
          UI.status(msg);
          popup(msg);
          Input.selected = null;
          Visual.setHighlightCells([]);
          Visual.draw();
          return;
        }

        const [isCapSingle, jumpedSingle] = classifyCapture(
          Input.selected,
          idx
        );

        if (!isCapSingle) {
          if (idx !== toExp) {
            Visual.setForcedOpeningArrow(frExp, toExp);
            UI.status(
              t("status.forcedMove", {
                from: rcStr(frExp),
                to: rcStr(toExp),
              })
            );
            Input.selected = null;
            Visual.setHighlightCells([]);
            Visual.draw();
            return;
          }

          if (Game.forcedPly === 0) {
            applyMove(Input.selected, idx, false, null);
            Game.inChain = false;
            Game.chainPos = null;
            Game.lastMovedTo = idx;
            Game.killTimer.hardStop();

            Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
            UI.log(
              `${t("log.move")}: ${rcStr(
                Input.selected
              )}→${rcStr(idx)} (${sideLabel(Game.player)})`
            );

            if (typeof Visual.clearForcedOpeningArrow === "function") {
              Visual.clearForcedOpeningArrow();
            }

            Game.forcedPly += 1;

            if (Game.forcedPly === 10) {
              handleForcedOpeningOver({ showModal: true });
            }

            Input.selected = null;
            Visual.setHighlightCells([]);

            Turn.finishTurnAndSoufla();

            if (
              !Game.awaitingPenalty &&
              !Game.gameOver &&
              Game.player === aiSide() &&
              !(Game.forcedEnabled && Game.forcedPly < 10)
            ) {
              AI.scheduleMove();
            }
            return;
          }

          Visual.setForcedOpeningArrow(frExp, toExp);
          UI.status(
            t("status.forcedMove", {
              from: rcStr(frExp),
              to: rcStr(toExp),
            })
          );
          Input.selected = null;
          Visual.setHighlightCells([]);
          Visual.draw();
          return;
        }

        if (!Turn.ctx) Turn.start();
        Turn.beginCapture(Input.selected);
        applyMove(Input.selected, idx, true, jumpedSingle);
        Turn.recordCapture();

        Game.inChain = true;
        Game.chainPos = idx;
        Game.lastMovedTo = idx;
        if (!Game.killTimer.running) Game.killTimer.start();
        qs("#btnEndKill").disabled = false;

        Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
        UI.log(
          `${nowHHMMSS()} ${t("log.capture")}: ${rcStr(
            Input.selected
          )}→${rcStr(idx)}, ${t("log.remove")} ${rcStr(
            jumpedSingle
          )} (${sideLabel(Game.player)})`
        );

        Input.selected = null;
        Visual.setHighlightCells([]);
        Visual.draw();
        return;
      }
    }

    if (Game.player !== humanSide()) {
      return;
    }
    const v = valueAt(idx);
    if (Input.selected == null) {
      if (!v || pieceOwner(v) !== Game.player) {
        return;
      }
      Input.selected = idx;
      Visual.setHighlightCells([[r, c]]);
      Visual.draw();
      return;
    } else {
      const fromIdx = Input.selected;
      const toIdx = idx;
      const { mask } = legalActions();
      const a = encodeAction(fromIdx, toIdx);
      if (!mask[a]) {
        Input.selected = null;
        Visual.setHighlightCells([]);
        Visual.draw();
        return;
      }
      const [isCap, jumped] = classifyCapture(fromIdx, toIdx);
      if (isCap) {
        if (!Turn.ctx) Turn.start();
        Turn.beginCapture(fromIdx);
                const tr = trBegin({ fromIdx, toIdx, action: encodeAction(fromIdx, toIdx), actor: Game.player });
        applyMove(fromIdx, toIdx, true, jumped);
        Turn.recordCapture();
        Game.inChain = true;
        Game.chainPos = toIdx;
        Game.lastMovedTo = toIdx;
        Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);

                trEnd(tr, { cap: 1, fromStr: rcStr(fromIdx), toStr: rcStr(toIdx) });
        UI.log(
          `${nowHHMMSS()} ${t("log.capture")}: ${rcStr(
            fromIdx
          )}→${rcStr(toIdx)}, ${t("log.remove")} ${rcStr(
            jumped
          )} (${sideLabel(Game.player)})`
        );

        const caps = generateCapturesFrom(toIdx, valueAt(toIdx));
        if (caps.length === 0) {
          qs("#btnEndKill").disabled = false;
        } else {
          qs("#btnEndKill").disabled = false;
        }
      } else {
        if (Game.inChain) {
          Input.selected = null;
          Visual.setHighlightCells([]);
          Visual.draw();
          return;
        }
                const tr = trBegin({ fromIdx, toIdx, action: encodeAction(fromIdx, toIdx), actor: Game.player });
        applyMove(fromIdx, toIdx, false, null);
        Game.inChain = false;
        Game.chainPos = null;
        Game.lastMovedTo = toIdx;
        Visual.setLastMove(fromIdx, toIdx);

                trEnd(tr, { cap: 0, fromStr: rcStr(fromIdx), toStr: rcStr(toIdx) });
        UI.log(
          `${nowHHMMSS()} ${t("log.move")}: ${rcStr(
            fromIdx
          )}→${rcStr(toIdx)} (${sideLabel(Game.player)})`
        );

        maybeQueueDeferredPromotion(toIdx);
        Turn.finishTurnAndSoufla();
      }
      Input.selected = null;
      Visual.setHighlightCells([]);
      Visual.draw();

      if (
        !Game.awaitingPenalty &&
        !Game.gameOver &&
        Game.player === aiSide() &&
        !(Game.forcedEnabled && Game.forcedPly < 10)
      ) {
        AI.scheduleMove();
      }
    }
  },
};





function endKillPressed() {
  if (Game.player !== humanSide()) {
    popup(t("ui.notYourTurn"));
    return;
  }
  if (!Game.inChain) return;

  Game.killTimer.stop();

  if (Game.forcedEnabled && Game.forcedPly < 10) {
    const step = Game.forcedSeq[Game.forcedPly];
    const fromReq = rcToIdx(step[0][0], step[0][1]);
    const to1 = rcToIdx(step[1][0], step[1][1]);
    const isChainOpening = step.length > 2;
    const toFinal = isChainOpening
      ? rcToIdx(step[step.length - 1][0], step[step.length - 1][1])
      : to1;

    const startedFrom = (Turn.ctx && Turn.ctx.startedFrom != null) ? Turn.ctx.startedFrom : (Game.lastMoveFrom != null ? Game.lastMoveFrom : null);
    const endedAt = Game.chainPos ?? Game.lastMovedTo;

    if (
      isChainOpening &&
      startedFrom === fromReq &&
      endedAt !== toFinal
    ) {
      const nextFrom = Game.chainPos != null ? Game.chainPos : fromReq;
      const nextTo = nextFrom === fromReq ? to1 : toFinal;

      Visual.setForcedOpeningArrow(nextFrom, nextTo);
      const msg =
        t("status.forcedChainIncomplete");
      UI.status(msg);
      popup(msg);
      Visual.draw();
      return;
    }

    if (startedFrom !== fromReq || endedAt !== toFinal) {
      try {
        window.Online?.clearPendingLocalMove?.();
      } catch { }
      if (Turn.ctx?.snapshot) {
        restoreSnapshot(Turn.ctx.snapshot);
      }

      Visual.setForcedOpeningArrow(fromReq, toFinal);

      const msg = isChainOpening
        ? (t("status.forcedChainStepByStep"))
        : (t("status.forcedMove", {
          from: rcStr(fromReq),
          to: rcStr(toFinal),
        }));

      UI.status(msg);
      Turn.start();
      Visual.draw();
      return;
    }

    Game.forcedPly += 1;
    if (Game.forcedPly === 10) {
      handleForcedOpeningOver();
    }
  }

  try {
    const fromIdx = (Game.chainPos ?? Game.lastMovedTo ?? null);
    if (typeof TrainRecorder !== "undefined" && TrainRecorder && typeof TrainRecorder.beginMoveBoundary === "function") {
      TrainRecorder.beginMoveBoundary({ type: "end_chain", actor: Game.player, fromIdx });
    }
    const tr = trBegin({ action: ACTION_ENDCHAIN, actor: Game.player, fromIdx });
    const fromStr = fromIdx != null ? rcStr(fromIdx) : "END";
    trEnd(tr, { cap: 0, fromStr, toStr: "END" });
  } catch {}

  maybeQueueDeferredPromotion(Game.chainPos ?? Game.lastMovedTo);

  Game.inChain = false;
  Game.chainPos = null;
  qs("#btnEndKill").disabled = true;

  Turn.finishTurnAndSoufla();

  if (
    !Game.awaitingPenalty &&
    !Game.gameOver &&
    Game.player === aiSide() &&
    !(Game.forcedEnabled && Game.forcedPly < 10)
  ) {
    AI.scheduleMove();
  }
}





const UI = {
  updateAll() {
    this.updateStatus();
    Visual.draw();

    
    try { SessionGame.saveSoon(); } catch {}
  },
  _setStatusWithPawn(txt, pawnSide) {
    const msgEl = qs("#statusTextMsg") || qs("#statusText");
    const pawnEl = qs("#turnPawn");
    if (msgEl) msgEl.textContent = String(txt ?? "");
    if (!pawnEl) return;

    if (pawnSide === TOP || pawnSide === BOT) {
      pawnEl.style.display = "";
      pawnEl.src =
        pawnSide === BOT
          ? "../assets/icons/pawn-white.svg"
          : "../assets/icons/pawn-black.svg";
    } else {
      pawnEl.style.display = "none";
    }
  },

  updateStatus() {
    const s = qs("#statusText");
    if (!s) return;

    if (Game.gameOver) {
      const msg =
        Game.winner == null
          ? t("status.draw")
          : `${t("status.win")} ${sideLabel(
              Game.winner
            )}`;
      this._setStatusWithPawn(msg, null);
      return;
    }

    this._setStatusWithPawn(
      `${t("status.turn")} ${sideLabel(Game.player)}`,
      Game.player
    );
  },



  updateCounts({ top, bot, tKings, bKings }) {
    const set = (id, val) => {
      const el = qs(id);
      if (el) el.textContent = String(val);
    };

    set("#topLeft", top);
    set("#topLeftM", top);
    set("#botLeft", bot);
    set("#botLeftM", bot);

    set("#topKings", tKings);
    set("#topKingsM", tKings);
    set("#botKings", bKings);
    set("#botKingsM", bKings);

    set("#topCaptured", 40 - top);
    set("#topCapturedM", 40 - top);
    set("#botCaptured", 40 - bot);
    set("#botCapturedM", 40 - bot);
  },
  showGameOverModal(winner) {
    
    
    
    
    const title = (
      winner == null
        ? (t("modals.gameOver.drawTitle"))
        : (winner === humanSide()
            ? (t("modals.gameOver.winTitle"))
            : (t("modals.gameOver.loseTitle")))
    );

    const bodyTxt = (
      winner == null
        ? (t("modals.gameOver.drawBody") || (t("status.draw")))
        : (winner === humanSide()
            ? (t("modals.gameOver.winBody") || (t("status.win")))
            : (t("modals.gameOver.loseBody") || (t("status.lose"))))
    );

    let goHome = true;

    const goMode = () => {
      
      try {
        if (window.Online && window.Online.isActive && typeof window.Online.exitToMode === "function") {
          window.Online.exitToMode();
          return;
        }
      } catch (_) {}

      try { SessionGame.clear(); } catch (_) {}
      try { localStorage.removeItem("zamat.activeGameId"); } catch (_) {}
      try { localStorage.removeItem("zamat.activeGameTs"); } catch (_) {}

      const href = (location.pathname || "").includes("/pages/") ? "mode.html" : "pages/mode.html";
      try { location.href = href; } catch (_) {}
    };

    Modal.open({
      title: title,
      text: bodyTxt,
      buttons: [
        {
          label: t("modals.newGame.title") || (t("buttons.newGame")),
          className: "ok",
          onClick: () => {
            
            try {
              if (window.Online && window.Online.isActive) {
                if (typeof window.Online.requestRematch === "function") {
                  goHome = false;
                  window.Online.requestRematch();
                  Modal.close();
                  return;
                }
                popup(t("online.rematch.pending"));
                return;
              }
            } catch (_) {}

            
            goHome = false;
            try { SessionGame.clear(); } catch (_) {}
            setupInitialBoard();
            Visual.clearCapturedOrder();
            Visual.clearSouflaFX();
            Visual.setHighlightCells([]);
            Visual.clearForcedOpeningArrow();
            Visual.setLastMove(null, null);
            Visual.setUndoMove(null, null);
            Visual.draw();
            try { Turn.start(); } catch (_) {}
            try { scheduleForcedOpeningAutoIfNeeded(); } catch (_) {}
            try {
              if (
                !Game.gameOver &&
                Game.player === aiSide() &&
                !(Game.forcedEnabled && Game.forcedPly < 10)
              ) {
                AI.scheduleMove();
              }
            } catch (_) {}
            Modal.close();
          },
        },
        {
          label: t("buttons.home") || (t("pages.mode.title")),
          className: "ghost",
          onClick: () => {
            goHome = true;
            Modal.close();
          },
        },
        {
          label: t("modals.close"),
          className: "ghost",
          onClick: () => {
            goHome = true;
            Modal.close();
          },
        },
      ],
      onClose: () => {
        if (goHome) goMode();
      },
    });
  },

  status(txt) {
    const pawnSide = Game && Game.gameOver ? null : (Game ? Game.player : null);
    this._setStatusWithPawn(txt, pawnSide);
  },

  updateKillClock(ms) {
    const mm = Math.floor(ms / 60000)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    qs("#killClock").textContent = `${mm}:${ss}`;
  },
  logAIState(txt) {
    logLine(txt);
  },
  log(txt) {
    logLine(txt);
  },

  showSettingsModal(prefill) {
    const wrap = document.createElement("div");
    wrap.className = "settings-general";

    const isOnline = !!(window.Online && window.Online.isActive);

    
    try { Game.normalizeAdvancedSettings(); } catch (_) {}
    const adv = (Game.settings && Game.settings.advanced) ? Game.settings.advanced : {};

    const pre = (prefill && typeof prefill === "object") ? prefill : {};
    const preGeneral = (pre.general && typeof pre.general === "object") ? pre.general : {};

    
    const preModels = pre.models || pre.hybrid || {};
    const preAlgo = pre.algo || pre.hybrid || {};
    const preHasFlat =
      pre &&
      ("w_onnx" in pre ||
        "w_human" in pre ||
        "w_heur" in pre ||
        "w_minimax" in pre ||
        "w_mcts" in pre ||
        "w_mauritanian" in pre);

    const preFlat = preHasFlat
      ? pre
      : {
          thinkTimeMs: pre.thinkTimeMs,
          timeBoostCriticalMs: pre.timeBoostCriticalMs,
          aiCaptureMode: pre.aiCaptureMode,
          aiRandomIgnoreCaptureRatePct: pre.aiRandomIgnoreCaptureRatePct,
          w_onnx: preModels.w_onnx,
          w_human: preModels.w_human,
          w_heur: preAlgo.w_heur,
          w_minimax: preAlgo.w_minimax,
          minimaxDepth: preAlgo.minimaxDepth,
          w_mcts: preAlgo.w_mcts,
          mctsSimulations: preAlgo.mctsSimulations,
          w_mauritanian: preAlgo.w_mauritanian,
        };

    const vals = {
      
      starter: String(preGeneral.starter ?? Game.settings.starter ?? "white"),
      theme: String(preGeneral.theme ?? Game.settings.theme ?? "dark"),
      longFx: !!(preGeneral.longFx ?? Game.settings.longFx),
      showCoords: !!(preGeneral.showCoords ?? Game.settings.showCoords),
      boardStyle: String(preGeneral.boardStyle ?? Game.settings.boardStyle ?? "2d"),

      
      thinkTimeMs: Number(preFlat.thinkTimeMs ?? adv.thinkTimeMs ?? 250),
      timeBoostCriticalMs: Number(preFlat.timeBoostCriticalMs ?? adv.timeBoostCriticalMs ?? 250),
      aiCaptureMode: String(preFlat.aiCaptureMode ?? Game.settings.aiCaptureMode ?? "random"),
      aiRandomIgnoreCaptureRatePct: Number(preFlat.aiRandomIgnoreCaptureRatePct ?? Game.settings.aiRandomIgnoreCaptureRatePct ?? 12),

      
      w_onnx: Number(preFlat.w_onnx ?? adv.w_onnx ?? 0),
      w_human: Number(preFlat.w_human ?? adv.w_human ?? 10),

      
      w_heur: Number(preFlat.w_heur ?? adv.w_heur ?? 0),
      w_minimax: Number(preFlat.w_minimax ?? adv.w_minimax ?? 0),
      minimaxDepth: Number(preFlat.minimaxDepth ?? adv.minimaxDepth ?? 3),
      w_mcts: Number(preFlat.w_mcts ?? adv.w_mcts ?? 0),
      mctsSimulations: Number(preFlat.mctsSimulations ?? adv.mctsSimulations ?? 200),
      w_mauritanian: Number(preFlat.w_mauritanian ?? adv.w_mauritanian ?? 0),
    };

    const thinkChoices = [0, 250, 500, 750, 1000, 1500, 2000, 4000, 6000, 8000, 10000, 12000, 15000, 20000];
    const boostChoices = [0, 250, 500, 750, 1000, 1500, 2000, 4000, 8000, 12000, 20000];
    const wChoices = Array.from({ length: 11 }, (_, i) => i);
    const depthChoices = Array.from({ length: 9 }, (_, i) => i);
    const simsChoices = [0, 50, 100, 150, 200, 300, 400, 500, 750, 1000];

    const mkOptions = (arr, selected, labelFn) =>
      arr
        .map((v) => {
          const sel = Number(v) === Number(selected) ? "selected" : "";
          const label = typeof labelFn === "function" ? labelFn(v) : v;
          return `<option value="${v}" ${sel}>${label}</option>`;
        })
        .join("");

    const disabledAdv = isOnline ? "disabled" : "";

    wrap.innerHTML = `
<div class="option-list">
  ${isOnline
    ? `<div class="muted" style="margin-bottom:8px;">
        ${t("settings.pvpNotice")
        }
      </div>`
    : ""
  }

  <div style="font-weight:900; margin:6px 0 10px 0;">${t("settings.sections.general")}</div>

  <div class="option-item">
    <div><b>${t("settings.starter")}</b></div>
    <div>
      <select id="setStarter" ${isOnline ? "disabled" : ""}>
        <option value="white">${t("players.white")}</option>
        <option value="black">${t("players.black")}</option>
      </select>
    </div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.theme")}</b></div>
    <div>
      <select id="setTheme">
        <option value="light">${t("settings.light")}</option>
        <option value="dark">${t("settings.dark")}</option>
      </select>
    </div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.longFx")}</b></div>
    <div><input type="checkbox" id="setLongFx"></div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.coords")}</b></div>
    <div><input type="checkbox" id="setCoords"></div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.boardStyle")}</b></div>
    <div>
      <select id="setBoardStyle">
        <option value="2d">${t("settings.board2d")}</option>
        <option value="3d">${t("settings.board3d")}</option>
      </select>
    </div>
  </div>

  <hr style="margin:12px 0;">

  <div style="font-weight:900; margin:6px 0 10px 0;">${t("settings.sections.playOptions")}</div>

  <div class="option-item">
    <div><b>${t("settings.aiCapture")}</b></div>
    <div>
      <select id="advAICap" ${disabledAdv}>
        <option value="mandatory">${t("settings.mandatory")}</option>
        <option value="random">${t("settings.random")}</option>
      </select>
    </div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.aiIgnoreRate")}</b></div>
    <div style="display:flex; gap:10px; align-items:center;">
      <input type="range" id="advAIIgnorePct" min="0" max="100" step="1" style="flex:1;" ${disabledAdv}>
      <span id="advAIIgnorePctVal" class="mono" style="min-width:54px; text-align:end;">0%</span>
    </div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.thinkTime")}</b></div>
    <div><select id="advThink" ${disabledAdv}>${mkOptions(thinkChoices, vals.thinkTimeMs, (v) => (Number(v) === 0 ? (t("dame.advanced.unlimited")) : v))}</select></div>
  </div>

  <div class="option-item">
    <div><b>${t("settings.timeBoost")}</b></div>
    <div><select id="advBoost" ${disabledAdv}>${mkOptions(boostChoices, vals.timeBoostCriticalMs, (v) => (Number(v) === 0 ? (t("dame.advanced.unlimited")) : v))}</select></div>
  </div>

  <hr style="margin:12px 0;">

  <div style="font-weight:900; margin:6px 0 6px 0;">${t("settings.sections.advanced")}</div>
  <div class="muted" style="margin:0 0 10px 0; font-size:12px;">
    ${t("dame.advanced.requireOneHint")}
  </div>

  <div style="font-weight:800; margin:6px 0;">${t("settings.sections.models")}</div>

  <div class="option-item">
    <div><b>${t("labels.onnx")}</b> <span class="muted">${t("dame.advanced.weight")}</span></div>
    <div><select id="m_onnx" ${disabledAdv}>${mkOptions(wChoices, vals.w_onnx, (v) => (Number(v) === 0 ? (t("dame.advanced.disabled")) : v))}</select></div>
  </div>

  <div class="option-item">
    <div><b>${t("labels.humanOnnx")}</b> <span class="muted">${t("dame.advanced.weight")}</span></div>
    <div><select id="m_human" ${disabledAdv}>${mkOptions(wChoices, vals.w_human, (v) => (Number(v) === 0 ? (t("dame.advanced.disabled")) : v))}</select></div>
  </div>

  <div style="font-weight:800; margin:10px 0 6px 0;">${t("settings.sections.algorithms")}</div>

  <div class="option-item">
    <div><b>Heuristic</b> <span class="muted">${t("dame.advanced.weight")}</span></div>
    <div><select id="a_heur" ${disabledAdv}>${mkOptions(wChoices, vals.w_heur, (v) => (Number(v) === 0 ? (t("dame.advanced.disabled")) : v))}</select></div>
  </div>

  <div class="option-item">
    <div><b>Minimax</b> <span class="muted">${t("dame.advanced.weight")}</span></div>
    <div><select id="a_mm" ${disabledAdv}>${mkOptions(wChoices, vals.w_minimax, (v) => (Number(v) === 0 ? (t("dame.advanced.disabled")) : v))}</select></div>
  </div>

  <div class="option-item" id="rowDepth">
    <div class="muted">${t("labels.depth")}</div>
    <div><select id="a_depth" ${disabledAdv}>${mkOptions(depthChoices, vals.minimaxDepth)}</select></div>
  </div>

  <div class="option-item">
    <div><b>MCTS</b> <span class="muted">${t("dame.advanced.weight")}</span></div>
    <div><select id="a_mcts" ${disabledAdv}>${mkOptions(wChoices, vals.w_mcts, (v) => (Number(v) === 0 ? (t("dame.advanced.disabled")) : v))}</select></div>
  </div>

  <div class="option-item" id="rowSims">
    <div class="muted">${t("labels.simulations")}</div>
    <div><select id="a_sims" ${disabledAdv}>${mkOptions(simsChoices, vals.mctsSimulations)}</select></div>
  </div>

  <div class="option-item">
    <div><b>Mauritanian</b> <span class="muted">${t("dame.advanced.weight")}</span></div>
    <div><select id="a_mauri" ${disabledAdv}>${mkOptions(wChoices, vals.w_mauritanian, (v) => (Number(v) === 0 ? (t("dame.advanced.disabled")) : v))}</select></div>
  </div>

  <hr style="margin:12px 0;">

  <div style="font-weight:900; margin:6px 0 6px 0;">4) ${t("dame.advanced.weightsChart")}</div>
  <div id="advWeightsChart"></div>

  <div class="muted" style="margin-top:8px; font-size:12px;">
    ${t("settings.shortcuts")}
  </div>
</div>
`;

    const readGeneralForm = () => ({
      starter: qs("#setStarter", wrap).value,
      theme: qs("#setTheme", wrap).value,
      longFx: qs("#setLongFx", wrap).checked,
      showCoords: qs("#setCoords", wrap).checked,
      boardStyle: qs("#setBoardStyle", wrap).value,
    });

    const readAdvForm = () => ({
      aiCaptureMode: qs("#advAICap", wrap).value,
      aiRandomIgnoreCaptureRatePct: clampInt(parseInt(qs("#advAIIgnorePct", wrap).value, 10), 0, 100, 12),
      thinkTimeMs: parseInt(qs("#advThink", wrap).value, 10),
      timeBoostCriticalMs: parseInt(qs("#advBoost", wrap).value, 10),
      w_onnx: parseInt(qs("#m_onnx", wrap).value, 10),
      w_human: parseInt(qs("#m_human", wrap).value, 10),
      w_heur: parseInt(qs("#a_heur", wrap).value, 10),
      w_minimax: parseInt(qs("#a_mm", wrap).value, 10),
      minimaxDepth: parseInt(qs("#a_depth", wrap).value, 10),
      w_mcts: parseInt(qs("#a_mcts", wrap).value, 10),
      mctsSimulations: parseInt(qs("#a_sims", wrap).value, 10),
      w_mauritanian: parseInt(qs("#a_mauri", wrap).value, 10),
    });

    const renderChart = () => {
      const f = readAdvForm();
      const total =
        f.w_onnx + f.w_human + f.w_heur + f.w_minimax + f.w_mcts + f.w_mauritanian;
      const pct = (x) => (total > 0 ? Math.round((x / total) * 1000) / 10 : 0);

      const rows = [
        ["ONNX", f.w_onnx],
        ["Human", f.w_human],
        ["Heuristic", f.w_heur],
        ["Minimax", f.w_minimax],
        ["MCTS", f.w_mcts],
        ["Mauritanian", f.w_mauritanian],
      ];

      const chart = qs("#advWeightsChart", wrap);
      if (!chart) return;

      chart.innerHTML = `
        <div class="muted" style="margin-bottom:6px;">
          ${t("dame.advanced.weightsSum")} = <b>${total}</b>
        </div>
        ${rows
          .map(([name, w]) => {
            const p = pct(w);
            return `
              <div style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                <div style="width:160px;">${name}</div>
                <div style="flex:1; height:10px; background:rgba(255,255,255,0.08); border-radius:999px; overflow:hidden;">
                  <div style="width:${p}%; height:10px; background:rgba(255,255,255,0.45);"></div>
                </div>
                <div style="width:60px; text-align:end;">${p}%</div>
              </div>
            `;
          })
          .join("")}
      `;
    };

    const syncDeps = () => {
      const f = readAdvForm();

      const depthRow = qs("#rowDepth", wrap);
      const depthSel = qs("#a_depth", wrap);
      if (depthSel) depthSel.disabled = isOnline ? true : !(f.w_minimax > 0);
      if (depthRow) depthRow.style.opacity = f.w_minimax > 0 ? "1" : "0.5";

      const simsRow = qs("#rowSims", wrap);
      const simsSel = qs("#a_sims", wrap);
      if (simsSel) simsSel.disabled = isOnline ? true : !(f.w_mcts > 0);
      if (simsRow) simsRow.style.opacity = f.w_mcts > 0 ? "1" : "0.5";
    };

    const syncIgnoreEnabled = () => {
      const capEl = qs("#advAICap", wrap);
      const ignoreEl = qs("#advAIIgnorePct", wrap);
      const ignoreVal = qs("#advAIIgnorePctVal", wrap);
      if (!capEl || !ignoreEl || !ignoreVal) return;

      const mandatory = capEl.value === "mandatory";
      ignoreEl.disabled = isOnline ? true : mandatory;
      ignoreVal.style.opacity = mandatory ? "0.5" : "1";
    };

    const onAnyChange = () => {
      syncDeps();
      renderChart();
      syncIgnoreEnabled();
      try {
        const ignoreEl = qs("#advAIIgnorePct", wrap);
        const ignoreVal = qs("#advAIIgnorePctVal", wrap);
        if (ignoreEl && ignoreVal) ignoreVal.textContent = `${ignoreEl.value}%`;
      } catch (_) {}
    };

    const applyNow = () => {
      const g = readGeneralForm();

      const prevStarter = Game.settings.starter;
      Game.settings.theme = g.theme;
      Game.settings.longFx = g.longFx;
      Game.settings.showCoords = g.showCoords;
      Game.settings.boardStyle = g.boardStyle;

      applyBoardStyle(g.boardStyle);
      applyTheme(g.theme);
      Visual.setShowCoords(g.showCoords);

      const onlineNow = !!(window.Online && window.Online.isActive);

      let starter = prevStarter;
      let starterChanged = false;

      if (!onlineNow) {
        starter = g.starter;
        starterChanged = starter !== prevStarter;
        Game.settings.starter = starter;
      }

      if (!onlineNow) {
        const f0 = readAdvForm();
        const sumWeights =
          f0.w_onnx +
          f0.w_human +
          f0.w_heur +
          f0.w_minimax +
          f0.w_mcts +
          f0.w_mauritanian;

        if (sumWeights <= 0) {
          popup(t("dame.advanced.requireOne"));
          return;
        }

        Game.settings.aiCaptureMode = f0.aiCaptureMode;
        Game.settings.aiRandomIgnoreCaptureRatePct = f0.aiRandomIgnoreCaptureRatePct;

        const { aiCaptureMode, aiRandomIgnoreCaptureRatePct, ...f } = f0;
        if (f.w_minimax > 0 && f.minimaxDepth <= 0) f.minimaxDepth = 3;
        if (f.w_mcts > 0 && f.mctsSimulations <= 0) f.mctsSimulations = 200;

        if (!Game.settings.advanced) Game.settings.advanced = {};
        Object.assign(Game.settings.advanced, f);
        Game.normalizeAdvancedSettings();
      }

      if (!onlineNow && starterChanged) {
        const atStart =
          !Game.gameOver &&
          (Game.moveCount | 0) === 0 &&
          (Game.forcedPly | 0) === 0 &&
          !Game.inChain &&
          (Game.lastMovedTo == null) &&
          ((Game.history && Game.history.length) ? Game.history.length === 0 : true);

        if (atStart) {
          try { SessionGame.clear(); } catch (_) {}
          setupInitialBoard();
          try { Visual.clearCapturedOrder(); } catch (_) {}
          try { Visual.clearSouflaFX(); } catch (_) {}
          try { Visual.setHighlightCells([]); } catch (_) {}
          try { Visual.clearForcedOpeningArrow?.(); } catch (_) {}
          try { Visual.setLastMove(null, null); } catch (_) {}
          try { Visual.setUndoMove(null, null); } catch (_) {}

          try { Visual.draw(); } catch (_) {}
          try { Turn.start(); } catch (_) {}
          try { scheduleForcedOpeningAutoIfNeeded(); } catch (_) {}
          try {
            if (
              !Game.gameOver &&
              Game.player === aiSide() &&
              !(Game.forcedEnabled && Game.forcedPly < 10)
            ) {
              AI.scheduleMove();
            }
          } catch (_) {}
        } else {
          try {
            popup(
              t("settings.starterNextGameNote")
            );
          } catch (_) {}
        }
      }

      try { Visual.draw(); } catch (_) {}
      try { UI.updateAll(); } catch (_) {}

      Modal.close();
      saveSessionSettings();
      popup(t("log.settings.applied"));
    };

    const keyHandler = (e) => {
      const backdrop = qs("#modalBackdrop");
      if (!backdrop || backdrop.style.display !== "flex") return;

      const bodyEl = qs("#modalBody");
      if (!bodyEl || !bodyEl.querySelector(".settings-general")) return;

      if (e.key === "Escape") {
        e.preventDefault();
        Modal.close();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        applyNow();
      }
    };

    document.addEventListener("keydown", keyHandler);

    setTimeout(() => {
      try {
        qs("#setStarter", wrap).value = vals.starter;
        qs("#setTheme", wrap).value = vals.theme;
        qs("#setLongFx", wrap).checked = !!vals.longFx;
        qs("#setCoords", wrap).checked = !!vals.showCoords;
        qs("#setBoardStyle", wrap).value = vals.boardStyle || "2d";

        qs("#advAICap", wrap).value = vals.aiCaptureMode;
        qs("#advAIIgnorePct", wrap).value = String(vals.aiRandomIgnoreCaptureRatePct);
        qs("#advThink", wrap).value = String(vals.thinkTimeMs);
        qs("#advBoost", wrap).value = String(vals.timeBoostCriticalMs);

        qs("#m_onnx", wrap).value = String(vals.w_onnx);
        qs("#m_human", wrap).value = String(vals.w_human);

        qs("#a_heur", wrap).value = String(vals.w_heur);
        qs("#a_mm", wrap).value = String(vals.w_minimax);
        qs("#a_depth", wrap).value = String(vals.minimaxDepth);

        qs("#a_mcts", wrap).value = String(vals.w_mcts);
        qs("#a_sims", wrap).value = String(vals.mctsSimulations);

        qs("#a_mauri", wrap).value = String(vals.w_mauritanian);
      } catch (_) {}

      ["#advAICap", "#advAIIgnorePct", "#advThink", "#advBoost", "#m_onnx", "#m_human",
        "#a_heur", "#a_mm", "#a_depth",
        "#a_mcts", "#a_sims",
        "#a_mauri"]
        .forEach((sel) => {
          try {
            const el = qs(sel, wrap);
            if (!el) return;
            el.addEventListener("input", onAnyChange);
            el.addEventListener("change", onAnyChange);
          } catch (_) {}
        });

      onAnyChange();
    }, 0);

    Modal.open({
      title: t("modals.settings.title"),
      body: wrap,
      onClose: () => document.removeEventListener("keydown", keyHandler),
      buttons: [
        {
          label: t("dame.advanced.helpBtn"),
          className: "adv-help",
          onClick: () => {
            const nextPrefill = Object.assign({}, readAdvForm(), { general: readGeneralForm() });
            Modal.close();
            UI.showAdvancedSettingsHelp(nextPrefill);
          }
        },
        { label: t("modals.apply"), className: "ok", onClick: applyNow },
        { label: t("modals.cancel"), className: "ghost", onClick: () => Modal.close() },
      ],
    });
  },

  showAdvancedSettings(prefill) {
    UI.showSettingsModal(prefill);
  },

  showAdvancedSettingsHelp(prefill) {
    const body = `
<div class="rules-container">
  <div class="rules-section">
    <h3 class="rules-title">${t("advHelp.title")
      }</h3>
    <ul class="rules-list">
      <li class="rule-item">${t("advHelp.intro.p1")}</li>
      <li class="rule-item">${t("advHelp.intro.p2")}</li>
    </ul>
  </div>

 <div class="rules-section">
  <h3 class="rules-title">${t("advHelp.shared.title")}</h3>

  <ul class="rules-list">
    <li class="rule-item">
      <span class="rule-key">
        ${t("advHelp.shared.forceCapture.title")}
      </span>
      <div>
        <b>${t("advHelp.labels.desc")}</b>
        ${t("advHelp.shared.forceCapture.desc")}
      </div>
      <div>
        <b>${t("advHelp.labels.effect")}</b>
        ${t("advHelp.shared.forceCapture.effect")}
      </div>
    </li>

    <li class="rule-item">
      <span class="rule-key">
        ${t("advHelp.shared.ignoreCapturePercent.title")}
      </span>
      <div>
        <b>${t("advHelp.labels.desc")}</b>
        ${t("advHelp.shared.ignoreCapturePercent.desc")}
      </div>
      <div>
        <b>${t("advHelp.labels.effect")}</b>
        ${t("advHelp.shared.ignoreCapturePercent.effect")}
      </div>
    </li>

    <li class="rule-item">
      <span class="rule-key">${t("advHelp.shared.thinkTime.title")}</span>
      <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.shared.thinkTime.desc")}</div>
      <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.shared.thinkTime.effect")}</div>
    </li>

    <li class="rule-item">
      <span class="rule-key">
        ${t("advHelp.shared.criticalBoost.title")}
      </span>
      <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.shared.criticalBoost.desc")}</div>
      <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.shared.criticalBoost.effect")}</div>
    </li>
  </ul>
</div>


  <div class="rules-section">
    <h3 class="rules-title">${t("advHelp.models.title")
      }</h3>
    <ul class="rules-list">
      <li class="rule-item">${t("advHelp.models.note")}</li>
      <li class="rule-item"><span class="rule-key">${t("advHelp.models.onnx.title")
      }</span>
        <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.models.onnx.desc")
      }</div>
        <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.models.onnx.effect")
      }</div>
      </li>
      <li class="rule-item"><span class="rule-key">${t("advHelp.models.human.title")
      }</span>
        <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.models.human.desc")
      }</div>
        <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.models.human.effect")
      }</div>
      </li>
    </ul>
  </div>

  <div class="rules-section">
    <h3 class="rules-title">${t("advHelp.algos.title")
      }</h3>
    <ul class="rules-list">
      <li class="rule-item">${t("advHelp.algos.generalDesc")}</li>
      <li class="rule-item">${t("advHelp.algos.generalEffect")}</li>
      <li class="rule-item"><span class="rule-key">${t("advHelp.algos.heur.title")
      }</span>
        <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.algos.heur.desc")
      }</div>
        <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.algos.heur.effect")
      }</div>
      </li>
      <li class="rule-item"><span class="rule-key">${t("advHelp.algos.minimax.title")
      }</span>
        <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.algos.minimax.desc")
      }</div>
        <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.algos.minimax.effect")
      }</div>
      </li>
      <li class="rule-item"><span class="rule-key">${t("advHelp.algos.mcts.title")
      }</span>
        <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.algos.mcts.desc")
      }</div>
        <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.algos.mcts.effect")
      }</div>
      </li>
      <li class="rule-item"><span class="rule-key">${t("advHelp.algos.mauri.title")
      }</span>
        <div><b>${t("advHelp.labels.desc")}</b> ${t("advHelp.algos.mauri.desc")
      }</div>
        <div><b>${t("advHelp.labels.effect")}</b> ${t("advHelp.algos.mauri.effect")
      }</div>
      </li>
      <li class="rule-item">${t("advHelp.algos.zeroNote")}</li>
    </ul>
  </div>

  <div class="rules-section">
    <h3 class="rules-title">${t("advHelp.hybrid.title")}</h3>
    <ul class="rules-list">
      <li class="rule-item">${t("advHelp.hybrid.desc")}</li>
      <li class="rule-item">${t("advHelp.hybrid.effect")}</li>
      <li class="rule-item">${t("advHelp.hybrid.note")}</li>
    </ul>
  </div>

  <div class="rules-section">
    <h3 class="rules-title">${t("advHelp.notes.title")}</h3>
    <ul class="rules-list">
      <li class="rule-item">${t("advHelp.notes.i1")}</li>
      <li class="rule-item">${t("advHelp.notes.i2")}</li>
      <li class="rule-item">${t("advHelp.notes.i3")}</li>
      <li class="rule-item">${t("advHelp.notes.i4")}</li>
    </ul>
  </div>
</div>
  `;

    Modal.open({
      title: t("advHelp.modalTitle"),
      body,
      buttons: [
        {
          label: t("modals.back"),
          className: "secondary",
          onClick: () => {
            Modal.close();
            UI.showSettingsModal(prefill);
          },
        },
        {
          label: t("modals.close"),
          className: "primary",
          onClick: () => Modal.close(),
        },
      ],
    });
  },

  showSouflaModal(pending) {
  if (!pending) return;

  (function ensureSouflaModalStyles() {
if (document.getElementById("souflaModalStyles")) return;
const st = document.createElement("style");
st.id = "souflaModalStyles";
st.textContent = `
  .soufla-root{ width:100%; }
  
  .soufla-boardwrap { position: relative; display: block; width: 100%; margin: 0 auto; overflow: visible; padding-top: 12px; }
  .soufla-board { width: 100%; height: auto; display: block; border-radius: 14px; border: 1px solid rgba(148,163,184,0.35); background: rgba(2,6,23,0.04); max-height: 74vh; }
  .soufla-toast{ position:absolute; inset:0; display:none; align-items:center; justify-content:center; z-index:4; pointer-events:none; }
  .soufla-toast > div{ max-width: min(90%, 520px); padding: 12px 16px; border-radius: 14px; font-weight: 900; font-size: 18px; line-height: 1.55; background: rgba(0,0,0,0.72); color: #fff; box-shadow: 0 18px 50px rgba(0,0,0,0.35); text-align:center; }
  :root:not(.dark) .soufla-toast > div{ background: rgba(255,255,255,0.95); color: #111827; box-shadow: 0 18px 50px rgba(0,0,0,0.18); }
  
  .soufla-actionbar {
    scrollbar-width: thin;
    position: absolute;
    display: none;
    z-index: 3;
    align-items: center;
    gap: 8px;
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    user-select: none;
    white-space: nowrap;
    flex-wrap: nowrap;
    max-width: calc(100% - 18px);
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  }
  .soufla-actionbar button {
    padding: 8px 12px;
    border-radius: 999px;
    font-weight: 900;
    border: 2px solid rgba(239,68,68,0.92);
    background: rgba(15, 23, 42, 0.65);
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
  }
  :root:not(.dark) .soufla-actionbar button {
    background: rgba(255,255,255,0.78);
    color: #0f172a;
  }
  .soufla-actionbar button:active { transform: translateY(1px); }
  .soufla-forces{ display:flex; gap:8px; flex-wrap:nowrap; align-items:center; }

  
  #modalBackdrop .modal.soufla-modal{ width: min(1040px, 96vw) !important; max-height: 92vh; }
  #modalBackdrop .modal.soufla-modal .modal-body{ padding: 14px; }
`;document.head.appendChild(st);
  })();

  
  Game.awaitingPenalty = true;
  Game.souflaPending = pending;
  Game.availableSouflaForHuman = pending;

  const offenders = Array.isArray(pending.offenders) ? pending.offenders.slice() : [];
  const offenderSet = new Set(offenders);

  
  
  const forceByOffender = new Map();
  try {
    const opts = Array.isArray(pending.options) ? pending.options : [];
    for (const opt of opts) {
      if (!opt || opt.kind !== "force") continue;
      const off = opt.offenderIdx;
      if (off == null) continue;
      if (!Array.isArray(opt.path) || !opt.path.length) continue;
      let arr = forceByOffender.get(off);
      if (!arr) {
        arr = [];
        forceByOffender.set(off, arr);
      }
      arr.push({
        path: opt.path.slice(),
        jumps: Array.isArray(opt.jumps) ? opt.jumps.slice() : opt.jumps,
      });
    }

    for (const [off, arr] of forceByOffender.entries()) {
      const seen = new Set();
      const uniq = [];
      for (const o of arr) {
        const k = JSON.stringify(o.path);
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(o);
      }
      uniq.sort((a, b) =>
        JSON.stringify(a.path) < JSON.stringify(b.path)
          ? -1
          : JSON.stringify(a.path) > JSON.stringify(b.path)
          ? 1
          : 0
      );
      forceByOffender.set(off, uniq);
    }
  } catch {}

  let applied = false;

  
  
  const cv = document.createElement("canvas");
  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  cv.width = Math.round(1125 * dpr);
  cv.height = Math.round(900 * dpr);
  cv.className = "soufla-board";

  const root = document.createElement("div");
  root.className = "soufla-root";
  const wrap = document.createElement("div");
  wrap.className = "soufla-boardwrap";
  wrap.appendChild(cv);

  const toast = document.createElement("div");
  toast.className = "soufla-toast";
  const toastBox = document.createElement("div");
  toast.appendChild(toastBox);
  wrap.appendChild(toast);

  const actionBar = document.createElement("div");
  actionBar.className = "soufla-actionbar";

  const btnRemove = document.createElement("button");
  btnRemove.className = "danger";
  btnRemove.textContent = t("soufla.pick.btnRemove");

  const forcesWrap = document.createElement("div");
  forcesWrap.className = "soufla-forces";

  actionBar.appendChild(btnRemove);
  actionBar.appendChild(forcesWrap);
  wrap.appendChild(actionBar);

  root.appendChild(wrap);

  const title =
    t("soufla.pick.title");

  let toastTimer = null;
  function showToast(msg) {
    try {
      toastBox.textContent = String(msg ?? "");
      toast.style.display = "flex";
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.style.display = "none";
      }, 1500);
    } catch {}
  }

  let selected = null; 
  function drawPlain() {
    try {
  Visual.renderSouflaPreview(cv, {
    redPaths: [],
    marks: [],
    forcePathsAll: [],
    highlightForcePath: [],
    removeRingIdx: null,
  });
} catch {}
  }
  function clearSelection() {
    selected = null;
    actionBar.style.display = "none";
    drawPlain();
  }

  function idxFromCanvasEvent(ev) {
  return boardIdxFromEvent(cv, ev);
}

  function positionActionBar(ringIdx) {
    const cvRect = cv.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();

    const ox = cvRect.left - wrapRect.left;
    const oy = cvRect.top - wrapRect.top;

    const stepX = cvRect.width / BOARD_N;
    const stepY = cvRect.height / BOARD_N;

    const [r, c] = idxToRC(ringIdx);
    const [vr, vc] = toViewRC(r, c);

    const padX = 10;
    const maxW = Math.max(180, cvRect.width - padX * 2);
    actionBar.style.maxWidth = `${maxW}px`;
    actionBar.style.width = "auto";

    const contentW = Math.max(actionBar.scrollWidth || 0, 180);
    const usableW = Math.min(contentW, maxW);
    actionBar.style.width = `${usableW}px`;

    let x = ox + (vc + 0.5) * stepX;
    const halfW = usableW / 2;
    const minX = ox + padX + halfW;
    const maxX2 = ox + cvRect.width - padX - halfW;
    if (Number.isFinite(minX) && Number.isFinite(maxX2) && maxX2 > minX) {
      x = Math.max(minX, Math.min(maxX2, x));
    }

    const yLine = oy + vr * stepY;
    const barH = actionBar.offsetHeight || 44;

    let bottomY = yLine - 8;

    const minBottomY = barH + 10;
    if (bottomY < minBottomY) bottomY = minBottomY;

    const maxBottomY = oy + cvRect.height - 6;
    if (bottomY > maxBottomY) bottomY = maxBottomY;

    actionBar.style.left = `${x}px`;
    actionBar.style.top = `${bottomY}px`;
    actionBar.style.transform = "translate(-50%, -100%)";
  }

  function pickOffenderForClickedIdx(clickedIdx) {
if (offenderSet.has(clickedIdx)) return { offenderIdx: clickedIdx, ringIdx: clickedIdx };

if (
  pending.startedFrom != null &&
  pending.lastPieceIdx != null &&
  offenderSet.has(pending.startedFrom) &&
  clickedIdx === pending.lastPieceIdx
) {
  return { offenderIdx: pending.startedFrom, ringIdx: clickedIdx };
}
return null;
  }

  function arrowForPath(offIdx, path) {
    try {
      if (!Array.isArray(path) || !path.length) return "→";
      const [r0, c0] = idxToRC(offIdx);
      const [r1, c1] = idxToRC(path[0]);
      const [vr0, vc0] = toViewRC(r0, c0);
      const [vr1, vc1] = toViewRC(r1, c1);
      const dr = vr1 - vr0;
      const dc = vc1 - vc0;
      if (dr < 0 && dc > 0) return "↗";
      if (dr < 0 && dc < 0) return "↖";
      if (dr > 0 && dc > 0) return "↘";
      if (dr > 0 && dc < 0) return "↙";
      if (dr < 0) return "↑";
      if (dr > 0) return "↓";
      if (dc > 0) return "→";
      if (dc < 0) return "←";
      return "→";
    } catch {
      return "→";
    }
  }

  function formatPathChain(offIdx, path) {
    try {
      const pts = [offIdx].concat(Array.isArray(path) ? path : []);
      const parts = pts.map((p) => rcStr(p));
      const maxNodes = 6;
      if (parts.length > maxNodes) {
        return parts.slice(0, maxNodes).join(" → ") + " …";
      }
      return parts.join(" → ");
    } catch {
      return "";
    }
  }

  function selectOffender(offenderIdx, ringIdx) {
  const forces = forceByOffender.get(offenderIdx) || [];
  selected = {
    offenderIdx,
    ringIdx,
    forces,
    forceIndex: forces.length ? 0 : -1,
  };

  function renderWithForceIndex(fi) {
    const f = forces && fi >= 0 ? forces[fi] : null;
    let highlight = [];
    if (f && Array.isArray(f.path)) highlight = [offenderIdx, ...f.path];

    try {
      Visual.renderSouflaPreview(cv, {
        redPaths: [],
        marks: [],
        forcePathsAll: [],
        highlightForcePath: highlight,
        removeRingIdx: ringIdx,
      });
    } catch {}

    actionBar.style.display = "flex";
    positionActionBar(ringIdx);
  }

  forcesWrap.textContent = "";
  for (let i = 0; i < forces.length; i++) {
    const f = forces[i];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "primary";
    b.textContent =
      t("soufla.pick.btnForcePath", { n: i + 1 });

    b.addEventListener("mouseenter", () => {
      if (!selected) return;
      selected.forceIndex = i;
      renderWithForceIndex(i);
    });
    b.addEventListener("focus", () => {
      if (!selected) return;
      selected.forceIndex = i;
      renderWithForceIndex(i);
    });
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!selected) return;
      const pick = selected.forces && selected.forces[i];
      if (!pick) return;
      applied = true;
      try { if (typeof TrainRecorder !== "undefined" && TrainRecorder && typeof TrainRecorder.recordSouflaPenaltyChoice === "function") TrainRecorder.recordSouflaPenaltyChoice({ pending, kind: "force", actor: Game.player }); } catch {}
      applySouflaDecision(
        {
          kind: "force",
          offenderIdx: selected.offenderIdx,
          path: pick.path,
          jumps: pick.jumps,
        },
        pending
      );
      Modal.close();
    });

    forcesWrap.appendChild(b);
  }

  if (forces.length) renderWithForceIndex(0);
  else renderWithForceIndex(-1);
  }

  
  drawPlain();

  cv.addEventListener("click", (ev) => {
ev.stopPropagation();
const idx = idxFromCanvasEvent(ev);
if (idx == null) return;

const v = valueAt(idx);
if (!v) {
  clearSelection();
  return;
}

const hit = pickOffenderForClickedIdx(idx);
if (!hit) {
  clearSelection();
  showToast(
    t("soufla.pick.toastNotOffender")
  );
  return;
}

selectOffender(hit.offenderIdx, hit.ringIdx);
  });

  
  root.addEventListener("click", (ev) => {
if (actionBar.contains(ev.target)) return;

if (ev.target === cv) return;
clearSelection();
  });

  btnRemove.addEventListener("click", (ev) => {
ev.stopPropagation();
if (!selected) return;
applied = true;
try { if (typeof TrainRecorder !== "undefined" && TrainRecorder && typeof TrainRecorder.recordSouflaPenaltyChoice === "function") TrainRecorder.recordSouflaPenaltyChoice({ pending, kind: "remove", actor: Game.player }); } catch {}
applySouflaDecision({ kind: "remove", offenderIdx: selected.offenderIdx }, pending);
Modal.close();
  });

  Modal.open({
title,
body: root,
buttons: [],
onClose: () => {
  try { const m = document.querySelector('#modalBackdrop .modal'); if (m) m.classList.remove('soufla-modal'); } catch {}
  if (applied) return;
  
  
  Game.awaitingPenalty = false;
  try { UI.updateAll(); } catch {}
},
  });
  try { const m = document.querySelector('#modalBackdrop .modal'); if (m) m.classList.add('soufla-modal'); } catch {}
},
  showSouflaAgainstHuman(decision, pending) {
    const offenderStart = rcStr(decision.offenderIdx);
    const startedFrom =
      pending.startedFrom != null ? rcStr(pending.startedFrom) : null;
    const endedAt =
      pending.lastPieceIdx != null ? rcStr(pending.lastPieceIdx) : null;
    const Lmax = pending.longestGlobal || 0;

    const startedFromPart = startedFrom
      ? t("soufla.cpu.startedFromPart", { startedFrom })
      : "";

    let title = t("modals.soufla.header");
    let body = "";

    if (decision.kind === "remove") {
      const removeCell =
        pending.startedFrom === decision.offenderIdx &&
          pending.lastPieceIdx != null
          ? rcStr(pending.lastPieceIdx)
          : offenderStart;

      const reasonLine =
        t("soufla.cpu.reason", {
          offender: offenderStart,
          startedFromPart,
          len: Lmax,
        });
      body = `
  <div><b>${t("soufla.cpu.title")}</b></div>
  <div>${reasonLine}</div>
  <div>${t("soufla.cpu.penaltyRemove", { cell: removeCell })}</div>
      `;
    } else {
      const pathStr = (decision.path || []).map(rcStr).join("→");
      const reasonLine =
        t("soufla.cpu.reason", {
          offender: offenderStart,
          startedFromPart,
          len: Lmax,
        });

      const forceInline =
        t("soufla.cpu.penaltyForceInline", { from: offenderStart, path: pathStr });

      const forcePicked =
        t("soufla.cpu.penaltyForcePicked");

      const revertNotice =
        t("soufla.cpu.revertNotice");

      const forcedIntro =
        t("soufla.cpu.forcedPathIntro");

      const forcedLine =
        t("soufla.cpu.forcedPathLine", { from: offenderStart, path: pathStr });

      body = `
  <div><b>${t("soufla.cpu.title")}</b></div>
  <div>${reasonLine}</div>
  ${startedFrom && endedAt
          ? `<div>${forcePicked}</div>
             <div class="notice">${revertNotice}</div>
             <div>${forcedIntro}</div>
             <div class="mono">${forcedLine}</div>`
          : `<div>${forceInline}</div>`
        }
`;
    }

    Modal.open({
      title,
      body,
      buttons: [
        {
          label: t("modals.close"),
          className: "primary",
          onClick: () => Modal.close(),
        },
      ],
    });
  },

};

// Expose UI on window for modules that check window.UI and flush any buffered AI/model logs.
try { window.UI = UI; } catch (_) {}
try {
  const buf = window.__uiLogBuffer;
  if (Array.isArray(buf) && buf.length) {
    const drained = buf.splice(0, buf.length);
    for (const msg of drained) {
      try {
        if (UI && typeof UI.logAIState === "function") UI.logAIState(msg);
        else if (UI && typeof UI.log === "function") UI.log(msg);
      } catch (_) {}
    }
  }
} catch (_) {}




function confirmUndo() {
  
  if (window.Online && window.Online.isActive) {
    window.Online.requestUndo();
    return;
  }

  
if (!Game.history.length) {
    Modal.open({
        title: t("modals.notice"),
        body: `<div>${t("ui.noUndo")}</div>`,
        buttons: [
            {
                label: t("modals.close"),
                className: "primary",
                onClick: () => { Modal.close(); UI.showSettingsModal(prefill); },
            },
        ],
    });
    return;
}

  const candidate = Game.history[Game.history.length - 1];

  
  if (candidate && candidate.forcedEnabled && candidate.forcedPly < 10) {
    Modal.open({
      title: t("modals.undo.notAllowedTitle"),
      body: `<div>${t("modals.undo.notAllowedBody")}</div>`,
      buttons: [
        { label: t("modals.close"), className: "primary", onClick: () => Modal.close() }
      ],
    });
    return;
  }


const snap = Game.history.pop();
let __beforeUndoSnap = null;
try { __beforeUndoSnap = (typeof snapshotState === "function") ? snapshotState() : null; } catch {}
try { if (typeof TrainRecorder !== "undefined" && TrainRecorder && typeof TrainRecorder.rollbackLastMoveBoundary === "function") TrainRecorder.rollbackLastMoveBoundary(); } catch {}
restoreSnapshot(snap);

try {
  if (__beforeUndoSnap && typeof Visual !== "undefined" && Visual) {
    const fr = __beforeUndoSnap.lastMoveFrom != null ? __beforeUndoSnap.lastMoveFrom : __beforeUndoSnap.lastMovedFrom;
    const p = __beforeUndoSnap.lastMovePath;
    if (fr != null && Array.isArray(p) && p.length && typeof Visual.setUndoMovePath === "function") {
      Visual.setUndoMovePath(fr, p);
    } else if (fr != null && __beforeUndoSnap.lastMovedTo != null && typeof Visual.setUndoMove === "function") {
      Visual.setUndoMove(fr, __beforeUndoSnap.lastMovedTo);
    }
  }
} catch {}

  try { Turn.start(); } catch {}
  try { scheduleForcedOpeningAutoIfNeeded(); } catch {}
  try { UI.updateStatus(); } catch {}

  
  try {
    if (
      !Game.awaitingPenalty &&
      !Game.gameOver &&
      Game.player === aiSide() &&
      !(Game.forcedEnabled && Game.forcedPly < 10)
    ) {
      AI.scheduleMove();
    }
  } catch {}
}

function saveGame() {
  const killMs =
    Game.killTimer.elapsedMs +
    (Game.killTimer.running
      ? performance.now() - Game.killTimer.startTs
      : 0);

  const data = {
    v: 2,
    snapshot: snapshotState(),
    forcedSeqKey: Game.forcedSeq === FO_TOP ? "FO_TOP" : (Game.forcedSeq === FO_BOT ? "FO_BOT" : null),
    settings: Game.settings,
    history: Game.history,
    logHtml: qs("#log") ? qs("#log").innerHTML : "",
    killTimerMs: Math.max(0, killMs | 0),
  };

  localStorage.setItem("zamat.save", JSON.stringify(data));

  Modal.open({
    title: t("buttons.save"),
    body: `<div>${t("log.save.done")
      }</div>`,
    buttons: [
      {
        label: t("modals.close"),
        className: "primary",
        onClick: () => Modal.close(),
      },
    ],
  });
}

function resumeGame() {
  const raw = localStorage.getItem("zamat.save");
  if (!raw) {
    Modal.open({
      title: t("buttons.resume"),
      body: `<div>${t("log.save.none")
        }</div>`,
      buttons: [
        {
          label: t("modals.close"),
          className: "primary",
          onClick: () => Modal.close(),
        },
      ],
    });
    return;
  }

  try {
    const data = JSON.parse(raw);
    const snap = data.snapshot || data;

    Game.board = snap.board;
    Game.player = snap.player;
    Game.inChain = !!snap.inChain;
    Game.chainPos = snap.chainPos ?? null;
    Game.lastMovedTo = snap.lastMovedTo ?? null;
    Game.lastMovedFrom = snap.lastMovedFrom ?? null;
    Game.moveCount = snap.moveCount ?? 0;
    Game.forcedEnabled =
      typeof snap.forcedEnabled === "boolean" ? snap.forcedEnabled : true;
    Game.forcedPly =
      typeof snap.forcedPly === "number" ? snap.forcedPly : 0;

    Game.settings = data.settings || snap.settings || Game.settings;
    Game.normalizeAdvancedSettings();
    Game.history = Array.isArray(data.history) ? data.history : [];

    if (data.forcedSeqKey === "FO_TOP") Game.forcedSeq = FO_TOP;
    else if (data.forcedSeqKey === "FO_BOT") Game.forcedSeq = FO_BOT;
    else {
      try {
        const fp = (typeof snap.forcedPly === "number") ? (snap.forcedPly | 0) : 0;
        const cur = snap.player;
        const base = (fp % 2 === 0) ? cur : -cur;
        Game.forcedSeq = (base === TOP) ? FO_TOP : FO_BOT;
      } catch {
        Game.forcedSeq = FO_BOT;
      }
    }

    if (qs("#log") && typeof data.logHtml === "string") {
      qs("#log").innerHTML = data.logHtml;
    }

    Game.killTimer.hardStop();
    Game.killTimer.elapsedMs =
      typeof data.killTimerMs === "number" ? data.killTimerMs : 0;
    UI.updateKillClock(Game.killTimer.elapsedMs | 0);
    if (Game.inChain) Game.killTimer.start();

    qs("#btnEndKill").disabled = !Game.inChain;

    Turn.start();
    scheduleForcedOpeningAutoIfNeeded();
    UI.updateAll();

    Modal.open({
      title: t("buttons.resume"),
      body: `<div>${t("log.save.resumed")}</div>`,
      buttons: [
        {
          label: t("modals.close"),
          className: "primary",
          onClick: () => Modal.close(),
        },
      ],
    });
  } catch (e) {
    console.error(e);
    Modal.open({
      title: t("buttons.resume"),
      body: `<div>${t("log.save.error")}</div>`,
      buttons: [
        {
          label: t("modals.close"),
          className: "primary",
          onClick: () => Modal.close(),
        },
      ],
    });
  }
}

function souflaPressed() {

  try {
    if (window.Online && typeof Online.logSouflaPressedToFirebase === "function") {
      Online.logSouflaPressedToFirebase();
    }
  } catch {}

  
  try {
    if (window.Online && Online.isActive && Online.mySide != null && Game.player != null && Game.player !== Online.mySide) {
      Modal.open({
        title: t("modals.soufla.header"),
        body: `<div style="font-size:16px; line-height:1.6;">${t("modals.soufla.waitTurn")}</div>`,
        buttons: [{ text: t("actions.ok"), onClick: Modal.close }],
      });
      return;
    }
  } catch {}
   if (Game.forcedEnabled && Game.forcedPly < 10) {
 popup(t("modals.soufla.forcedOpeningWarning"));
return;
 }
  if (Game.availableSouflaForHuman) {
    Game.awaitingPenalty = true;
    Game.souflaPending = Game.availableSouflaForHuman;
    UI.showSouflaModal(Game.souflaPending);
    return;
  }

  Modal.open({
    title: t("modals.soufla.header"),
    body: `<div>${t("modals.soufla.none")
      }</div>`,
    buttons: [
      {
        label: t("modals.close"),
        className: "primary",
        onClick: () => Modal.close(),
      },
    ],
  });
}


function bindUI() {
  qs("#btnSoufla").addEventListener("click", souflaPressed);
  qs("#btnUndo").addEventListener("click", confirmUndo);
qs("#btnSync")?.addEventListener("click", () => window.Online?.syncNow?.());
  qs("#btnChat")?.addEventListener("click", () => window.Online?.openChatModal?.());
  qs("#btnSpk")?.addEventListener("click", () => window.Online?.toggleSpeaker?.());
  qs("#btnMic")?.addEventListener("click", () => window.Online?.toggleMic?.());
  qs("#btnSpecSpk")?.addEventListener("click", () => window.Online?.toggleSpeaker?.());
  qs("#btnSpecMic")?.addEventListener("click", () => window.Online?.toggleMic?.());
  qs("#btnLeaveRoom")?.addEventListener("click", () => window.Online?.leaveRoom?.());
qs("#btnSettings").addEventListener("click", () =>
    UI.showSettingsModal()
  );
  qs("#btnNew").addEventListener("click", () => {
    Modal.open({
      title: t("modals.newGame.title"),
      body: `<div>${t("modals.newGame.confirm")
        }</div>`,
      buttons: [
        {
          label: t("modals.yes"),
          className: "ok",
          onClick: () => {
            try { SessionGame.clear(); } catch {}
            setupInitialBoard();
            Visual.clearCapturedOrder();
            Visual.clearSouflaFX();
            Visual.setHighlightCells([]);
Visual.clearForcedOpeningArrow();
            Visual.setLastMove(null, null);
            Visual.setUndoMove(null, null);

            Visual.draw();
            try { Turn.start(); } catch {}
            try { scheduleForcedOpeningAutoIfNeeded(); } catch {}
            try {
              if (
                !Game.gameOver &&
                Game.player === aiSide() &&
                !(Game.forcedEnabled && Game.forcedPly < 10)
              ) {
                AI.scheduleMove();
              }
            } catch {}
            Modal.close();
},
        },
        {
          label: t("modals.no"),
          className: "ghost",
          onClick: () => Modal.close(),
        },
      ],
    });
  });

  qs("#btnSave").addEventListener("click", saveGame);
  qs("#btnResume").addEventListener("click", resumeGame);
  qs("#btnEndKill").addEventListener("click", endKillPressed);


  qs("#board").addEventListener("click", Input.onBoardClick);
  const btnOnline = qs("#btnOnline");
  if (btnOnline) btnOnline.addEventListener("click", () => {
    try {
      if (window.Online && typeof window.Online.startOnline === "function") {
        window.Online.startOnline();
        return;
      }
      if (typeof window.startOnline === "function") {
        window.startOnline();
        return;
      }
      popup(
        t("status.onlineInitFail")
      );
    } catch (e) {
      popup(
        t("status.onlineInitFail")
      );
    }
  });

}





const Board3D = (() => {
  let enabled = false;
  let inited = false;
  let suspended = false;

  let wrap = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let raycaster = null;
  let mouse = null;

  let boardGroup = null;
  let piecesGroup = null;
  let hiGroup = null;

  
  
  let gridTexCanvas = null;
  let gridTexture = null;
  let gridPlane = null;

  
  let surfaceTexCanvas = null;
  let surfaceTexture = null;
  let bumpTexCanvas = null;
  let bumpTexture = null;
  let _noiseCanvas = null;

  
  
  let M = { W: 0, H: 0, stepX: 0, stepY: 0, unit: 0, halfW: 0, halfH: 0 };

  let lastHash = null;

  function updateMetrics() {
    const cv = qs("#board");
    if (!cv) return;
    const W = Math.max(1, cv.width | 0);
    const H = Math.max(1, cv.height | 0);
    const stepX = W / BOARD_N;
    const stepY = H / BOARD_N;
    M = { W, H, stepX, stepY, unit: Math.min(stepX, stepY), halfW: W / 2, halfH: H / 2 };
  }

  function isDarkTheme() {
    return document.documentElement.classList.contains("dark");
  }

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }


function palette() {
  const dark = isDarkTheme();
  return {



base: cssVar("--board3d-base", dark ? "#0b3d2e" : "#d8b37a"),
plate: cssVar("--board3d-plate", dark ? "#0a3326" : "#caa36e"),
frame: cssVar("--board3d-frame", dark ? "#06261c" : "#b48755"),

line: dark ? "#ffffff" : "#000000",
lineShadow: dark ? "rgba(0,0,0,0.90)" : "rgba(0,0,0,0.45)",
  };
}

  function ensureDom() {
    wrap = qs("#board3d");
  }

  function updateCameraPose() {
    if (!camera) return;
    updateMetrics();

    
    camera.left = -M.halfW;
    camera.right = M.halfW;
    camera.top = M.halfH;
    camera.bottom = -M.halfH;

    camera.near = 1;
    camera.far = Math.max(5000, Math.max(M.W, M.H) * 8);

    const y = Math.max(900, Math.max(M.W, M.H) * 1.8);
    camera.position.set(0, y, 0);

    
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    camera.updateProjectionMatrix();
  }

  function init() {
    if (inited) return true;
    ensureDom();
    if (!wrap) return false;
    if (!window.THREE) return false;

    updateMetrics();

    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    try {
      if (renderer.outputColorSpace !== undefined && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if (renderer.outputEncoding !== undefined && THREE.sRGBEncoding) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
    } catch { }
    try {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch { }

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    try { renderer.setClearColor(0x000000, 0); } catch {}
    wrap.innerHTML = "";
    wrap.appendChild(renderer.domElement);

    
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10000);
    updateCameraPose();

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    
    const amb = new THREE.AmbientLight(0xffffff, 0.80);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(250, 600, -350);
    try {
      dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024);
      
      const span = Math.max(M.W, M.H) * 0.75;
      dir.shadow.camera.left = -span;
      dir.shadow.camera.right = span;
      dir.shadow.camera.top = span;
      dir.shadow.camera.bottom = -span;
      dir.shadow.camera.near = 10;
      dir.shadow.camera.far = 3000;
    } catch { }
    scene.add(dir);

    
    boardGroup = new THREE.Group();
    piecesGroup = new THREE.Group();
    hiGroup = new THREE.Group();
    scene.add(boardGroup);
    scene.add(hiGroup);
    scene.add(piecesGroup);

    buildBoard();

    
    renderer.domElement.addEventListener("click", onClick3D);

    window.addEventListener("resize", resize);

    
    try {
      const mo = new MutationObserver(() => {
        if (!enabled) return;
        try {
          buildBoard();
          syncPieces();
          syncHighlights();
          render();
        } catch { }
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch { }

    resize();

    inited = true;
    return true;
  }

  function resize() {
    if (!renderer || !wrap || !camera) return;
    updateMetrics();
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(10, rect.width | 0);
    const h = Math.max(10, rect.height | 0);
    renderer.setSize(w, h, false);
    updateCameraPose();
    render();
  }

  function disposeNode(n) {
    try {
      n.traverse?.((o) => {
        if (o.geometry) { try { o.geometry.dispose?.(); } catch { } }
        const m = o.material;
        if (Array.isArray(m)) { m.forEach((mm) => { try { mm.dispose?.(); } catch { } }); }
        else if (m) { try { m.dispose?.(); } catch { } }
      });
    } catch { }
  }

  function clearObj3D(obj) {
    if (!obj) return;
    try {
      while (obj.children && obj.children.length) {
        const ch = obj.children.pop();
        try { disposeNode(ch); } catch { }
      }
    } catch { }
  }

  function vrcToPos(vr, vc) {
    const x = (vc * M.stepX + M.stepX / 2) - M.halfW;
    const z = (vr * M.stepY + M.stepY / 2) - M.halfH;
    return new THREE.Vector3(x, 0, z);
  }


function ensureNoiseCanvas() {
  if (_noiseCanvas) return _noiseCanvas;
  _noiseCanvas = document.createElement("canvas");
  _noiseCanvas.width = 256;
  _noiseCanvas.height = 256;
  return _noiseCanvas;
}

function drawBoardSurfaceTexture(ctx, W, H, pal) {
  const dark = isDarkTheme();
  ctx.save();

  
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, H);

  
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.16)");
  g.addColorStop(1, dark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.10)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  
  const ncv = ensureNoiseCanvas();
  const nctx = ncv.getContext("2d");
  const img = nctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
const v = (Math.random() * 255) | 0;
img.data[i] = v;
img.data[i + 1] = v;
img.data[i + 2] = v;
img.data[i + 3] = dark ? 14 : 18;
  }
  nctx.putImageData(img, 0, 0);

  ctx.globalAlpha = dark ? 0.20 : 0.18;
  ctx.drawImage(ncv, 0, 0, W, H);

  
  ctx.globalAlpha = dark ? 0.30 : 0.22;
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  for (let y = 14; y < H; y += 24) {
ctx.beginPath();
for (let x = 0; x <= W; x += 24) {
  const yy = y + Math.sin((x / 60) + (y / 90)) * 3.0;
  if (x === 0) ctx.moveTo(x, yy);
  else ctx.lineTo(x, yy);
}
ctx.stroke();
  }

  
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.1, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, dark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.18)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
}

function drawBumpTexture(ctx, W, H) {
  
  const dark = isDarkTheme();
  ctx.save();
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, W, H);

  
  const ncv = ensureNoiseCanvas();
  const nctx = ncv.getContext("2d");
  const img = nctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
const v = 120 + ((Math.random() * 16) | 0);
img.data[i] = v;
img.data[i + 1] = v;
img.data[i + 2] = v;
img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);

  ctx.globalAlpha = dark ? 0.55 : 0.50;
  ctx.drawImage(ncv, 0, 0, W, H);

  
  ctx.globalAlpha = dark ? 0.55 : 0.50;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(110,110,110,1)";
  for (let y = 18; y < H; y += 28) {
ctx.beginPath();
for (let x = 0; x <= W; x += 28) {
  const yy = y + Math.sin((x / 55) + (y / 80)) * 3.5;
  if (x === 0) ctx.moveTo(x, yy);
  else ctx.lineTo(x, yy);
}
ctx.stroke();
  }

  ctx.restore();
}

function drawGrid3DTexture(ctx, W, H, pal) {
  
  ctx.save();
  const stepX = W / BOARD_N;
  const stepY = H / BOARD_N;
  const main = pal.line;
  const shadow = pal.lineShadow;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  
  ctx.strokeStyle = main;
  ctx.lineWidth = 2.4;

  for (const line of DIAG_A_LINES) {
ctx.beginPath();
for (let i = 0; i < line.length; i++) {
  const [r0, c0] = line[i];
  const [r, c] = toViewRC(r0, c0);
  const x = c * stepX + stepX / 2, y = r * stepY + stepY / 2;
  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}
ctx.stroke();
  }
  for (const line of DIAG_B_LINES) {
ctx.beginPath();
for (let i = 0; i < line.length; i++) {
  const [r0, c0] = line[i];
  const [r, c] = toViewRC(r0, c0);
  const x = c * stepX + stepX / 2, y = r * stepY + stepY / 2;
  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}
ctx.stroke();
  }

  
  ctx.lineWidth = 2.0;
  for (let r = 0; r < BOARD_N; r++) {
const y = r * stepY + stepY / 2;
ctx.beginPath();
ctx.moveTo(stepX / 2, y);
ctx.lineTo(W - stepX / 2, y);
ctx.stroke();
  }
  for (let c = 0; c < BOARD_N; c++) {
const x = c * stepX + stepX / 2;
ctx.beginPath();
ctx.moveTo(x, stepY / 2);
ctx.lineTo(x, H - stepY / 2);
ctx.stroke();
  }

  
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = main;
  const rad = 3.0;
  for (let r = 0; r < BOARD_N; r++) {
for (let c = 0; c < BOARD_N; c++) {
  const x = c * stepX + stepX / 2;
  const y = r * stepY + stepY / 2;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}
  }

  ctx.restore();
}

  function buildBoard() {
    updateMetrics();
    clearObj3D(boardGroup);
    gridPlane = null;

    const pal = palette();
    const unit = M.unit;

    function ensureGridTexture() {
      updateMetrics();
      const W = Math.max(1, M.W | 0);
      const H = Math.max(1, M.H | 0);


const dpr = Math.min(2, window.devicePixelRatio || 1);
const cw = Math.max(1, Math.round(W * dpr));
const ch = Math.max(1, Math.round(H * dpr));

if (!gridTexCanvas || gridTexCanvas.width !== cw || gridTexCanvas.height !== ch) {
  gridTexCanvas = document.createElement("canvas");
  gridTexCanvas.width = cw;
  gridTexCanvas.height = ch;

  gridTexture = new THREE.CanvasTexture(gridTexCanvas);
  
  gridTexture.flipY = false;

  
  try {
gridTexture.generateMipmaps = false;
gridTexture.minFilter = THREE.LinearFilter;
gridTexture.magFilter = THREE.LinearFilter;
  } catch { }

  try {
if (gridTexture.colorSpace !== undefined && THREE.SRGBColorSpace) {
  gridTexture.colorSpace = THREE.SRGBColorSpace;
}
  } catch { }
  try {
const maxAn = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
gridTexture.anisotropy = Math.min(8, maxAn);
  } catch { }
}
const ctx = gridTexCanvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, gridTexCanvas.width, gridTexCanvas.height);
      ctx.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
      try { drawGrid3DTexture(ctx, W, H, pal); } catch { try { drawGrid(ctx, W, H); } catch { } }
      gridTexture.needsUpdate = true;
    }

    ensureGridTexture();


(function ensureSurfaceTextures() {
  updateMetrics();
  const W = Math.max(1, M.W | 0);
  const H = Math.max(1, M.H | 0);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(W * dpr));
  const ch = Math.max(1, Math.round(H * dpr));

  if (!surfaceTexCanvas || surfaceTexCanvas.width !== cw || surfaceTexCanvas.height !== ch) {
surfaceTexCanvas = document.createElement("canvas");
surfaceTexCanvas.width = cw;
surfaceTexCanvas.height = ch;

surfaceTexture = new THREE.CanvasTexture(surfaceTexCanvas);
surfaceTexture.flipY = false;
try {
  surfaceTexture.generateMipmaps = false;
  surfaceTexture.minFilter = THREE.LinearFilter;
  surfaceTexture.magFilter = THREE.LinearFilter;
} catch { }
  }

  if (!bumpTexCanvas || bumpTexCanvas.width !== cw || bumpTexCanvas.height !== ch) {
bumpTexCanvas = document.createElement("canvas");
bumpTexCanvas.width = cw;
bumpTexCanvas.height = ch;

bumpTexture = new THREE.CanvasTexture(bumpTexCanvas);
bumpTexture.flipY = false;
try {
  bumpTexture.generateMipmaps = false;
  bumpTexture.minFilter = THREE.LinearFilter;
  bumpTexture.magFilter = THREE.LinearFilter;
} catch { }
  }

  
  const sctx = surfaceTexCanvas.getContext("2d");
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, cw, ch);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoardSurfaceTexture(sctx, W, H, pal);
  surfaceTexture.needsUpdate = true;

  
  const bctx = bumpTexCanvas.getContext("2d");
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, cw, ch);
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBumpTexture(bctx, W, H);
  bumpTexture.needsUpdate = true;
})();


    
    
    const baseT = Math.max(16, unit * 0.12);
    const plateT = baseT;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(M.W, baseT, M.H),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(pal.plate || pal.base),
        map: surfaceTexture || null,
        bumpMap: bumpTexture || null,
        bumpScale: Math.max(0.4, unit * 0.008),
        roughness: 0.86,
        metalness: 0.02,
      })
    );
    plate.position.y = -plateT / 2 + 0.02;
    plate.receiveShadow = true;
    boardGroup.add(plate);

const frameT = Math.max(18, baseT * 1.15);
const frame = new THREE.Mesh(
  new THREE.BoxGeometry(M.W * 1.035, frameT, M.H * 1.035),
  new THREE.MeshStandardMaterial({
color: new THREE.Color(pal.frame || pal.base),
map: surfaceTexture || null,
bumpMap: bumpTexture || null,
bumpScale: Math.max(0.5, unit * 0.009),
roughness: 0.96,
metalness: 0.0,
  })
);
frame.position.y = -frameT / 2 - 0.6;
frame.receiveShadow = true;
boardGroup.add(frame);


    
    gridPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(M.W, M.H),
      (() => {
        const m = new THREE.MeshBasicMaterial({
            map: gridTexture,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            alphaTest: 0.01,
            side: THREE.DoubleSide,
          });
        
        try { m.toneMapped = false; } catch { }
        return m;
      })()
    );
    gridPlane.rotation.x = -Math.PI / 2;
    gridPlane.position.y = 0.03; 
    gridPlane.receiveShadow = false;
    gridPlane.renderOrder = 1;
    boardGroup.add(gridPlane);
  }

  function makePawnMaterial(isWhite) {
    return new THREE.MeshStandardMaterial({
      color: isWhite ? 0xf8fafc : 0x0b1220,
      roughness: 0.35,
      metalness: 0.05,
    });
  }

  function makePawn(isWhite) {
    const g = new THREE.Group();
    const mat = makePawnMaterial(isWhite);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.40, 0.14, 20), mat);
    base.position.y = 0.07;
    g.add(base);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.30, 0.42, 20), mat);
    body.position.y = 0.14 + 0.21;
    g.add(body);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.10, 18), mat);
    neck.position.y = 0.14 + 0.42 + 0.05;
    g.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 22, 18), mat);
    head.position.y = 0.14 + 0.42 + 0.10 + 0.18;
    g.add(head);

    return g;
  }


function makeKing(isWhite) {
  const g = new THREE.Group();
  const mat = makePawnMaterial(isWhite);

  
  const gold = new THREE.MeshStandardMaterial({
color: 0xfacc15,
roughness: 0.35,
metalness: 0.25,
emissive: 0x3b2a00,
emissiveIntensity: 0.10,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.14, 20), mat);
  base.position.y = 0.07;
  g.add(base);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.30, 0.55, 20), mat);
  body.position.y = 0.14 + 0.275;
  g.add(body);

  
  const crownRing = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.24, 0.10, 18), gold);
  crownRing.position.y = 0.14 + 0.55 + 0.05;
  g.add(crownRing);

  
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.10, 10);
  for (let i = 0; i < 6; i++) {
const a = (i / 6) * Math.PI * 2;
const sp = new THREE.Mesh(spikeGeo, gold);
sp.position.set(Math.cos(a) * 0.22, 0.14 + 0.55 + 0.10, Math.sin(a) * 0.22);
sp.rotation.x = Math.PI;
g.add(sp);
  }

  
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 16), gold);
  ball.position.y = 0.14 + 0.55 + 0.18 + 0.10;
  g.add(ball);

  const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), gold);
  v.position.y = 0.14 + 0.55 + 0.18 + 0.22;
  g.add(v);

  const h = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, 0.06), gold);
  h.position.y = 0.14 + 0.55 + 0.18 + 0.22 + 0.03;
  g.add(h);

  return g;
}

  function hashBoard() {
    let h = 2166136261 | 0;
    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        const v = Game.board[r][c] | 0;
        h ^= (v + 31) | 0;
        h = Math.imul(h, 16777619) | 0;
      }
    }
    try {
      const sel = (window.Input && Input.selected != null) ? (Input.selected | 0) : -1;
      h ^= (sel + 131) | 0;
      h = Math.imul(h, 16777619) | 0;
    } catch { }
    try {
      const hc = (window.Visual && typeof Visual.getHighlightCells === "function") ? Visual.getHighlightCells() : [];
      if (hc && hc.length) {
        for (const [rr, cc] of hc) {
          h ^= ((rr * 31 + cc) + 503) | 0;
          h = Math.imul(h, 16777619) | 0;
        }
      }
    } catch { }
    return h;
  }

  function syncPieces() {
    updateMetrics();
    clearObj3D(piecesGroup);

    
    
    const scale = Math.max(1, M.unit * 0.82);
    const lift = Math.max(1.0, M.unit * 0.010);

    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        const v = Game.board[r][c];
        if (!v) continue;

        const [vr, vc] = toViewRC(r, c);
        const p = vrcToPos(vr, vc);

        const isWhite = pieceOwner(v) === BOT;
        const isKing = Math.abs(v) === 2;

        const mesh = isKing ? makeKing(isWhite) : makePawn(isWhite);
        try {
          mesh.traverse((o) => {
            if (o && o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = false;
            }
          });
        } catch { }

        mesh.scale.setScalar(scale);
        mesh.position.set(p.x, lift, p.z);
        piecesGroup.add(mesh);
      }
    }
  }

  function syncHighlights() {
    updateMetrics();
    clearObj3D(hiGroup);

    const hi = (window.Visual && typeof Visual.getHighlightCells === "function") ? Visual.getHighlightCells() : [];
    if (!hi || !hi.length) return;

    const unit = M.unit;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.35,
      roughness: 0.6,
      metalness: 0.0,
    });

    const ringR = Math.max(10, unit * 0.25);
    const tube = Math.max(2.6, unit * 0.04);
    const geo = new THREE.TorusGeometry(ringR, tube, 12, 26);

    const y = Math.max(1.2, unit * 0.012);

    for (const [r, c] of hi) {
      const [vr, vc] = toViewRC(r, c);
      const p = vrcToPos(vr, vc);

      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, y, p.z);
      hiGroup.add(ring);
    }
  }

  function syncIfNeeded() {
    if (!enabled || !inited || suspended) return;
    if (Game && (((Game._simDepth || 0) > 0) || Game._souflaApplying)) return;
    const h = hashBoard();
    if (h === lastHash) return;
    lastHash = h;
    syncPieces();
    syncHighlights();
    render();
  }

  function setSuspended(v) {
    suspended = !!v;
    if (!suspended) {
      lastHash = null;
      syncIfNeeded();
    }
  }

  function invalidate() {
    lastHash = null;
    syncIfNeeded();
  }

  function render() {
    if (!enabled || !renderer || !scene || !camera) return;
    renderer.render(scene, camera);
  }

  function animate() {
    if (!enabled) return;
    syncIfNeeded();
    requestAnimationFrame(animate);
  }

  function onClick3D(ev) {
    if (!enabled) return;
    if (!renderer || !camera || !raycaster) return;
    updateMetrics();

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    mouse.set(x, y);
    raycaster.setFromCamera(mouse, camera);

    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(plane, hit);
    if (!ok) return;

    const cx = hit.x + M.halfW;
    const cz = hit.z + M.halfH;

    const cView = Math.floor(cx / M.stepX);
    const rView = Math.floor(cz / M.stepY);
    if (rView < 0 || rView >= BOARD_N || cView < 0 || cView >= BOARD_N) return;

    
    const cv = qs("#board");
    if (!cv) return;
    const cvRect = cv.getBoundingClientRect();

    const xCanvas = cView * M.stepX + M.stepX / 2;
    const yCanvas = rView * M.stepY + M.stepY / 2;

    const clientX = cvRect.left + xCanvas * (cvRect.width / cv.width);
    const clientY = cvRect.top + yCanvas * (cvRect.height / cv.height);

    try {
      Input.onBoardClick({ clientX, clientY });
    } catch {
      try {
        cv.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY }));
      } catch { }
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) {
      try { renderer?.domElement?.removeEventListener("click", onClick3D); } catch { }
      return;
    }
    if (!init()) return;
    enabled = true;
    animate();
  }

  function show() {
    ensureDom();
    if (wrap) wrap.style.display = "block";
  }

  function hide() {
    ensureDom();
    if (wrap) wrap.style.display = "none";
  }

  return {
    enable() { setEnabled(true); },
    disable() { setEnabled(false); },
    show,
    hide,
    resize,
    render,
    syncIfNeeded,
    setSuspended,
    invalidate,
    get enabled() { return enabled; },
    get ready() { return !!(inited && renderer && scene && camera); },
  };
})();


function ensure3DInputBridge() {
  const wrap = document.querySelector(".board-wrap");
  if (!wrap || wrap.__zamat3dBridgeInstalled) return;
  wrap.__zamat3dBridgeInstalled = true;

  const forward = (ev) => {
    try {
      if (!Game || !Game.settings || Game.settings.boardStyle !== "3d") return;
      
      if (ev && ev.target && ev.target.id === "board") return;

      
      Input.onBoardClick({ clientX: ev.clientX, clientY: ev.clientY });
    } catch {}
  };

  
  wrap.addEventListener("click", forward, true);
}


function applyBoardStyle(style) {
  const cv = qs("#board");
  const w3 = qs("#board3d");

  const v = (style === "3d") ? "3d" : "2d";
  Game.settings.boardStyle = v;

  if (v === "3d") {
    if (!window.THREE) {
      try { popup(t("errors.render3d.loadFail")); } catch {}
      Game.settings.boardStyle = "2d";
    }
  }

  const finalStyle = Game.settings.boardStyle;

  try { document.body && document.body.classList.toggle("board-3d", finalStyle === "3d"); } catch {}

  if (finalStyle === "3d") {
    try { ensure3DInputBridge(); } catch {}
    if (w3) w3.style.display = "block";
    if (cv) {
      cv.style.opacity = "1";
      cv.style.pointerEvents = "auto";
      
      cv.style.background = "transparent";
      cv.style.backgroundColor = "transparent";
    }
    try { Board3D.show(); Board3D.enable(); } catch {}
    
    setTimeout(() => {
      try {
        if (Game.settings.boardStyle === "3d" && !Board3D.ready) {
          try { popup(t("errors.render3d.initFail")); } catch {}
          applyBoardStyle("2d");
        }
      } catch {}
    }, 250);
  } else {
    try { Board3D.disable(); Board3D.hide(); } catch {}
    if (w3) w3.style.display = "none";
    if (cv) {
      cv.style.opacity = "";
      cv.style.pointerEvents = "";
      cv.style.background = "";
      cv.style.backgroundColor = "";
    }
  }
  
  try { Visual.draw(); } catch {}

}




function bindEndKillShortcut() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.repeat) return;

    const ae = document.activeElement;
    const tag = ae && ae.tagName ? ae.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || (ae && ae.isContentEditable)) return;

    const backdrop = qs("#modalBackdrop");
    if (backdrop && backdrop.style && backdrop.style.display === "flex") return;

    const btn = qs("#btnEndKill");
    if (btn && !btn.disabled && Game && Game.inChain) {
      btn.click();
      e.preventDefault();
    }
  });
}


function init() {
  initI18n();
  loadSessionSettings();

  try {
    const isOnline = !!(window.Online && window.Online.isActive);
    if (!isOnline) {
      if (typeof AI !== "undefined" && AI && typeof AI.prefetchOnce === "function") {
        AI.prefetchOnce();
      }
      if (typeof HumanModel !== "undefined" && HumanModel && typeof HumanModel.prefetchOnce === "function") {
        HumanModel.prefetchOnce();
      }
    }
  } catch {}
  applyTheme(Game.settings.theme || AppPref.getTheme());
  bindUI();
  bindEndKillShortcut();

  let restored = false;
  try { restored = !!SessionGame.restore(); } catch { restored = false; }
  if (!restored) {
    setupInitialBoard();
    try { SessionGame.saveNow(); } catch {}
  }
  try { ensure3DInputBridge(); } catch {}

  
  try { applyBoardStyle(Game.settings.boardStyle || "2d"); } catch {}


  try {
    if (window.Online && typeof Online.initPresence === "function") {
      Online.initPresence();
    }
    if (window.Online && typeof Online.initInvitesPassive === "function") {
      Online.initInvitesPassive();
    }
  } catch {}

  Visual.draw();
  Turn.start();
  scheduleForcedOpeningAutoIfNeeded();

  if (
    !Game.gameOver &&
    Game.player === aiSide() &&
    !(Game.forcedEnabled && Game.forcedPly < 10)
  ) {
    AI.scheduleMove();
  }
}


function syncResponsiveLayout() {
  const header = document.getElementById("mobileHeader");
  const side = document.querySelector(".side");
  const title = document.querySelector(".game-title");
  const statusRow = document.querySelector(".status-row");
  if (!header || !side || !title || !statusRow) return;

  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  if (isMobile) {
    if (title.parentElement !== header) header.appendChild(title);
    if (statusRow.parentElement !== header) header.appendChild(statusRow);
  } else {
    if (title.parentElement !== side) side.insertBefore(title, side.firstChild);
    if (statusRow.parentElement !== side) side.insertBefore(statusRow, title.nextSibling);
  }
}

window.addEventListener("resize", syncResponsiveLayout);

window.addEventListener("load", () => {
  syncResponsiveLayout();
  init();
});


document.addEventListener("DOMContentLoaded", function(){
  try{
    var b = document.getElementById("btnOnline");
    if (b && !b._z_patch1) {
      b._z_patch1 = true;
      b.addEventListener("click", function(e){
        e.preventDefault();
        location.href = "pages/loby.html";
      });
    }
  }catch(e){}
});
