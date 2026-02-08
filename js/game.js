/* Section: js/game.js — JavaScript module */



const BOARD_N = 9;
const TOP = +1;
const BOT = -1;

function isOnlineFlippedView() {
  return !!(
    window.Online &&
    window.Online.isActive &&
    window.Online.mySide === TOP
  );
}

function toViewRC(r, c) {
  if (!isOnlineFlippedView()) return [r, c];
  return [BOARD_N - 1 - r, BOARD_N - 1 - c];
}

function fromViewRC(r, c) {
  if (!isOnlineFlippedView()) return [r, c];
  return [BOARD_N - 1 - r, BOARD_N - 1 - c];
}

const MAN = 1;
const KING = 2;

const N_CELLS = BOARD_N * BOARD_N;
const ACTION_ENDCHAIN = N_CELLS * N_CELLS;
const N_ACTIONS = ACTION_ENDCHAIN + 1;

const AUTO_MODEL_ID = "auto_model";
const HUMAN_MODEL_ID = "human_model";





const APP_BASE_PATH = (() => {
  try {
    let p = (window && window.location && window.location.pathname) ? String(window.location.pathname) : "/";
    p = p.replace(/[?#].*$/, "");
    let dir = p.substring(0, p.lastIndexOf("/") + 1);
    dir = dir.replace(/\/pages\/$/, "/");
    return dir || "/";
  } catch {
    return "/";
  }
})();

function assetUrl(rel) {
  const r = String(rel || "").replace(/^\/+/, "");
  const base = String(APP_BASE_PATH || "/");
  if (!r) return base;
  if (base.endsWith("/")) return base + r;
  return base + "/" + r;
}


const ONNX_MODEL_PATH = assetUrl("assets/models/auto_model.onnx");
const ONNX_MODEL_PATH_LEGACY = assetUrl("assets/models/auto-model.onnx");
const HUMAN_WEIGHT = 7.5;
const FO_TOP = [
  [
    [3, 5],
    [4, 4],
  ],
  [
    [5, 3],
    [3, 5],
  ],
  [
    [2, 6],
    [4, 4],
  ],
  [
    [4, 8],
    [2, 6],
  ],
  [
    [1, 7],
    [3, 5],
  ],
  [
    [4, 6],
    [2, 6],
  ],
  [
    [4, 4],
    [4, 6],
    [4, 8],
  ],
  [
    [2, 6],
    [4, 4],
  ],
  [
    [4, 3],
    [4, 5],
  ],
  [
    [5, 5],
    [3, 5],
  ],
];
const FO_BOT = [
  [
    [5, 3],
    [4, 4],
  ],
  [
    [3, 5],
    [5, 3],
  ],
  [
    [6, 2],
    [4, 4],
  ],
  [
    [4, 0],
    [6, 2],
  ],
  [
    [7, 1],
    [5, 3],
  ],
  [
    [4, 2],
    [6, 2],
  ],
  [
    [4, 4],
    [4, 2],
    [4, 0],
  ],
  [
    [6, 2],
    [4, 4],
  ],
  [
    [4, 5],
    [4, 3],
  ],
  [
    [3, 3],
    [5, 3],
  ],
];

const DIAG_A_SEGMENTS = [
  [
    [0, 2],
    [2, 0],
  ],
  [
    [0, 4],
    [4, 0],
  ],
  [
    [0, 6],
    [6, 0],
  ],
  [
    [0, 8],
    [8, 0],
  ],
  [
    [2, 8],
    [8, 2],
  ],
  [
    [4, 8],
    [8, 4],
  ],
  [
    [6, 8],
    [8, 6],
  ],
];
const DIAG_B_SEGMENTS = [
  [
    [0, 6],
    [2, 8],
  ],
  [
    [0, 4],
    [4, 8],
  ],
  [
    [0, 2],
    [6, 8],
  ],
  [
    [0, 0],
    [8, 8],
  ],
  [
    [2, 0],
    [8, 6],
  ],
  [
    [4, 0],
    [8, 4],
  ],
  [
    [6, 0],
    [8, 2],
  ],
];

function rcToIdx(r, c) {
  return r * BOARD_N + c;
}
function idxToRC(idx) {
  return [Math.floor(idx / BOARD_N), idx % BOARD_N];
}
function inside(r, c) {
  return r >= 0 && r < BOARD_N && c >= 0 && c < BOARD_N;
}



function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function buildSegments(segList, dir) {
  const lines = [];
  for (const [a, b] of segList) {
    const [r0, c0] = a,
      [r1, c1] = b;
    const dr = 1,
      dc = dir === "A" ? -1 : +1;
    const line = [];
    let r = r0,
      c = c0;
    while (true) {
      line.push([r, c]);
      if (r === r1 && c === c1) break;
      r += dr;
      c += dc;
    }
    lines.push(line);
  }
  return lines;
}
const DIAG_A_LINES = buildSegments(DIAG_A_SEGMENTS, "A");
const DIAG_B_LINES = buildSegments(DIAG_B_SEGMENTS, "B");

const IS_IN_DIAG_A = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
const IS_IN_DIAG_B = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
for (const line of DIAG_A_LINES) {
  for (const [r, c] of line) {
    IS_IN_DIAG_A[r][c] = true;
  }
}
for (const line of DIAG_B_LINES) {
  for (const [r, c] of line) {
    IS_IN_DIAG_B[r][c] = true;
  }
}
const IS_WIDE = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
for (let r = 0; r < BOARD_N; r++) {
  for (let c = 0; c < BOARD_N; c++) {
    IS_WIDE[r][c] = IS_IN_DIAG_A[r][c] || IS_IN_DIAG_B[r][c];
  }
}

const MASK_BACK_TOP = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
const MASK_BACK_BOT = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
const MASK_CORNERS = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
const MASK_EYES = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
const MASK_MIDBACK = new Array(BOARD_N)
  .fill(0)
  .map(() => new Array(BOARD_N).fill(false));
for (let c = 0; c < BOARD_N; c++) {
  MASK_BACK_TOP[0][c] = true;
  MASK_BACK_BOT[8][c] = true;
}
for (const [r, c] of [
  [0, 0],
  [0, 8],
  [8, 0],
  [8, 8],
])
  MASK_CORNERS[r][c] = true;
for (const [r, c] of [
  [0, 2],
  [0, 6],
  [8, 2],
  [8, 6],
])
  MASK_EYES[r][c] = true;
for (const [r, c] of [
  [0, 4],
  [8, 4],
])
  MASK_MIDBACK[r][c] = true;

const DIRS_ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIRS_DIAG_A = [
  [-1, 1],
  [1, -1],
];
const DIRS_DIAG_B = [
  [-1, -1],
  [1, 1],
];

function isDirAllowedFrom(r, c, dr, dc) {
  if (DIRS_ORTHO.some(([rr, cc]) => rr === dr && cc === dc)) return true;
  if (
    DIRS_DIAG_A.some(([rr, cc]) => rr === dr && cc === dc) &&
    IS_IN_DIAG_A[r][c]
  )
    return true;
  if (
    DIRS_DIAG_B.some(([rr, cc]) => rr === dr && cc === dc) &&
    IS_IN_DIAG_B[r][c]
  )
    return true;
  return false;
}





const Game = {
  board: new Array(BOARD_N).fill(0).map(() => new Array(BOARD_N).fill(0)),
  player: TOP,
  inChain: false,
  chainPos: null,
  lastMovedTo: null,
  moveCount: 0,
  gameOver: false,
  winner: null,
  terminationReason: null,
      forcedEnabled: true,
  forcedPly: 0,
  forcedSeq: null,

  awaitingPenalty: false,
        _souflaApplying: false,
  _simDepth: 0,
souflaPending: null,
  availableSouflaForHuman: null,

  history: [],
  lastTurnSnapshot: null,
  lastMovedFrom: null,
  lastMoveFrom: null,
  lastMovePath: null,
  lastMoveSide: null,
  lastMoveWasCapture: false,

  settings: {
    starter: "white",
    aiCaptureMode: "mandatory",
    aiRandomIgnoreCaptureRatePct: 12,
    theme: "light",
    longFx: true,
    showCoords: false,
    boardStyle: "2d",

    advanced: {
      thinkTimeMs: 250,
      timeBoostCriticalMs: 250,

      w_onnx: 0,
      w_human: 10,

      w_heur: 0,

      w_minimax: 0,
      minimaxDepth: 3,

      w_mcts: 0,
      mctsSimulations: 200,

      w_mauritanian: 0,

      w_mauri_attackLine: 1,
      w_mauri_defenseLine: 1,
      w_mauri_backRow: 1,
      w_mauri_columnSpace: 1,
      w_mauri_tactics: 1,
      w_mauri_kingsPromotion: 1,
    },

  },

  names: {
    top: "",
    bot: "",
  },
  humanLogger: {
    moves: [],
    result: null,
  },
  killTimer: {
    running: false,
    startTs: 0,
    elapsedMs: 0,
    interval: null,
    reset() {
      this.stop();
      this.elapsedMs = 0;
      UI.updateKillClock(0);
    },
    start() {
      if (this.running) return;
      this.running = true;
      this.startTs = performance.now();
      this.interval = setInterval(() => {
        const ms = this.elapsedMs + (performance.now() - this.startTs);
        UI.updateKillClock(ms | 0);
      }, 200);
    },
    stop() {
      if (!this.running) return;
      clearInterval(this.interval);
      this.interval = null;
      this.elapsedMs += performance.now() - this.startTs;
      this.running = false;
    },
    hardStop() {
      this.stop();
      this.elapsedMs = 0;
      UI.updateKillClock(0);
    },
  },

  playerData: {
    policy: new Map(),
  },

  ai: {
    session: null,
    ready: false,
    failed: false,
    deferredPromotion: null,
  },
};


Game.normalizeAdvancedSettings = function() {
  const defaults = {
    thinkTimeMs: 250,
    timeBoostCriticalMs: 250,

    aiRandomIgnoreCaptureRatePct: 12,

    w_onnx: 0,
    w_human: 10,
    w_heur: 0,
    w_minimax: 0,
    minimaxDepth: 3,
    w_mcts: 0,
    mctsSimulations: 200,
    w_mauritanian: 0,

    
    w_mauri_attackLine: 1,
    w_mauri_defenseLine: 1,
    w_mauri_backRow: 1,
    w_mauri_columnSpace: 1,
    w_mauri_tactics: 1,
    w_mauri_kingsPromotion: 1,

  };

  const src = Game.settings.advanced || {};
  const out = Object.assign({}, defaults, src);

  const ttRaw = Number(out.thinkTimeMs);
  out.thinkTimeMs = ttRaw === 0 ? 0 : clampInt(out.thinkTimeMs, 50, 5000, defaults.thinkTimeMs);

  const boostRaw = Number(out.timeBoostCriticalMs);
  out.timeBoostCriticalMs = boostRaw === 0 ? 0 : clampInt(out.timeBoostCriticalMs, 0, 5000, defaults.timeBoostCriticalMs);
  out.w_onnx = clampInt(out.w_onnx, 0, 10, defaults.w_onnx);
  out.w_human = clampInt(out.w_human, 0, 10, defaults.w_human);
  out.w_heur = clampInt(out.w_heur, 0, 10, defaults.w_heur);
  out.w_minimax = clampInt(out.w_minimax, 0, 10, defaults.w_minimax);
  out.w_mcts = clampInt(out.w_mcts, 0, 10, defaults.w_mcts);
  out.w_mauritanian = clampInt(out.w_mauritanian, 0, 10, defaults.w_mauritanian);

  out.w_mauri_attackLine = clampInt(out.w_mauri_attackLine, 0, 10, defaults.w_mauri_attackLine);
  out.w_mauri_defenseLine = clampInt(out.w_mauri_defenseLine, 0, 10, defaults.w_mauri_defenseLine);
  out.w_mauri_backRow = clampInt(out.w_mauri_backRow, 0, 10, defaults.w_mauri_backRow);
  out.w_mauri_columnSpace = clampInt(out.w_mauri_columnSpace, 0, 10, defaults.w_mauri_columnSpace);
  out.w_mauri_tactics = clampInt(out.w_mauri_tactics, 0, 10, defaults.w_mauri_tactics);
  out.w_mauri_kingsPromotion = clampInt(out.w_mauri_kingsPromotion, 0, 10, defaults.w_mauri_kingsPromotion);

  out.minimaxDepth = clampInt(out.minimaxDepth, 1, 10, defaults.minimaxDepth);
  out.mctsSimulations = clampInt(out.mctsSimulations, 10, 5000, defaults.mctsSimulations);

  const sumWeights =
    out.w_onnx + out.w_human + out.w_heur + out.w_minimax + out.w_mcts + out.w_mauritanian;

  if (sumWeights <= 0) {
    const last = Game.settings._lastValidAdvanced;
    if (last) {
      try {
        popup(
          t("dame.advanced.requireOne")
        );
      } catch { }
      Game.settings.advanced = Object.assign({}, last);
      return;
    }
    Object.assign(out, defaults);
  }

  delete out.activeTab;
  delete out.models;
  delete out.algo;
  delete out.hybrid;

  Game.settings.advanced = out;
  Game.settings._lastValidAdvanced = Object.assign({}, out);

  
  const bs = (Game.settings && Game.settings.boardStyle) || "2d";
  Game.settings.boardStyle = (bs === "3d" || bs === "2d") ? bs : "2d";
try { saveSessionSettings(); } catch {}
};


function setupInitialBoard() {

  
  try { Visual.clearSouflaFX && Visual.clearSouflaFX(); } catch {}
  try { Visual.setUndoMove && Visual.setUndoMove(null, null); } catch {}
  try { Visual.setHintPath && Visual.setHintPath(null, null); } catch {}
  try { Visual.setLastMovePath && Visual.setLastMovePath(null, null); } catch {}
  try { Visual.setLastMove && Visual.setLastMove(null, null); } catch {}
  try { Visual.clearCapturedOrder && Visual.clearCapturedOrder(); } catch {}


  const b = Game.board;
  for (let r = 0; r < BOARD_N; r++)
    for (let c = 0; c < BOARD_N; c++) b[r][c] = 0;
  for (let r = 0; r <= 3; r++)
    for (let c = 0; c < BOARD_N; c++) b[r][c] = MAN * TOP;
  for (let c = 0; c <= 3; c++) b[4][c] = MAN * TOP;
  b[4][4] = 0;
  for (let c = 5; c < BOARD_N; c++) b[4][c] = MAN * BOT;
  for (let r = 5; r < BOARD_N; r++)
    for (let c = 0; c < BOARD_N; c++) b[r][c] = MAN * BOT;

  Game.player = Game.settings.starter === "white" ? BOT : TOP;

  Game.inChain = false;
  Game.chainPos = null;
  Game.lastMovedTo = null;
  Game.lastMovedFrom = null;
  Game.lastMoveFrom = null;
  Game.lastMovePath = null;
  Game.lastMoveSide = null;
  Game.lastMoveWasCapture = false;
  try { if (Visual.clearPrevMove) Visual.clearPrevMove(); } catch {}
  Game.moveCount = 0;

  Game.gameOver = false;
  Game.winner = null;
  Game.awaitingPenalty = false;
  Game.souflaPending = null;
  Game.terminationReason = null;
  Game.forcedEnabled = true;
  Game.forcedPly = 0;
  Game.forcedSeq = Game.player === TOP ? FO_TOP : FO_BOT;
  Game.history = [];
  Game.lastTurnSnapshot = null;
  Game.killTimer.hardStop();
  try { TrainRecorder.startNewGame(); } catch {}

  UI.logAIState(
    t("log.forced.openingStarted")
  );
  UI.updateAll();
}

function handleForcedOpeningOver({ showModal = false } = {}) {
  UI.log(
    t("log.forced.openingEnded")
  );

  if (showModal) {
    Modal.open({
      title: t("modals.forcedOpeningOver.title"),
      body: `<div>${t("modals.forcedOpeningOver.body")
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
}

function pieceOwner(v) {
  return v > 0 ? TOP : v < 0 ? BOT : 0;
}
function pieceKind(v) {
  return v === 0 ? 0 : Math.abs(v) === 2 ? KING : MAN;
}
function forwardDir(side) {
  return side === TOP ? +1 : -1;
}

function isBackRank(idx, forSide) {
  const [r, _c] = idxToRC(idx);
  return (r === 0 && forSide === BOT) || (r === 8 && forSide === TOP);
}

function encodeState() {
  const planes = [];
  for (let k = 0; k < 12; k++) {
    planes.push(new Float32Array(BOARD_N * BOARD_N).fill(0));
  }
  const cur = Game.player;
  for (let r = 0; r < BOARD_N; r++) {
    for (let c = 0; c < BOARD_N; c++) {
      const v = Game.board[r][c];
      if (!v) continue;
      const owner = pieceOwner(v);
      const kind = pieceKind(v);
      const idx = r * BOARD_N + c;
      if (owner === cur) {
        planes[kind === MAN ? 0 : 1][idx] = 1;
      } else {
        planes[kind === MAN ? 2 : 3][idx] = 1;
      }
    }
  }
  if (Game.inChain && Game.chainPos != null) {
    planes[4][Game.chainPos] = 1;
  }
  const pv = cur === TOP ? 1 : 0;
  planes[5].fill(pv);

  for (let r = 0; r < BOARD_N; r++) {
    for (let c = 0; c < BOARD_N; c++) {
      const i = r * BOARD_N + c;
      if (IS_WIDE[r][c]) planes[6][i] = 1;
      if (MASK_BACK_TOP[r][c]) planes[7][i] = 1;
      if (MASK_BACK_BOT[r][c]) planes[8][i] = 1;
      if (MASK_CORNERS[r][c]) planes[9][i] = 1;
      if (MASK_EYES[r][c]) planes[10][i] = 1;
      if (MASK_MIDBACK[r][c]) planes[11][i] = 1;
    }
  }
  return new ort.Tensor("float32", concatPlanes(planes), [1, 12, 9, 9]);
}
function concatPlanes(planes) {
  const out = new Float32Array(12 * BOARD_N * BOARD_N);
  let o = 0;
  for (const p of planes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function encodeAction(frIdx, toIdx) {
  return frIdx * N_CELLS + toIdx;
}


function generateStepsFrom(fromIdx, v) {
  const res = [];
  const [r, c] = idxToRC(fromIdx);
  const kind = pieceKind(v);
  if (kind === MAN) {
    const dir = forwardDir(pieceOwner(v));
    const r2 = r + dir,
      c2 = c;
    if (inside(r2, c2) && Game.board[r2][c2] === 0)
      res.push(rcToIdx(r2, c2));
    if (IS_WIDE[r][c]) {
      for (const dc of [1, -1]) {
        const rr = r + dir,
          cc = c + dc;
        if (!inside(rr, cc) || Game.board[rr][cc] !== 0) continue;
        if (
          (IS_IN_DIAG_A[r][c] && IS_IN_DIAG_A[rr][cc]) ||
          (IS_IN_DIAG_B[r][c] && IS_IN_DIAG_B[rr][cc])
        ) {
          res.push(rcToIdx(rr, cc));
        }
      }
    }
  } else {
    const dirs = [
      ...DIRS_ORTHO,
      ...(IS_IN_DIAG_A[r][c] ? DIRS_DIAG_A : []),
      ...(IS_IN_DIAG_B[r][c] ? DIRS_DIAG_B : []),
    ];
    for (const [dr, dc] of dirs) {
      let rr = r + dr,
        cc = c + dc;
      while (inside(rr, cc)) {
        if (!isDirAllowedFrom(rr - dr, cc - dc, dr, dc)) break;
        if (Game.board[rr][cc] !== 0) break;
        res.push(rcToIdx(rr, cc));
        rr += dr;
        cc += dc;
      }
    }
  }
  return res;
}

function generateCapturesFrom(fromIdx, v) {
  const out = [];
  const [r, c] = idxToRC(fromIdx);
  const kind = pieceKind(v);
  if (kind === MAN) {
    const dirs = [
      ...DIRS_ORTHO,
      ...(IS_IN_DIAG_A[r][c] ? DIRS_DIAG_A : []),
      ...(IS_IN_DIAG_B[r][c] ? DIRS_DIAG_B : []),
    ];
    for (const [dr, dc] of dirs) {
      const r1 = r + dr,
        c1 = c + dc;
      const r2 = r + 2 * dr,
        c2 = c + 2 * dc;
      if (!inside(r1, c1) || !inside(r2, c2)) continue;
      if (!isDirAllowedFrom(r, c, dr, dc)) continue;
      const mid = Game.board[r1][c1];
      if (
        mid !== 0 &&
        pieceOwner(mid) !== pieceOwner(v) &&
        Game.board[r2][c2] === 0
      ) {
        out.push([rcToIdx(r2, c2), rcToIdx(r1, c1)]);
      }
    }
  } else {
    const dirs = [
      ...DIRS_ORTHO,
      ...(IS_IN_DIAG_A[r][c] ? DIRS_DIAG_A : []),
      ...(IS_IN_DIAG_B[r][c] ? DIRS_DIAG_B : []),
    ];
    for (const [dr, dc] of dirs) {
      let rr = r + dr,
        cc = c + dc;
      let seenEnemy = false,
        enemyIdx = null;
      while (inside(rr, cc)) {
        if (!isDirAllowedFrom(rr - dr, cc - dc, dr, dc)) break;
        const v2 = Game.board[rr][cc];
        if (v2 === 0) {
          if (seenEnemy) {
            out.push([rcToIdx(rr, cc), enemyIdx]);
          }
          rr += dr;
          cc += dc;
          continue;
        }
        if (pieceOwner(v2) === pieceOwner(v)) break;
        if (seenEnemy) break;
        seenEnemy = true;
        enemyIdx = rcToIdx(rr, cc);
        rr += dr;
        cc += dc;
      }
    }
  }
  return out;
}

function maxCaptureLenFrom(fromIdx) {
  const [r, c] = idxToRC(fromIdx);
  const v = Game.board[r][c];
  if (!v) return 0;

  let best = 0;
  const moves = generateCapturesFrom(fromIdx, v);

  for (const [toIdx, jumped] of moves) {
    const [jr, jc] = idxToRC(jumped);
    const [r2, c2] = idxToRC(toIdx);

    const keep = cloneBoard(Game.board);

    Game.board[r][c] = 0;
    Game.board[jr][jc] = 0;

    const owner = pieceOwner(v);
    const reachedBack = isBackRank(toIdx, owner);
    const promotedV =
      pieceKind(v) === MAN && reachedBack
        ? owner === TOP
          ? KING
          : -KING
        : v;

    Game.board[r2][c2] = v;

    const next = maxCaptureLenFrom(toIdx);
    best = Math.max(best, 1 + next);

    Game.board = keep;
  }

  return best;
}



function simEnter() {
  try { Game._simDepth = (Game._simDepth || 0) + 1; } catch { }
}
function simExit() {
  try { Game._simDepth = Math.max(0, (Game._simDepth || 0) - 1); } catch { }
}

function computeLongestForPlayer(side) {
  simEnter();
  try {
  const longestByPiece = new Map();
  let Lmax = 0;
  for (let idx = 0; idx < N_CELLS; idx++) {
    const [r, c] = idxToRC(idx);
    const v = Game.board[r][c];
    if (!v || pieceOwner(v) !== side) continue;
    const L = maxCaptureLenFrom(idx);
    if (L > 0) {
      longestByPiece.set(idx, L);
      if (L > Lmax) Lmax = L;
    }
  }
  const candidates = [];
  for (const [idx, L] of longestByPiece) {
    if (L === Lmax) candidates.push(idx);
  }
  return { longestByPiece, Lmax, candidates };
      } finally { simExit(); }
}

function cloneBoard(b) {
  const out = new Array(BOARD_N)
    .fill(0)
    .map(() => new Array(BOARD_N).fill(0));
  for (let r = 0; r < BOARD_N; r++)
    for (let c = 0; c < BOARD_N; c++) out[r][c] = b[r][c];
  return out;
}

function legalActions() {
  const mask = new Uint8Array(N_ACTIONS);
  const meta = new Array(N_CELLS * N_CELLS).fill(null);

  if (Game.gameOver) {
    return { mask, meta };
  }

  if (Game.forcedEnabled && Game.forcedPly < 10) {
    const step = Game.forcedSeq[Game.forcedPly];
    const fr0 = rcToIdx(step[0][0], step[0][1]);
    const to1 = rcToIdx(step[1][0], step[1][1]);
    const isChainOpening = step.length > 2;
    const toFinal = isChainOpening
      ? rcToIdx(step[step.length - 1][0], step[step.length - 1][1])
      : to1;

    let fr = fr0;
    let to = to1;

    if (
      isChainOpening &&
      Game.inChain &&
      Game.chainPos != null &&
      Turn.ctx?.startedFrom === fr0
    ) {
      if (Game.chainPos === to1) {
        fr = to1;
        to = toFinal;
      } else if (Game.chainPos === toFinal) {
        mask[ACTION_ENDCHAIN] = 1;
        return { mask, meta };
      }
    }

    const a = encodeAction(fr, to);
    mask[a] = 1;
    meta[a] = [fr, to];
    mask[ACTION_ENDCHAIN] = 0;
    return { mask, meta };
  }

  if (Game.inChain && Game.chainPos != null) {
    const v =
      Game.board[Math.floor(Game.chainPos / BOARD_N)][
      Game.chainPos % BOARD_N
      ];
    const caps = generateCapturesFrom(Game.chainPos, v);
    for (const [toIdx, _jumped] of caps) {
      const a = encodeAction(Game.chainPos, toIdx);
      mask[a] = 1;
      meta[a] = [Game.chainPos, toIdx];
    }
    mask[ACTION_ENDCHAIN] = 1;
    return { mask, meta };
  }

  for (let idx = 0; idx < N_CELLS; idx++) {
    const [r, c] = idxToRC(idx);
    const v = Game.board[r][c];
    if (!v || pieceOwner(v) !== Game.player) continue;
    for (const toIdx of generateStepsFrom(idx, v)) {
      mask[encodeAction(idx, toIdx)] = 1;
      meta[encodeAction(idx, toIdx)] = [idx, toIdx];
    }
    for (const [toIdx, _] of generateCapturesFrom(idx, v)) {
      mask[encodeAction(idx, toIdx)] = 1;
      meta[encodeAction(idx, toIdx)] = [idx, toIdx];
    }
  }
  mask[ACTION_ENDCHAIN] = 0;
  return { mask, meta };
}

function classifyCapture(fromIdx, toIdx) {
  const [r1, c1] = idxToRC(fromIdx);
  const [r2, c2] = idxToRC(toIdx);
  const v = Game.board[r1][c1];
  const kind = pieceKind(v);
  const dr = r2 - r1,
    dc = c2 - c1;
  if (kind === MAN) {
    const stepR = Math.sign(dr),
      stepC = Math.sign(dc);
    if (
      (Math.abs(dr) === 2 && dc === 0) ||
      (dr === 0 && Math.abs(dc) === 2) ||
      (Math.abs(dr) === 2 && Math.abs(dc) === 2)
    ) {
      const midR = r1 + stepR,
        midC = c1 + stepC;
      if (
        inside(midR, midC) &&
        pieceOwner(Game.board[midR][midC]) === -pieceOwner(v) &&
        Game.board[r2][c2] === 0 &&
        isDirAllowedFrom(r1, c1, stepR, stepC)
      ) {
        return [true, rcToIdx(midR, midC)];
      }
    }
    return [false, null];
  } else {
    if (r1 === r2 && c1 === c2) return [false, null];
    const stepR = Math.sign(dr),
      stepC = Math.sign(dc);
    if (stepR === 0 && stepC === 0) return [false, null];
    if (!isDirAllowedFrom(r1, c1, stepR, stepC)) return [false, null];
    let rr = r1 + stepR,
      cc = c1 + stepC;
    let seenEnemy = false,
      enemyIdx = null;
    while (inside(rr, cc)) {
      if (!isDirAllowedFrom(rr - stepR, cc - stepC, stepR, stepC)) break;
      const v2 = Game.board[rr][cc];
      if (v2 === 0) {
        if (seenEnemy && rr === r2 && cc === c2) return [true, enemyIdx];
        rr += stepR;
        cc += stepC;
        continue;
      }
      if (pieceOwner(v2) === pieceOwner(v)) break;
      if (seenEnemy) break;
      seenEnemy = true;
      enemyIdx = rcToIdx(rr, cc);
      rr += stepR;
      cc += stepC;
    }
    return [false, null];
  }
}

function applyMove(fromIdx, toIdx, isCapture, jumpedIdx) {
  pushHistoryBeforeMove(fromIdx, toIdx);

  const [r1, c1] = idxToRC(fromIdx);
  const [r2, c2] = idxToRC(toIdx);
  const v = Game.board[r1][c1];
  Game.board[r1][c1] = 0;
  if (isCapture && jumpedIdx != null) {
    const [jr, jc] = idxToRC(jumpedIdx);
    Game.board[jr][jc] = 0;
    Visual.capturedOrderPush(jumpedIdx);
  }
  Game.board[r2][c2] = v;
  Game.lastMovedFrom = fromIdx;
  Game.lastMovedTo = toIdx;

  if (
    isCapture &&
    typeof Turn !== "undefined" &&
    Turn &&
    Turn.ctx &&
    Turn.ctx.startedFrom != null
  ) {
    Game.lastMoveFrom = Turn.ctx.startedFrom;
    if (!Array.isArray(Game.lastMovePath) || Turn.ctx.capturesDone === 0) {
      Game.lastMovePath = [];
    }
    Game.lastMovePath.push(toIdx);
  } else {
    Game.lastMoveFrom = fromIdx;
    Game.lastMovePath = [toIdx];
  }

  Game.lastMoveSide = Game.player;
  Game.lastMoveWasCapture = !!isCapture;

  try {
    if (
      window.Online &&
      window.Online.isActive &&
      !window.Online._isApplyingRemote
    ) {
      window.Online.recordLocalStep(
        fromIdx,
        toIdx,
        !!isCapture,
        jumpedIdx != null ? jumpedIdx : null
      );
    }
  } catch { }

  
  try { SessionGame.saveSoon(); } catch {}

}

function promoteIfNeeded(idx) {
  const v = valueAt(idx);
  if (!v) return;
  if (pieceKind(v) !== MAN) return;
  const owner = pieceOwner(v);
  if (isBackRank(idx, owner)) {
    setValueAt(idx, owner === TOP ? KING : -KING);
    Visual.queueCrown(idx);
    UI.log(
      t("log.promote", {
        cell: rcStr(idx),
        side: sideLabel(owner),
      })
    );
  }
}

function maybeQueueDeferredPromotion(idx) {
  const v = valueAt(idx);
  if (!v) return;
  if (pieceKind(v) !== MAN) return;
  const owner = pieceOwner(v);
  if (isBackRank(idx, owner)) {
    Game.deferredPromotion = { idx, side: owner };
  }
}

function valueAt(idx) {
  const [r, c] = idxToRC(idx);
  return Game.board[r][c];
}
function setValueAt(idx, v) {
  const [r, c] = idxToRC(idx);
  Game.board[r][c] = v;
}
function rcStr(idx) {
  const [r, c] = idxToRC(idx);
  return `${r}.${c}`;
}

const TurnFX = {
  capturedOrder: [],
  reset() {
    this.capturedOrder.length = 0;
  },
};
Game.souflaSticky = {
  armed: false,
  clearOnHumanEnd: false,
};

function armSouflaFXPersistence() {
  Game.souflaSticky.armed = true;
  Game.souflaSticky.clearOnHumanEnd = true;
}






const Turn = {
  ctx: null,

  start() {
    if (
      Game.deferredPromotion &&
      Game.player === Game.deferredPromotion.side
    ) {
      const { idx, side } = Game.deferredPromotion;
      const v = valueAt(idx);
      if (v && pieceKind(v) === MAN && pieceOwner(v) === side) {
        setValueAt(idx, side === TOP ? KING : -KING);
        Visual.queueCrown(idx);
        UI.log(
          t("log.promote", {
            cell: rcStr(idx),
            side: sideLabel(side),
          })
        );
      }
      Game.deferredPromotion = null;
    }

    const { longestByPiece, Lmax, candidates } = computeLongestForPlayer(
      Game.player
    );

    this.ctx = {
      longestByPiece,
      Lmax,
      candidates,
      startedFrom: null,
      capturesDone: 0,
      snapshot: snapshotState(),
    };
    Visual.clearCapturedOrder();
    Game.killTimer.hardStop();
    UI.updateStatus();
  },

  endIfNoChain() {
    if (!Game.inChain) {
      this.finishTurnAndSoufla();
    }
  },

  beginCapture(fromIdx) {
    if (!this.ctx) this.start();
    if (this.ctx.startedFrom == null) this.ctx.startedFrom = fromIdx;
    if (!Game.killTimer.running && Game.player === humanSide()) {
      Game.killTimer.start();
    }


  },

  recordCapture() {
    if (!this.ctx) {
      this.start();
    }
    this.ctx.capturesDone += 1;
  },

  finishTurnAndSoufla() {
    const endedBy = Game.player;

    if (Game.lastMovedTo != null) {
      if (Game.lastMovedTo != null) {
      try { promoteIfNeeded(Game.lastMovedTo); } catch {}
      Game.deferredPromotion = null;
    }
    }

    const pending = this.computeSouflaPending();
    Game.inChain = false;
    Game.chainPos = null;

    
    try { TrainRecorder.turnEnd({ pending }); } catch {}

    if (pending) {
      if (window.Online?.isActive) {
        try {
          window.Online.cacheSouflaPending(pending);
        } catch { }

        if (pending.penalizer === humanSide()) {
          Game.availableSouflaForHuman = pending;
        } else {
          Game.availableSouflaForHuman = null;
        }
      } else {
        if (pending.penalizer === humanSide()) {
          Game.availableSouflaForHuman = pending;
        } else {
          AI.pickSouflaDecision(pending)
            .then((decision) => {
              applySouflaDecision(decision, pending);
              try { UI.showSouflaAgainstHuman(decision, pending); } catch {}
            })
            .catch((e) => {
              const fallback =
                pending.options.find((o) => o.kind === "remove") ||
                pending.options[0];
              applySouflaDecision(fallback, pending);
              try { UI.showSouflaAgainstHuman(fallback, pending); } catch {}
            });
          return;
        }
      }
    }

    switchPlayer();
    Turn.start();
    scheduleForcedOpeningAutoIfNeeded();
    UI.updateAll();

    if (window.Online && window.Online.isActive) {
      window.Online.sendMoveToFirebase(
        Game.lastMovedFrom,
        Game.lastMovedTo,
        Game.player
      );
    }

    if (endedBy === humanSide()) {
      Visual.clearForcedOpeningArrow();
      if (
        Game.souflaSticky?.armed &&
        Game.souflaSticky?.clearOnHumanEnd
      ) {
        Visual.clearSouflaFX();
        Game.souflaSticky.armed = false;
        Game.souflaSticky.clearOnHumanEnd = false;
      }
    }
  },

  computeSouflaPending() {
    if (!this.ctx) return null;
    const Lmax = this.ctx.Lmax;
    const LB = this.ctx.longestByPiece;
    if (Lmax <= 0) return null;

    const candidates = this.ctx.candidates.slice();
    const sf = this.ctx.startedFrom ?? null;
    const capturesDone = this.ctx.capturesDone | 0;

    const movedFrom = Game.lastMovedFrom != null ? Game.lastMovedFrom : null;

    let offenders = [];

    if (sf == null) {
      
      
      offenders = candidates.slice();
    } else {
      const Ls = LB.get(sf) || 0;
      const offenderSelf = capturesDone < Ls && Ls > 0;
      const offenderOthers = Lmax > 0 && Ls < Lmax;

      if (offenderSelf) offenders.push(sf);
      if (offenderOthers) {
        for (const idx of candidates) {
          if (idx !== sf) offenders.push(idx);
        }
      }
    }

    offenders = Array.from(new Set(offenders));
    if (!offenders.length) return null;

    
    
    const startedFromForPending =
      sf != null
        ? sf
        : (movedFrom != null && offenders.includes(movedFrom) ? movedFrom : null);

    const options = [];
    const keep = snapshotState();

    simEnter();
    try {

      for (const idx of offenders) {
        
        options.push({ kind: "remove", offenderIdx: idx });

        const Ls = LB.get(idx) || 0;
        if (Ls <= 0) continue;

        restoreSnapshotSilent(this.ctx.snapshot);
        const full = longestPathsWithJumpsFrom(idx, Ls);
        restoreSnapshotSilent(keep);

        if (!full || !full.length) continue;

        for (const o of full) {
          options.push({
            kind: "force",
            offenderIdx: idx,
            path: o.path,
            jumps: o.jumps,
          });
        }
      }

      if (!options.length) return null;

      const penalizer = -Game.player;

      return {
        offenders,
        longestByPiece: LB,
        longestGlobal: Lmax,
        options,
        turnStartSnapshot: this.ctx.snapshot,
        lastPieceIdx: Game.lastMovedTo,
        startedFrom: startedFromForPending,
        penalizer,

        lastMoveFrom: Game.lastMoveFrom != null ? Game.lastMoveFrom : null,
        lastMovePath: Array.isArray(Game.lastMovePath) ? Game.lastMovePath.slice() : null,

        capturesDone,
        ctxStartedFrom: sf,
        ctxLs: (sf != null ? (LB.get(sf) || 0) : 0),
      };
    } finally {
      
      try { restoreSnapshotSilent(keep); } catch {}
      simExit();
    }
  },
};

function snapshotState() {
  return {
    board: cloneBoard(Game.board),
    player: Game.player,
    inChain: Game.inChain,
   chainPos: Game.chainPos != null ? Game.chainPos : null,
    lastMovedTo: Game.lastMovedTo,
    lastMovedFrom: Game.lastMovedFrom,
    lastMoveFrom: Game.lastMoveFrom,
    lastMovePath: Array.isArray(Game.lastMovePath)
      ? Game.lastMovePath.slice()
      : null,
    moveCount: Game.moveCount,

    forcedEnabled: Game.forcedEnabled,
    forcedPly: Game.forcedPly,
  };
}

function pushHistoryBeforeMove(fromIdx, toIdx) {
  
  if ((Game._simDepth || 0) > 0) return;
  const snap = snapshotState();
  snap.lastMovedFrom = fromIdx;
  snap.lastMovedTo = toIdx;
  Game.history.push(snap);
      if (Game.history.length > 10) Game.history.splice(0, Game.history.length - 10);
}

function restoreSnapshot(snap, opts) {
  let redraw = true;
  let visual = true;

  if (typeof opts === "boolean") {
redraw = opts;
  } else if (opts && typeof opts === "object") {
if (opts.redraw === false) redraw = false;
if (opts.visual === false) visual = false;
  }

  Game.board = cloneBoard(snap.board);
  Game.player = snap.player;
  Game.inChain = snap.inChain;
  Game.chainPos = snap.chainPos != null ? snap.chainPos : null;
  Game.lastMovedTo = snap.lastMovedTo;
  Game.lastMovedFrom = snap.lastMovedFrom;

  Game.lastMoveFrom =
snap.lastMoveFrom != null ? snap.lastMoveFrom : snap.lastMovedFrom;
  Game.lastMovePath = Array.isArray(snap.lastMovePath)
? snap.lastMovePath.slice()
: snap.lastMovedTo != null
  ? [snap.lastMovedTo]
  : null;

  Game.moveCount = snap.moveCount;

  if (typeof snap.forcedEnabled === "boolean")
Game.forcedEnabled = snap.forcedEnabled;
  if (typeof snap.forcedPly === "number") Game.forcedPly = snap.forcedPly;

  if (visual) {
try {
  if (
    Game.lastMoveFrom != null &&
    Array.isArray(Game.lastMovePath) &&
    Game.lastMovePath.length
  ) {
    Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
  } else {
    Visual.setLastMove(null, null);
  }
} catch { }
try { Visual.clearCapturedOrder(); } catch { }
  }

  if (redraw) {
UI.updateAll();
  }
}

function restoreSnapshotSilent(snap) {
  restoreSnapshot(snap, { redraw: false, visual: false });
}








const SessionGame = (() => {
  const KEY = "zamat.session.game.v1";
  const MAX_KB = 256; 

  let _t = null;

  function _safeNowMs() {
    try { return Date.now(); } catch { return 0; }
  }

  function _getKillMs() {
    try {
      return (
        (Game.killTimer?.elapsedMs || 0) +
        (Game.killTimer?.running ? (performance.now() - (Game.killTimer.startTs || 0)) : 0)
      ) | 0;
    } catch {
      return 0;
    }
  }

  function _capture() {
    const snap = snapshotState();
    const data = {
      v: 1,
      ts: _safeNowMs(),
      snapshot: snap,

      
      gameOver: !!Game.gameOver,
      winner: Game.winner == null ? null : (Game.winner | 0),
      terminationReason: Game.terminationReason == null ? null : String(Game.terminationReason),

      
      forcedSeqKey: Game.forcedSeq === FO_TOP ? "FO_TOP" : (Game.forcedSeq === FO_BOT ? "FO_BOT" : null),

      
      settings: Game.settings,
      history: Array.isArray(Game.history) ? Game.history : [],
      logHtml: (typeof qs === "function" && qs("#log")) ? qs("#log").innerHTML : "",
      killTimerMs: Math.max(0, _getKillMs()),
    };
    return data;
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); } catch {}
  }

  function saveNow() {
    
    if ((Game._simDepth || 0) > 0) return;

    
    if (Game.gameOver) {
      clear();
      return;
    }

    try {
      const data = _capture();
      const raw = JSON.stringify(data);
      if (raw && raw.length / 1024 > MAX_KB) return;
      sessionStorage.setItem(KEY, raw);
    } catch {}
  }

  function saveSoon() {
    try {
      if (_t) return;
      _t = setTimeout(() => {
        _t = null;
        saveNow();
      }, 0);
    } catch {
      
      saveNow();
    }
  }

  function restore() {
    let raw = null;
    try { raw = sessionStorage.getItem(KEY); } catch {}
    if (!raw) return false;

    let data = null;
    try { data = JSON.parse(raw); } catch {
      clear();
      return false;
    }
    if (!data || typeof data !== "object") {
      clear();
      return false;
    }

    
    if (data.gameOver) {
      clear();
      return false;
    }

    const snap = data.snapshot;
    if (!snap || !snap.board || !Array.isArray(snap.board)) {
      clear();
      return false;
    }

    try {
      
      if (data.settings && typeof data.settings === "object") {
        Game.settings = data.settings;
        try { Game.normalizeAdvancedSettings(); } catch {}
      }

      
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

      restoreSnapshot(snap, { redraw: false, visual: true });

      Game.gameOver = false;
      Game.winner = null;
      Game.terminationReason = null;

      Game.history = Array.isArray(data.history) ? data.history : [];

      
      try {
        if (typeof data.logHtml === "string" && typeof qs === "function" && qs("#log")) {
          qs("#log").innerHTML = data.logHtml;
        }
      } catch {}

      try {
        const km = typeof data.killTimerMs === "number" ? data.killTimerMs : 0;
        Game.killTimer.hardStop();
        Game.killTimer.elapsedMs = Math.max(0, km | 0);
        try { UI.updateKillClock(Game.killTimer.elapsedMs | 0); } catch {}
        if (Game.inChain) {
          try { Game.killTimer.start(); } catch {}
        }
        try {
          const btn = (typeof qs === "function") ? qs("#btnEndKill") : null;
          if (btn) btn.disabled = !Game.inChain;
        } catch {}
      } catch {}

      
      try { UI.updateAll(); } catch {}

      return true;
    } catch {
      clear();
      return false;
    }
  }

  return { KEY, saveNow, saveSoon, restore, clear };
})();

try { window.SessionGame = SessionGame; } catch {}

function longestPathsWithJumpsFrom(fromIdx, maxLen) {
  simEnter();
  try {
  const startV = valueAt(fromIdx);
  const owner = pieceOwner(startV);
  const out = [];

  function dfs(curIdx, vCur, depth, path, jumps) {
    if (depth === maxLen) {
      out.push({ path: path.slice(), jumps: jumps.slice() });
      return;
    }
    const moves = generateCapturesFrom(curIdx, vCur);
    for (const [toIdx, jumpedIdx] of moves) {
      const keep = cloneBoard(Game.board);
      const [r1, c1] = idxToRC(curIdx);
      const [r2, c2] = idxToRC(toIdx);
      const [jr, jc] = idxToRC(jumpedIdx);

      Game.board[r1][c1] = 0;
      Game.board[jr][jc] = 0;
      Game.board[r2][c2] = vCur;

      const rem = maxCaptureLenFrom(toIdx);
      if (rem >= maxLen - (depth + 1)) {
        dfs(
          toIdx,
          vCur,
          depth + 1,
          path.concat(toIdx),
          jumps.concat(jumpedIdx)
        );
      }

      Game.board = keep;
    }
  }

  dfs(fromIdx, startV, 0, [], []);
  return out;
  } finally { simExit(); }
}

    

    function applySouflaDecision(decision, pending) {
  if (!decision || !pending) return;

  let _fxRedSegments = null;
  let _fxRemoveIdx = null;
  let _fxForcePath = null;
  let _fxUndoArrow = null;

  try { Visual.clearSouflaFX(true); } catch {}

  
  Game._souflaApplying = true;
  try { Visual.setSuspended(true); } catch {}
  try { Board3D.setSuspended(true); } catch {}
  
  try {
    setTimeout(() => {
      if (Game._souflaApplying) {
        try { Board3D.setSuspended(false); Board3D.invalidate(); } catch {}
        try { Game._souflaApplying = false; Visual.setSuspended(false); } catch {}
        try { UI.updateAll(); } catch {}
      }
    }, 1500);
  } catch {}

  try {
    Game.lastMoveFrom = null;
    Game.lastMovePath = null;
    Game.lastMovedFrom = null;
    Game.lastMovedTo = null;
    Visual.setLastMovePath(null, null);
    Visual.setLastMove(null, null);
  } catch {}

  const redSegments = [];
  try {
    const offIdx = decision.offenderIdx;
    const maxLen =
      pending.longestByPiece && pending.longestByPiece.get
        ? pending.longestByPiece.get(offIdx) || 0
        : 0;
    if (offIdx != null && maxLen > 0 && pending.turnStartSnapshot) {
      const keep = snapshotState();
      simEnter();
      try {
        restoreSnapshotSilent(pending.turnStartSnapshot);
        const full = longestPathsWithJumpsFrom(offIdx, maxLen) || [];
        full.sort((a, b) => {
          const sa = (a.path || []).join(",") + "|" + (a.jumps || []).join(",");
          const sb = (b.path || []).join(",") + "|" + (b.jumps || []).join(",");
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        });
        const chosen = full[0];
        if (chosen && Array.isArray(chosen.path) && chosen.path.length) {
          redSegments.push({
            from: offIdx,
            path: chosen.path.slice(),
            jumps: Array.isArray(chosen.jumps) ? chosen.jumps.slice() : [],
          });
        }
      } finally {
        restoreSnapshotSilent(keep);
        simExit();
      }
    }
  } catch {}
  _fxRedSegments = redSegments;

  let __prevOnlineApplying = null;
  let __hadOnline = false;
  try {
    if (window.Online && window.Online.isActive) {
      __hadOnline = true;
      __prevOnlineApplying = window.Online._isApplyingRemote;
      window.Online._isApplyingRemote = true;
      window.Online.clearPendingLocalMove?.();
    }
  } catch {}

  try {
    if (decision.kind === "remove") {
      const originalIdx = decision.offenderIdx;

      const actualRemoveIdx =
        pending.startedFrom === decision.offenderIdx && pending.lastPieceIdx != null
          ? pending.lastPieceIdx
          : decision.offenderIdx;

      setValueAt(actualRemoveIdx, 0);
      _fxRemoveIdx = originalIdx;

      UI.log(
        t("log.soufla.remove", { cell: rcStr(originalIdx) })
      );

      armSouflaFXPersistence();

      
      try { TrainRecorder.souflaApplied(decision, pending); } catch {}

      if (Game.player !== pending.penalizer) {
        switchPlayer();
      }
    } else if (decision.kind === "force") {
      
      
      try { TrainRecorder.souflaBeginForce(decision, pending); } catch {}
      
      restoreSnapshotSilent(pending.turnStartSnapshot);

      try {
  if (pending.lastMoveFrom != null && Array.isArray(pending.lastMovePath) && pending.lastMovePath.length) {
    const nodes = [pending.lastMoveFrom].concat(pending.lastMovePath).map((n) => Number(n)).filter(Number.isFinite);
    if (nodes.length >= 2) {
      const rev = nodes.slice().reverse(); // end -> ... -> start
      _fxUndoArrow = { from: rev[0], path: rev.slice(1) };
    }
  } else if (pending.startedFrom != null && pending.lastPieceIdx != null) {
    _fxUndoArrow = { from: pending.lastPieceIdx, to: pending.startedFrom };
  }
} catch {}

      try { Turn.start(); } catch {}
      const from = decision.offenderIdx;

      try { Turn.beginCapture(from); } catch {}

      let cur = from;
      const fullPath = [from];

      for (const to of decision.path || []) {
        const prev = cur;
        const [isCap, jumped] = classifyCapture(prev, to);
        if (!isCap || jumped == null) break;
        
        applyMove(prev, to, true, jumped);
        try { Turn.recordCapture(); } catch {}
        cur = to;
        fullPath.push(to);
      }

      try { promoteIfNeeded(cur); } catch {}
      Game.deferredPromotion = null;

      Game.inChain = false;
      Game.chainPos = null;
      try { qs("#btnEndKill").disabled = true; } catch {}

      _fxForcePath = fullPath.slice();

      UI.log(
        t("log.soufla.force", {
          from: rcStr(from),
          path: (decision.path || []).map(rcStr).join("→"),
        })
      );

      armSouflaFXPersistence();

      
      try { TrainRecorder.souflaEndForce(decision, pending); } catch {}

      switchPlayer(); 
    }
  } finally {
    try {
      if (__hadOnline && window.Online) {
        window.Online._isApplyingRemote = __prevOnlineApplying === true;
      }
    } catch {}
  }


  
  
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
try {
  
  Visual.applySouflaFXBatch({
    redSegments: _fxRedSegments,
    removeIdx: _fxRemoveIdx,
    forcePath: _fxForcePath,
    undoArrow: _fxUndoArrow,
  }, { noDraw: true });
} catch { }

try {
  
  Game.awaitingPenalty = false;
  Game.souflaPending = null;
  Game.availableSouflaForHuman = null;
} catch { }

try { Turn.start(); } catch { }
try { scheduleForcedOpeningAutoIfNeeded(); } catch { }
try { UI.updateAll(); } catch { }


try { Board3D.setSuspended(false); Board3D.invalidate(); } catch { }
try { Game._souflaApplying = false; Visual.setSuspended(false); } catch { }


if (
  !Game.awaitingPenalty &&
  !Game.gameOver &&
  Game.player === aiSide() &&
  !(Game.forcedEnabled && Game.forcedPly < 10)
) {
  try { AI.scheduleMove(); } catch { }
}
  });
});
if (window.Online && window.Online.isActive && !window.Online._isApplyingRemote) {
    try {
      window.Online.clearPendingLocalMove?.();
    } catch {}
    try {
      window.Online.sendSouflaDecisionToFirebase(decision, pending, Game.player);
    } catch {}
  }

}

function switchPlayer() {
  try { if (Visual.clearPrevMove) Visual.clearPrevMove(); } catch {}
  try { if (Game.lastMoveWasCapture && Visual.promoteLastMoveToPrev) Visual.promoteLastMoveToPrev(); } catch {}
  Game.player = -Game.player;
  Game.moveCount += 1;
  Visual.clearCapturedOrder();
  Game.killTimer.hardStop();
  checkEndConditions();
  UI.updateStatus();
}

function checkEndConditions() {
  let top = 0,
    bot = 0,
    tKings = 0,
    bKings = 0;
  for (let r = 0; r < BOARD_N; r++) {
    for (let c = 0; c < BOARD_N; c++) {
      const v = Game.board[r][c];
      if (v > 0) {
        top++;
        if (Math.abs(v) === 2) tKings++;
      }
      if (v < 0) {
        bot++;
        if (Math.abs(v) === 2) bKings++;
      }
    }
  }
  try { UI.updateCounts?.({ top, bot, tKings, bKings }); } catch {}

  if (top === 0 || bot === 0) {
    Game.gameOver = true;
    Game.winner = top === 0 ? BOT : TOP;

    
    try { SessionGame.clear(); } catch {}

    try { UI.showGameOverModal?.(Game.winner); } catch {}

    try {
      Promise.resolve(
        TrainRecorder.finalizeAndUpload({ winner: Game.winner, endReason: (Game.winner == null ? "draw" : "natural_win") })
      ).finally(() => {
        try { TrainRecorder.startNewGame(); } catch {}
      });
    } catch {}return;
  }

  if (top === 1 && bot === 1 && tKings === 1 && bKings === 1) {
    Game.gameOver = true;
    Game.winner = null;
    try { SessionGame.clear(); } catch {}
    try { UI.showGameOverModal?.(null); } catch {}
    try {
      Promise.resolve(
        TrainRecorder.finalizeAndUpload({ winner: Game.winner, endReason: (Game.winner == null ? "draw" : "natural_win") })
      ).finally(() => {
        try { TrainRecorder.startNewGame(); } catch {}
      });
    } catch {}}
}

function scheduleForcedOpeningAutoIfNeeded() {
  if (!(Game.forcedEnabled && Game.forcedPly < 10)) return;
  if (Game.gameOver) return;
  Game.awaitingPenalty = false;
  Game.souflaPending = null;
  const step = Game.forcedSeq[Game.forcedPly];
  const fr = rcToIdx(step[0][0], step[0][1]);
  const to = rcToIdx(step[1][0], step[1][1]);
  const isChainOpening = step.length > 2;
  const toFinal = isChainOpening
    ? rcToIdx(step[step.length - 1][0], step[step.length - 1][1])
    : to;

  
  
  
  
  
  
  
  
  const base = (Game.forcedSeq === FO_TOP)
    ? TOP
    : (Game.forcedSeq === FO_BOT)
      ? BOT
      : sideOfColor(Game.settings.starter);
  const mover = (Game.forcedPly % 2 === 0) ? base : -base;

  
  if (Game.player !== mover) return;

  if (mover !== aiSide()) return;
  setTimeout(() => {
    if (isChainOpening) {
      if (!Turn.ctx) Turn.start();
      Turn.beginCapture(fr);

      let cur = fr;
      for (let i = 1; i < step.length; i++) {
        const nxt = rcToIdx(step[i][0], step[i][1]);
        const [isCapStep, jumpedStep] = classifyCapture(cur, nxt);
        applyMove(cur, nxt, isCapStep, jumpedStep);
        if (isCapStep && jumpedStep != null) {
          Turn.recordCapture();
          Visual.capturedOrderPush(jumpedStep);
        }
        cur = nxt;
      }

      Game.inChain = false;
      Game.chainPos = null;
      Game.lastMovedTo = cur;

      Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
      UI.log(
        `${t("log.move")}: ${rcStr(fr)}→${rcStr(cur)} (${sideLabel(
          mover
        )})`
      );

      Game.forcedPly += 1;
      if (Game.forcedPly === 10) {
        handleForcedOpeningOver();
      }

      switchPlayer();
      Turn.start();
      scheduleForcedOpeningAutoIfNeeded();
      Visual.draw();

      if (Game.forcedPly >= 10 && Game.player === aiSide()) {
        Turn.finishTurnAndSoufla();
      }

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

    const v = valueAt(fr);
    const [isCap, jumped] = classifyCapture(fr, to);

    const path = findCapturePath(fr, to, v);

    if (path && path.length) {
      let cur = fr;
      if (!Turn.ctx) Turn.start();
      Turn.beginCapture(fr);
      for (const [toIdx, jumpedIdx] of path) {
        const [isCapStep, jumpedStep] = classifyCapture(cur, toIdx);
        applyMove(cur, toIdx, isCapStep, jumpedStep);
        if (isCapStep && jumpedStep != null) {
          Turn.recordCapture();
          Visual.capturedOrderPush(jumpedStep);
        }
        cur = toIdx;
      }
      Game.inChain = false;
      Game.chainPos = null;
      Game.lastMovedTo = cur;
    } else if (isCap) {
      const [isCapFirst, jumpedFirst] = classifyCapture(fr, to);
      applyMove(fr, to, isCapFirst, jumpedFirst);
      if (isCapFirst && jumpedFirst != null) {
        Visual.capturedOrderPush(jumpedFirst);
        Turn.recordCapture();
      }

      let cur = to;
      while (true) {
        const vcur = valueAt(cur);
        const caps = generateCapturesFrom(cur, vcur);
        if (!caps.length) break;
        const [toIdx] = caps[0];
        const [isCapNext, jumpedNext] = classifyCapture(cur, toIdx);
        applyMove(cur, toIdx, isCapNext, jumpedNext);
        if (isCapNext && jumpedNext != null) {
          Turn.recordCapture();
          Visual.capturedOrderPush(jumpedNext);
        }
        cur = toIdx;
      }

      Game.inChain = false;
      Game.chainPos = null;
      Game.lastMovedTo = cur;
    } else {
      applyMove(fr, to, false, null);
    }

    Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
    UI.log(
      `${t("log.move")}: ${rcStr(fr)}→${rcStr(to)} (${sideLabel(
        mover
      )})`
    );

    Game.forcedPly += 1;
    if (Game.forcedPly === 10) {
      handleForcedOpeningOver();
    }

    switchPlayer();
    Turn.start();
    scheduleForcedOpeningAutoIfNeeded();
    Visual.draw();
    if (Game.forcedPly >= 10 && Game.player === aiSide()) {
      Turn.finishTurnAndSoufla();
    }

    if (
      !Game.awaitingPenalty &&
      !Game.gameOver &&
      Game.player === aiSide() &&
      !(Game.forcedEnabled && Game.forcedPly < 10)
    ) {
      AI.scheduleMove();
    }
  }, 500);
}
function findCapturePath(fromIdx, targetIdx, pieceVal) {
  const path = [];
  const visitedBoards = new Set();
  const origBoard = cloneBoard(Game.board);

  function boardKey() {
    let s = "";
    for (let r = 0; r < BOARD_N; r++)
      for (let c = 0; c < BOARD_N; c++) s += "," + Game.board[r][c];
    return s;
  }

  let found = false;
  function dfs(curIdx) {
    if (curIdx === targetIdx) {
      found = true;
      return true;
    }
    const moves = generateCapturesFrom(curIdx, pieceVal);
    for (const [toIdx, jumped] of moves) {
      const [r1, c1] = idxToRC(curIdx);
      const [r2, c2] = idxToRC(toIdx);
      const [jr, jc] = idxToRC(jumped);
      const keep = cloneBoard(Game.board);
      Game.board[r1][c1] = 0;
      Game.board[jr][jc] = 0;
      Game.board[r2][c2] = pieceVal;
      const key = boardKey();
      if (!visitedBoards.has(key)) {
        visitedBoards.add(key);
        path.push([toIdx, jumped]);
        if (dfs(toIdx)) return true;
        path.pop();
      }
      Game.board = keep;
    }
    return false;
  }

  dfs(fromIdx);
  Game.board = origBoard;
  return found ? path : null;
}

function detectCriticalState(side) {
  const { Lmax } = computeLongestForPlayer(side);
  if (Lmax > 0) return true;

  for (let idx = 0; idx < N_CELLS; idx++) {
    const v = valueAt(idx);
    if (!v || pieceOwner(v) !== side || pieceKind(v) !== MAN) continue;
    const [r] = idxToRC(idx);
    if ((side === TOP && r >= 7) || (side === BOT && r <= 1)) return true;
  }

  const opp = -side;
  for (let from = 0; from < N_CELLS; from++) {
    const v = valueAt(from);
    if (!v || pieceOwner(v) !== opp) continue;
    const caps = generateCapturesFrom(from, v);
    for (const [toIdx, jIdx] of caps) {
      const jv = valueAt(jIdx);
      if (jv && pieceOwner(jv) === side && pieceKind(jv) === KING) {
        return true;
      }
    }
  }
  return false;
}





function getMauritanianScore(side) {
  
  

  const N = BOARD_N;
  const OPP = side === TOP ? BOT : TOP;

  const adv = (Game.settings && Game.settings.advanced) || {};
  const W = {
    attackLine: clampInt(adv.w_mauri_attackLine, 0, 10, 1),
    defenseLine: clampInt(adv.w_mauri_defenseLine, 0, 10, 1),
    backRow: clampInt(adv.w_mauri_backRow, 0, 10, 1),
    columnSpace: clampInt(adv.w_mauri_columnSpace, 0, 10, 1),
    tactics: clampInt(adv.w_mauri_tactics, 0, 10, 1),
    kingsPromotion: clampInt(adv.w_mauri_kingsPromotion, 0, 10, 1),
  };

  const params = (who) => ({
    attackCol: who === TOP ? 0 : 8,
    defCol: who === TOP ? 8 : 0,
    backRow: who === TOP ? 0 : 8,
    promoRow: who === TOP ? 8 : 0,
    fwd: forwardDir(who),
  });

  const P = params(side);
  const Q = params(OPP);

  const isEye = (c) => (c === 0 || c === 2 || c === 4 || c === 6 || c === 8);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const insideLocal = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  let men = 0, kings = 0, oppMen = 0, oppKings = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = Game.board[r][c];
    if (!v) continue;
    const owner = pieceOwner(v);
    const kind = pieceKind(v);
    if (owner === side) { if (kind === KING) kings++; else men++; }
    else if (owner === OPP) { if (kind === KING) oppKings++; else oppMen++; }
  }
  const totalPieces = men + kings + oppMen + oppKings;
  const phase = (totalPieces >= 20) ? "open" : (totalPieces >= 12 ? "mid" : "end");

  const emptyInColMid = (col) => {
    let e = 0;
    for (let r = 2; r <= 6; r++) if (Game.board[r][col] === 0) e++;
    return e;
  };

  const countInCol = (who, col) => {
    let k = 0;
    for (let r = 0; r < N; r++) {
      const v = Game.board[r][col];
      if (v && pieceOwner(v) === who) k++;
    }
    return k;
  };

  const countInBand = (who, c0, c1) => {
    let k = 0;
    for (let r = 0; r < N; r++) for (let c = c0; c <= c1; c++) {
      const v = Game.board[r][c];
      if (v && pieceOwner(v) === who) k++;
    }
    return k;
  };

  const isAdjacentConnected = (r, c, rr, cc) => {
    const dr = rr - r, dc = cc - c;
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return false;
    if (!isDirAllowedFrom(r, c, dr, dc)) return false;
    if (!isDirAllowedFrom(rr, cc, -dr, -dc)) return false;
    return true;
  };

  const supportDegreeBand = (who, r, c, c0, c1) => {
    let d = 0;
    const dirs = [...DIRS_ORTHO, ...DIRS_DIAG_A, ...DIRS_DIAG_B];
    for (const [dr, dc] of dirs) {
      const rr = r + dr, cc = c + dc;
      if (!insideLocal(rr, cc)) continue;
      if (cc < c0 || cc > c1) continue;
      if (!isAdjacentConnected(r, c, rr, cc)) continue;
      const u = Game.board[rr][cc];
      if (u && pieceOwner(u) === who) d++;
    }
    return d;
  };

  const triangleScore = (who) => {
    const p = params(who);
    const band = (p.attackCol === 0) ? [0, 2] : [6, 8];
    let dense = 0, nodes = 0;
    for (let r = 0; r < N; r++) for (let c = band[0]; c <= band[1]; c++) {
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      nodes++;
      if (supportDegreeBand(who, r, c, band[0], band[1]) >= 2) dense++;
    }
    return 2.4 * dense + 0.35 * nodes;
  };

  const backRowSafety = (who) => {
    const p = params(who);
    const row = p.backRow;
    let eyeFilled = 0, eyeEmpty = 0, narrowFilled = 0;
    for (let c = 0; c < N; c++) {
      const v = Game.board[row][c];
      if (isEye(c)) {
        if (v && pieceOwner(v) === who) eyeFilled++;
        else eyeEmpty++;
      } else {
        if (v && pieceOwner(v) === who) narrowFilled++;
      }
    }
    let s = 0;
    s += eyeFilled * 3.0 + narrowFilled * 0.8;
    s -= eyeEmpty * 5.2;
    if (eyeFilled >= 3) s += 2.5;
    return s;
  };

  const promoThreat = (who) => {
    const p = params(who);
    let t = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      if (pieceKind(v) !== MAN) continue;
      if (c !== p.attackCol) continue; 
      const dist = Math.abs(p.promoRow - r);
      if (dist === 0 || dist > 3) continue;
      
      let clear = true;
      const step = p.fwd;
      for (let rr = r + step; insideLocal(rr, c); rr += step) {
        if (rr === p.promoRow) break;
        if (Game.board[rr][c] !== 0) { clear = false; break; }
      }
      if (!clear) continue;
      t += (4 - dist);
    }
    return t;
  };

  const capturableIdxSet = (victimSide) => {
    const attacker = victimSide === TOP ? BOT : TOP;
    const jumpedSet = new Set();
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== attacker) continue;
      const caps = generateCapturesFrom(idx, v);
      for (const x of caps) if (x && x.jumped != null) jumpedSet.add(x.jumped);
    }
    return jumpedSet;
  };

  const capturableCount = (victimSide) => capturableIdxSet(victimSide).size;

  const mobility = (who) => {
    let m = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      const steps = generateStepsFrom(idx, v);
      m += steps.length * (pieceKind(v) === KING ? 1.2 : 1.0);
    }
    return m;
  };

  const centerPenalty = (who) => {
    let p = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      if (pieceKind(v) !== MAN) continue;
      if (c >= 3 && c <= 5 && r >= 2 && r <= 6) p++;
    }
    const mult = (phase === "open") ? 2.2 : (phase === "mid" ? 1.6 : 0.9);
    return -mult * p;
  };

  const wingSpaceScore = (who) => {
    const p = params(who);
    const openAtk = emptyInColMid(p.attackCol) / 5;
    const openDef = emptyInColMid(p.defCol) / 5;
    let s = 0;
    s += 2.6 * openAtk;
    s -= 4.6 * openDef;
    s += 0.7 * (countInCol(who, p.attackCol) + countInCol(who, p.defCol));
    return s;
  };

  const defenseSystemScore = (who) => {
    const p = params(who);
    const band = (p.defCol === 8) ? [6, 8] : [0, 2];
    const inBand = countInBand(who, band[0], band[1]);
    const inCol = countInCol(who, p.defCol);
    let closer = 0;
    const nearRows = (p.backRow === 0) ? [0, 2] : [6, 8];
    for (let r = nearRows[0]; r <= nearRows[1]; r++) {
      const v = Game.board[r][p.defCol];
      if (v && pieceOwner(v) === who) { closer = 1; break; }
    }
    const supportCol = (p.defCol === 8) ? 7 : 1;
    const support = countInCol(who, supportCol);
    let s = 0;
    s += 2.2 * inCol + 1.1 * support + 0.8 * inBand + 2.8 * closer;
    s -= 4.2 * (emptyInColMid(p.defCol) / 5);
    return s;
  };

  const attackSystemScore = (who) => {
    const p = params(who);
    const band = (p.attackCol === 0) ? [0, 2] : [6, 8];
    const inBand = countInBand(who, band[0], band[1]);
    const inCol = countInCol(who, p.attackCol);
    const tri = triangleScore(who);
    const openAtk = emptyInColMid(p.attackCol) / 5;
    let s = 0;
    s += 2.0 * inCol + 0.9 * inBand + 2.4 * openAtk + 1.6 * tri;
    return s;
  };

  const captureProfile = (who) => {
    let capMoves = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      capMoves += generateCapturesFrom(idx, v).length;
    }
    const { Lmax } = computeLongestForPlayer(who);
    return { capMoves, Lmax };
  };

  const laneCapturePotential = (who, col) => {
    
    let n = 0;
    for (let r = 0; r < N; r++) {
      const v = Game.board[r][col];
      if (!v || pieceOwner(v) !== who) continue;
      try { n += generateCapturesFrom(rcToIdx(r, col), v).length; } catch {}
    }
    return n;
  };

  const wingDisciplinePenalty = (who) => {
    
    let midCols = 0, midBox = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      if (pieceKind(v) !== MAN) continue;
      if (c >= 3 && c <= 5) midCols++;
      if (c >= 3 && c <= 5 && r >= 2 && r <= 6) midBox++;
    }
    
    return -(1.15 * midCols + 0.85 * midBox);
  };

  const kingQuality = (who) => {
    let s = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      if (pieceKind(v) !== KING) continue;
      s += 2.0 + 0.20 * generateStepsFrom(idx, v).length;
      
      let deg = 0;
      for (const [dr, dc] of [...DIRS_ORTHO, ...DIRS_DIAG_A, ...DIRS_DIAG_B]) {
        const rr = r + dr, cc = c + dc;
        if (!insideLocal(rr, cc)) continue;
        if (!isAdjacentConnected(r, c, rr, cc)) continue;
        const u = Game.board[rr][cc];
        if (u && pieceOwner(u) === who) deg++;
      }
      s += 0.7 * Math.min(deg, 3);
      if (deg === 0 && r >= 2 && r <= 6 && c >= 2 && c <= 6) s -= 1.2;
    }
    return s;
  };

  const runnerScore = (who) => {
    const p = params(who);
    const capSet = capturableIdxSet(who);
    let s = 0;
    for (let idx = 0; idx < N_CELLS; idx++) {
      const [r, c] = idxToRC(idx);
      const v = Game.board[r][c];
      if (!v || pieceOwner(v) !== who) continue;
      if (pieceKind(v) !== MAN) continue;
      if (c !== p.attackCol) continue;
      const dist = Math.abs(p.promoRow - r);
      if (dist === 0) continue;
      let clear = true;
      const step = p.fwd;
      for (let rr = r + step; insideLocal(rr, c); rr += step) {
        if (rr === p.promoRow) break;
        if (Game.board[rr][c] !== 0) { clear = false; break; }
      }
      if (!clear) continue;
      const base = (phase === "end") ? 3.2 : 2.2;
      const val = base * (1 / Math.max(1, dist));
      s += capSet.has(idx) ? (0.25 * val) : val;
    }
    return s;
  };

  const tacticalScore = (who) => {
    const O = (who === TOP) ? BOT : TOP;
    const ourCaps = captureProfile(who);
    const oppCaps = captureProfile(O);
    const ourCapd = capturableCount(who);
    const oppCapd = capturableCount(O);
    let s = 0;
    s += 0.85 * ourCaps.Lmax + 0.35 * ourCaps.capMoves;
    s -= 1.15 * ourCapd;
    s -= 0.95 * oppCaps.Lmax + 0.30 * oppCaps.capMoves;
    s += 0.75 * oppCapd;
    return s;
  };

  const ourBack = backRowSafety(side);
  const oppBack = backRowSafety(OPP);

  const ourPromoThreat = promoThreat(side);
  const oppPromoThreat = promoThreat(OPP);

  const ourDefense = defenseSystemScore(side);
  const oppDefense = defenseSystemScore(OPP);

  const ourAttack = attackSystemScore(side);
  const oppAttack = attackSystemScore(OPP);

  const ourSpace = wingSpaceScore(side);
  const oppSpace = wingSpaceScore(OPP);

  const ourTac = tacticalScore(side);
  const oppTac = tacticalScore(OPP);

  const ourRunner = runnerScore(side);
  const oppRunner = runnerScore(OPP);

  const ourKingQ = kingQuality(side);
  const oppKingQ = kingQuality(OPP);

  const ourMob = mobility(side);
  const oppMob = mobility(OPP);

  
  const ourAtkLaneCaps = laneCapturePotential(side, P.attackCol);
  const ourDefLaneCaps = laneCapturePotential(side, P.defCol);
  const oppAtkLaneCaps = laneCapturePotential(OPP, Q.attackCol);
  const oppDefLaneCaps = laneCapturePotential(OPP, Q.defCol);

  const backPressure = clamp01((oppPromoThreat / 6) + (Math.max(0, -ourBack + 6) / 12));
  const promoPressure = clamp01(oppPromoThreat / 6);
  const tacticalPressure = clamp01((Math.max(0, -ourTac) / 10) + (Math.max(0, oppTac) / 12));

  const WB = (7.0 + 2.2 * W.backRow) * (1.0 + 1.35 * backPressure);
  const WD = (4.2 + 1.6 * W.defenseLine) * (1.0 + 1.10 * promoPressure);
  const WA = (2.2 + 1.4 * W.attackLine);
  const WS = (1.8 + 1.3 * W.columnSpace);
  const WT = (2.6 + 1.8 * W.tactics) * (1.0 + 0.75 * tacticalPressure);
  const WKP = (2.2 + 1.7 * W.kingsPromotion);

  const safetyGate = 1.0 / (1.0 + Math.max(0, (3.5 - ourBack)) * (0.25 + 0.45 * promoPressure));

  let score = 0;

  score += WB * (ourBack - oppBack);
  score += (WB * 0.9) * (-oppPromoThreat + 0.55 * ourPromoThreat);

  score += WD * (ourDefense - oppDefense);

  score += WT * safetyGate * (ourTac - oppTac);

  
  
  score += (2.8 + 1.4 * W.tactics) * safetyGate *
    ((ourAtkLaneCaps - oppAtkLaneCaps) - 1.55 * (ourDefLaneCaps - oppDefLaneCaps));


  score += WA * safetyGate * (ourAttack - oppAttack);

  score += WS * (ourSpace - oppSpace);

  score += WKP * (ourRunner - oppRunner);
  score += (WKP * 0.85) * (ourKingQ - oppKingQ);

  score += (1.4 + 0.6 * W.columnSpace) * (centerPenalty(side) - centerPenalty(OPP));
  score += (2.0 + 1.1 * W.columnSpace) * (wingDisciplinePenalty(side) - wingDisciplinePenalty(OPP));
  score += (0.10 * safetyGate) * (ourMob - oppMob);

  const material = (men + 1.9 * kings) - (oppMen + 1.9 * oppKings);
  score += 0.65 * material;

  return score;
}
getMauritanianScore.__isMauri = true;

function mauriRolloutMoveScore(a, prevA, pi = null) {
  if (a === ACTION_ENDCHAIN) return -1e15;
  const from = Math.floor(a / N_CELLS);
  const to = a % N_CELLS;
  const [fr, fc] = idxToRC(from);
  const [tr, tc] = idxToRC(to);
  const v = Game.board[fr][fc];
  const who = Game.player;
  const kind = v ? pieceKind(v) : MAN;

  const p = (who === TOP)
    ? { attackCol: 0, defCol: 8, backRow: 0, fwd: +1 }
    : { attackCol: 8, defCol: 0, backRow: 8, fwd: -1 };

  const isEye = (c) => (c === 0 || c === 2 || c === 4 || c === 6 || c === 8);

  let s = 0;
  const [isCap] = classifyCapture(from, to);
  if (isCap) s += 6e6;

  if (!isCap) {
    if ((fc === p.attackCol || fc === p.defCol) && tc !== fc) s -= 7e6;
    if ((fc === p.attackCol || fc === p.defCol) && (tr - fr) * p.fwd <= 0) s -= 7e6;
    if (fr === p.backRow && isEye(fc)) s -= 3e6;
    if (kind === MAN && tc >= 3 && tc <= 5) s -= 4.8e6;
    if (kind === MAN && tc >= 3 && tc <= 5 && tr >= 2 && tr <= 6) s -= 2.4e6;
    
    const target = (fc <= 4) ? p.attackCol : p.defCol;
    const d0 = Math.abs(fc - target);
    const d1 = Math.abs(tc - target);
    if (d1 < d0) s += 0.95e6 * (d0 - d1);
    if (d1 > d0) s -= 1.25e6 * (d1 - d0);

    if (kind === MAN && (tc <= 1 || tc >= 7)) s += 0.9e6;
  }

  if (tc === p.attackCol) s += 0.8e6;
  if (tc === p.defCol) s += 0.5e6;

  try { s += 1.6e3 * heuristicEvalMove(who, from, to); } catch {}

  const pI = sideIdx(who);
  const h = AI_ORDER.history[pI][a] | 0;
  if (h) s += h;
  if (prevA != null) {
    const cm = AI_ORDER.countermove[pI][prevA] | 0;
    if (cm === a) s += 2e6;
  }
  let prior = 0;
  if (pi) {
    if (pi instanceof Map) prior = Number(pi.get(a) || 0);
    else if (pi[a] != null) prior = Number(pi[a] || 0);
  }
  if (prior) s += 8e5 * prior;

  return s;
}


function detectMauritanianCriticalState(side) {
  
  try {
    const me = computeLongestForPlayer(side);
    if (me && me.Lmax > 0) return true;
  } catch {}
  try {
    const opp = computeLongestForPlayer(-side);
    if (opp && opp.Lmax > 0) return true;
  } catch {}

  
  for (let idx = 0; idx < N_CELLS; idx++) {
    const v = valueAt(idx);
    if (!v || pieceKind(v) !== MAN) continue;
    const [r] = idxToRC(idx);
    const owner = pieceOwner(v);
    if ((owner === TOP && r >= 7) || (owner === BOT && r <= 1)) return true;
  }

  
  const oppSide = -side;
  for (let from = 0; from < N_CELLS; from++) {
    const v = valueAt(from);
    if (!v) continue;
    const owner = pieceOwner(v);
    const caps = generateCapturesFrom(from, v);
    for (let i = 0; i < caps.length; i++) {
      const jIdx = caps[i][1];
      const jv = valueAt(jIdx);
      if (!jv) continue;
      if (pieceKind(jv) !== KING) continue;
      
      if (owner === side || owner === oppSide) return true;
    }
  }

  
  let pc = 0;
  for (let i = 0; i < N_CELLS; i++) if (valueAt(i)) pc++;
  if (pc <= 10) return true;

  return false;
}
function heuristicEvalBoard(side) {
  let me = 0, opp = 0;

  
  let totalPieces = 0;
  for (let i = 0; i < N_CELLS; i++) {
    const v = valueAt(i);
    if (v) totalPieces++;
  }
  
  
  const endFactor = Math.max(0, Math.min(1, (16 - totalPieces) / 16));
  const kingW = 1.0 + 1.35 * endFactor;
  const promoW = 1.0 + 0.85 * endFactor;
  const safetyW = 1.0 + 1.10 * endFactor;

  for (let i = 0; i < N_CELLS; i++) {
    const v = valueAt(i);
    if (!v) continue;

    const owner = pieceOwner(v);
    const kind = pieceKind(v);

    let s = 0;

    s += (kind === KING ? 3.6 * kingW : 1.0);

    if (kind === KING) {
      const [r, c] = idxToRC(i);
      const manhattan = Math.abs(r - 4) + Math.abs(c - 4);
      s += (1.0 - manhattan / 16) * (0.35 * kingW);

      try {
        const steps = generateStepsFrom(i, v).length;
        const caps = generateCapturesFrom(i, v).length;
        s += (steps * 0.03 + caps * 0.20) * kingW;
      } catch {}
    } else {
      const [r] = idxToRC(i);
      const distToBack = owner === TOP ? (8 - r) : r;
      s += (8 - distToBack) * (0.02 * promoW);
    }

    
    
    if (endFactor >= 0.35) {
      try {
        if (isSquareCapturableBy(-owner, i)) {
          
          s -= (kind === KING ? 0.70 : 0.35) * safetyW;
        }
      } catch {}
    }

    if (owner === side) me += s;
    else opp += s;
  }

  return me - opp;
}

function isSquareCapturableBy(attackerSide, targetIdx) {
  for (let i = 0; i < N_CELLS; i++) {
    const v = valueAt(i);
    if (!v) continue;
    if (pieceOwner(v) !== attackerSide) continue;
    const caps = generateCapturesFrom(i, v);
    for (let k = 0; k < caps.length; k++) {
      if (caps[k][0] === targetIdx) return true;
    }
  }
  return false;
}

function heuristicEvalMove(side, from, to) {
  let score = 0;

  const v0 = valueAt(from);
  if (!v0) return score;

  const kind = pieceKind(v0);
  const [rf, cf] = idxToRC(from);
  const [rt, ct] = idxToRC(to);

  const [cap] = classifyCapture(from, to);
  if (cap) score += (kind === KING ? 2.4 : 1.6);

  if (kind === MAN) {
    const distToBack = side === TOP ? 8 - rt : rt;
    if (distToBack === 0) score += 2.0;
    else if (distToBack <= 2) score += 0.6;
    else score += 0.15;

    if (Math.abs(ct - cf) === 1) score += 0.05;
    return score;
  }

  const dist = Math.max(Math.abs(rt - rf), Math.abs(ct - cf));
  score += Math.min(1.2, dist * 0.10);

  const prevFrom = v0;
  const prevTo = valueAt(to);

  try {
    setValueAt(from, 0);
    setValueAt(to, prevFrom);

    const steps = generateStepsFrom(to, prevFrom).length;
    const caps = generateCapturesFrom(to, prevFrom).length;

    score += steps * 0.05 + caps * 0.30;

    if (isSquareCapturableBy(-side, to)) score -= 1.25;

    const manhattan = Math.abs(rt - 4) + Math.abs(ct - 4);
    score += (1.0 - manhattan / 16) * 0.15;
  } finally {
    setValueAt(from, prevFrom);
    setValueAt(to, prevTo);
  }

  return score;
}


function snapshotStateSim() {
  return {
    board: cloneBoard(Game.board),
    player: Game.player,
    inChain: !!Game.inChain,
    chainPos: Game.chainPos == null ? null : Game.chainPos,
  };
}

function restoreSnapshotSim(snap) {
  Game.board = cloneBoard(snap.board);
  Game.player = snap.player;
  Game.inChain = snap.inChain;
  Game.chainPos = snap.chainPos;
}

function applyMoveSim(fromIdx, toIdx) {
  const [isCap, jumped] = classifyCapture(fromIdx, toIdx);

  const [r1, c1] = idxToRC(fromIdx);
  const [r2, c2] = idxToRC(toIdx);

  const v = Game.board[r1][c1];
  Game.board[r1][c1] = 0;

  if (isCap && jumped != null) {
    const [jr, jc] = idxToRC(jumped);
    Game.board[jr][jc] = 0;
  }

  Game.board[r2][c2] = v;

  const owner = pieceOwner(v);
  if (pieceKind(v) === MAN && isBackRank(toIdx, owner)) {
    Game.board[r2][c2] = owner === TOP ? KING : -KING;
  }

  return { isCap, jumped };
}

function applyActionSim(a) {
  if (a === ACTION_ENDCHAIN) {
    Game.inChain = false;
    Game.chainPos = null;
    Game.player = -Game.player;
    return;
  }

  const from = Math.floor(a / N_CELLS);
  const to = a % N_CELLS;

  const { isCap } = applyMoveSim(from, to);

  if (isCap) {
    const vcur = valueAt(to);
    const caps = generateCapturesFrom(to, vcur);
    if (caps.length) {
      Game.inChain = true;
      Game.chainPos = to;
      return; 
    }
  }

  Game.inChain = false;
  Game.chainPos = null;
  Game.player = -Game.player;
}

function simTerminalScore(perspectiveSide) {
  let top = 0, bot = 0;
  for (let r = 0; r < BOARD_N; r++) {
    for (let c = 0; c < BOARD_N; c++) {
      const v = Game.board[r][c];
      if (v > 0) top++;
      else if (v < 0) bot++;
    }
  }
  if (top === 0) return perspectiveSide === TOP ? -9999 : 9999;
  if (bot === 0) return perspectiveSide === TOP ? 9999 : -9999;

  const { mask } = legalActions();
  let any = false;
  for (let a = 0; a < N_ACTIONS; a++) {
    if (mask[a]) { any = true; break; }
  }
  if (!any) return Game.player === perspectiveSide ? -9999 : 9999;

  return null;
}

function simulateApply(from, to) {
  const snap = snapshotStateSim();
  const { isCap } = applyMoveSim(from, to);

  if (isCap) {
    const vcur = valueAt(to);
    const caps = generateCapturesFrom(to, vcur);
    if (caps.length) {
      Game.inChain = true;
      Game.chainPos = to;
      return snap;
    }
  }

  Game.inChain = false;
  Game.chainPos = null;
  Game.player = -Game.player;
  return snap;
}

function undoTo(snap) {
  restoreSnapshotSim(snap);
}

function staticEval(side) {
  const sMe = heuristicEvalBoard(side);
  const sOpp = heuristicEvalBoard(-side);
  return sMe - 0.9 * sOpp;
}





const AI_ZOBRIST = (() => {
  const MASK = (1n << 64n) - 1n;
  let seed = 0x243f6a8885a308d3n;
  
  function next64() {
    seed = (seed + 0x9e3779b97f4a7c15n) & MASK;
    let z = seed;
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n & MASK;
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn & MASK;
    return (z ^ (z >> 31n)) & MASK;
  }

  const piece = Array.from({ length: 5 }, () => new Array(N_CELLS));
  for (let pi = 0; pi < 5; pi++) {
    for (let i = 0; i < N_CELLS; i++) piece[pi][i] = next64();
  }

  const sideToMoveTop = next64();
  const inChain = next64();
  const chainPos = new Array(N_CELLS + 1);
  for (let i = 0; i < chainPos.length; i++) chainPos[i] = next64();

  return { MASK, piece, sideToMoveTop, inChain, chainPos };
})();

function zobristKey() {
  let h = 0n;
  for (let i = 0; i < N_CELLS; i++) {
    const v = valueAt(i);
    if (!v) continue;
    const pi = (v + 2) | 0; 
    h ^= AI_ZOBRIST.piece[pi][i];
  }
  
  if (Game.player === TOP) h ^= AI_ZOBRIST.sideToMoveTop;
  if (Game.inChain) h ^= AI_ZOBRIST.inChain;
  const cp = Game.chainPos == null ? -1 : (Game.chainPos | 0);
  h ^= AI_ZOBRIST.chainPos[(cp + 1) | 0];
  return h & AI_ZOBRIST.MASK;
}

const AI_ORDER = (() => {
  const history = [new Int32Array(N_ACTIONS), new Int32Array(N_ACTIONS)];
  const countermove = [new Int32Array(N_ACTIONS), new Int32Array(N_ACTIONS)];
  countermove[0].fill(-1);
  countermove[1].fill(-1);
  return { history, countermove };
})();

function sideIdx(side) {
  return side === TOP ? 0 : 1;
}

function isCaptureAction(a) {
  if (a === ACTION_ENDCHAIN) return false;
  const from = Math.floor(a / N_CELLS);
  const to = a % N_CELLS;
  const [isCap] = classifyCapture(from, to);
  return !!isCap;
}

function listLegalActionsFromMask(mask, { pruneEarlyEndChain = true } = {}) {
  
  const actions = [];
  let anyCapture = false;

  if (Game.inChain && Game.chainPos != null) {
    for (let a = 0; a < N_ACTIONS; a++) {
      if (!mask[a] || a === ACTION_ENDCHAIN) continue;
      actions.push(a);
      anyCapture = true;
    }
    if (mask[ACTION_ENDCHAIN]) {
      if (!pruneEarlyEndChain || !anyCapture) actions.push(ACTION_ENDCHAIN);
    }
    return { actions, anyCapture };
  }

  for (let a = 0; a < N_ACTIONS; a++) {
    if (!mask[a]) continue;
    if (a === ACTION_ENDCHAIN) continue;
    actions.push(a);
  }
  if (mask[ACTION_ENDCHAIN]) actions.push(ACTION_ENDCHAIN);

  
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a === ACTION_ENDCHAIN) continue;
    const from = Math.floor(a / N_CELLS);
    const to = a % N_CELLS;
    const [isCap] = classifyCapture(from, to);
    if (isCap) { anyCapture = true; break; }
  }

  return { actions, anyCapture };
}

function countPiecesOnBoard() {
  let n = 0;
  for (let i = 0; i < N_CELLS; i++) if (valueAt(i)) n++;
  return n;
}

function topKLegalActions(mask, k = 8, pi = null) {
  const items = [];
  const pI = sideIdx(Game.player);
  for (let a = 0; a < N_ACTIONS; a++) {
    if (!mask[a]) continue;
    if (a === ACTION_ENDCHAIN) continue;

    const from = Math.floor(a / N_CELLS);
    const to = a % N_CELLS;
    const [isCap] = classifyCapture(from, to);

    let score = 0;
    if (isCap) score += 1000;

    
    if (pi && pi[a] != null) score += 10 * Number(pi[a] || 0);

    
    const h = AI_ORDER.history[pI][a] | 0;
    if (h) score += 0.00005 * h;
    try { score += 0.001 * heuristicEvalMove(Game.player, from, to); } catch {}

    items.push({ a, score });
  }

  items.sort((x, y) => y.score - x.score);
  return items.slice(0, Math.max(1, k)).map((o) => o.a);
}






const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

class TranspositionTable {
  constructor(maxEntries = 120000) {
    this.maxEntries = Math.max(1000, maxEntries | 0);
    this.map = new Map();
  }
  get(key) {
    return this.map.get(key);
  }
  set(key, entry) {
    if (this.map.size >= this.maxEntries) this.map.clear();
    this.map.set(key, entry);
  }
}

function moveOrderScore(a, ctx, ply, prevA, pvA, pi) {
  if (a === ACTION_ENDCHAIN) {
    
    return -1e15;
  }

  let s = 0;
  if (pvA != null && a === pvA) s += 9e14;

  const from = Math.floor(a / N_CELLS);
  const to = a % N_CELLS;
  const [isCap, jumped] = classifyCapture(from, to);
  if (isCap) {
    s += 8e12;
    try {
      if (jumped != null) {
        const vj = valueAt(jumped);
        s += (pieceKind(vj) === KING ? 3 : 1) * 2e9;
      }
    } catch {}
  }

  const k1 = ctx.killers1[ply] | 0;
  const k2 = ctx.killers2[ply] | 0;
  if (a === k1) s += 6e12;
  else if (a === k2) s += 5e12;

  const pIdx = sideIdx(Game.player);
  const h = AI_ORDER.history[pIdx][a] | 0;
  if (h) s += h * 1e6;

  if (prevA != null) {
    const cm = AI_ORDER.countermove[pIdx][prevA] | 0;
    if (cm === a) s += 2.5e12;
  }

  if (pi && pi[a] != null) {
    const pp = Number(pi[a] || 0);
    if (pp) s += pp * 2e9;
  }

  try {
    s += 1e7 * heuristicEvalMove(Game.player, from, to);
  } catch {}

  return s;
}

function orderedActions(mask, ctx, ply, prevA, pvA, pi, limit = null) {
  const { actions } = listLegalActionsFromMask(mask, { pruneEarlyEndChain: true });
  if (actions.length <= 1) return actions;

  const items = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    items.push({ a, s: moveOrderScore(a, ctx, ply, prevA, pvA, pi) });
  }
  items.sort((x, y) => y.s - x.s);

  const out = [];
  const L = limit != null ? Math.max(1, limit | 0) : items.length;
  for (let i = 0; i < items.length && out.length < L; i++) out.push(items[i].a);
  return out;
}

function qsearchCaptures(side, alpha, beta, ctx, ply, prevA, pathKeys) {
  const term = simTerminalScore(side);
  if (term != null) return term;
  if (ctx.deadline != null && performance.now() >= ctx.deadline) return ctx.evalFn(side);

  const key = zobristKey();
  if (pathKeys && pathKeys.has(key)) return 0;
  if (pathKeys) pathKeys.add(key);

  let standPat = ctx.evalFn(side);
  if (standPat >= beta) {
    if (pathKeys) pathKeys.delete(key);
    return beta;
  }
  if (standPat > alpha) alpha = standPat;

  
  const { mask } = legalActions();
  const { actions } = listLegalActionsFromMask(mask, { pruneEarlyEndChain: true });
  const caps = [];
  let hasCap = false;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a === ACTION_ENDCHAIN) continue;
    if (isCaptureAction(a)) {
      caps.push(a);
      hasCap = true;
    }
  }
  if (!hasCap) {
    
    if (Game.inChain && mask[ACTION_ENDCHAIN]) caps.push(ACTION_ENDCHAIN);
  }
  if (!caps.length) {
    if (pathKeys) pathKeys.delete(key);
    return standPat;
  }

  
  caps.sort((a, b) => moveOrderScore(b, ctx, ply, prevA, null, null) - moveOrderScore(a, ctx, ply, prevA, null, null));

  const meToMove = Game.player === side;
  let best = standPat;

  for (let i = 0; i < caps.length; i++) {
    if (ctx.deadline != null && performance.now() >= ctx.deadline) break;
    const a = caps[i];
    const snap = snapshotStateSim();
    applyActionSim(a);
    const v = qsearchCaptures(side, alpha, beta, ctx, ply + 1, a, pathKeys);
    restoreSnapshotSim(snap);

    if (meToMove) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }

  if (pathKeys) pathKeys.delete(key);
  return best;
}

function minimaxAB(side, depth, alpha, beta, ctx, prevA, ply, pathKeys) {
  const term = simTerminalScore(side);
  if (term != null) return term;
  if (ctx.deadline != null && performance.now() >= ctx.deadline) return ctx.evalFn(side);

  const key = zobristKey();
  if (pathKeys && pathKeys.has(key)) return 0;
  if (pathKeys) pathKeys.add(key);

  const alpha0 = alpha;
  const beta0 = beta;

  const ttEnt = ctx.tt ? ctx.tt.get(key) : null;
  let pvA = null;
  if (ttEnt && ttEnt.depth >= depth) {
    pvA = ttEnt.bestA ?? null;
    if (ttEnt.flag === TT_EXACT) {
      if (pathKeys) pathKeys.delete(key);
      return ttEnt.value;
    }
    if (ttEnt.flag === TT_LOWER) alpha = Math.max(alpha, ttEnt.value);
    else if (ttEnt.flag === TT_UPPER) beta = Math.min(beta, ttEnt.value);
    if (alpha >= beta) {
      if (pathKeys) pathKeys.delete(key);
      return ttEnt.value;
    }
  } else if (ttEnt) {
    pvA = ttEnt.bestA ?? null;
  }

  if (depth <= 0) {
    const v = qsearchCaptures(side, alpha, beta, ctx, ply, prevA, pathKeys);
    if (pathKeys) pathKeys.delete(key);
    return v;
  }

  const meToMove = Game.player === side;
  const { mask } = legalActions();
  const { anyCapture } = listLegalActionsFromMask(mask, { pruneEarlyEndChain: true });

  
  if (ctx.allowNull && depth >= 4 && !Game.inChain && !anyCapture) {
    const pc = countPiecesOnBoard();
    if (pc > 10) {
      const snap = snapshotStateSim();
      Game.player = -Game.player;
      Game.inChain = false;
      Game.chainPos = null;
      const R = 2;
      const vNull = minimaxAB(side, depth - 1 - R, alpha, beta, ctx, null, ply + 1, pathKeys);
      restoreSnapshotSim(snap);
      if (meToMove) {
        if (vNull >= beta) {
          if (pathKeys) pathKeys.delete(key);
          return beta;
        }
      } else {
        if (vNull <= alpha) {
          if (pathKeys) pathKeys.delete(key);
          return alpha;
        }
      }
    }
  }

  const limit = ctx.branchLimit;
  const cand = orderedActions(mask, ctx, ply, prevA, pvA, null, limit);
  if (!cand.length) {
    const v = ctx.evalFn(side);
    if (pathKeys) pathKeys.delete(key);
    return v;
  }

  let best = meToMove ? -Infinity : Infinity;
  let bestA = cand[0];

  const EPS = 1e-5;
  let first = true;
  for (let i = 0; i < cand.length; i++) {
    if (ctx.deadline != null && performance.now() >= ctx.deadline) break;
    const a = cand[i];

    const snap = snapshotStateSim();
    applyActionSim(a);

    
    let childDepth = depth - 1;
    const isCap = (a !== ACTION_ENDCHAIN) ? isCaptureAction(a) : false;
    const canLMR = ctx.allowLMR && !Game.inChain && !anyCapture && !isCap && depth >= 4 && i >= 3;
    if (canLMR) childDepth = Math.max(0, childDepth - 1);

    let v;
    if (first) {
      v = minimaxAB(side, childDepth, alpha, beta, ctx, a, ply + 1, pathKeys);
      first = false;
    } else {
      if (meToMove) {
        v = minimaxAB(side, childDepth, alpha, alpha + EPS, ctx, a, ply + 1, pathKeys);
        if (v > alpha && v < beta) v = minimaxAB(side, childDepth, alpha, beta, ctx, a, ply + 1, pathKeys);
      } else {
        v = minimaxAB(side, childDepth, beta - EPS, beta, ctx, a, ply + 1, pathKeys);
        if (v < beta && v > alpha) v = minimaxAB(side, childDepth, alpha, beta, ctx, a, ply + 1, pathKeys);
      }
    }

    
    if (canLMR) {
      if (meToMove) {
        if (v > alpha) v = minimaxAB(side, depth - 1, alpha, beta, ctx, a, ply + 1, pathKeys);
      } else {
        if (v < beta) v = minimaxAB(side, depth - 1, alpha, beta, ctx, a, ply + 1, pathKeys);
      }
    }

    restoreSnapshotSim(snap);

    if (meToMove) {
      if (v > best) { best = v; bestA = a; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        
        if (a !== ACTION_ENDCHAIN) {
          if (ctx.killers1[ply] !== a) {
            ctx.killers2[ply] = ctx.killers1[ply];
            ctx.killers1[ply] = a;
          }
          const pI = sideIdx(Game.player);
          AI_ORDER.history[pI][a] += (depth * depth) | 0;
          if (prevA != null) AI_ORDER.countermove[pI][prevA] = a;
        }
        break;
      }
    } else {
      if (v < best) { best = v; bestA = a; }
      if (best < beta) beta = best;
      if (alpha >= beta) {
        if (a !== ACTION_ENDCHAIN) {
          if (ctx.killers1[ply] !== a) {
            ctx.killers2[ply] = ctx.killers1[ply];
            ctx.killers1[ply] = a;
          }
          const pI = sideIdx(Game.player);
          AI_ORDER.history[pI][a] += (depth * depth) | 0;
          if (prevA != null) AI_ORDER.countermove[pI][prevA] = a;
        }
        break;
      }
    }
  }

  if (ctx.tt) {
    let flag = TT_EXACT;
    if (best <= alpha0) flag = TT_UPPER;
    else if (best >= beta0) flag = TT_LOWER;
    ctx.tt.set(key, { depth, value: best, flag, bestA });
  }

  if (pathKeys) pathKeys.delete(key);
  return best;
}

async function minimaxScoreActions(side, pi, effMask, k = 8, depth = 3, capMs = 200, evalFn = staticEval) {
  const { mask } = legalActions();
  const useMask = effMask || mask;

  const size = N_CELLS * N_CELLS;
  const piSafe = Array.isArray(pi) && pi.length === size ? pi : (() => {
    const out = new Array(size).fill(0);
    const legal = [];
    for (let a = 0; a < N_ACTIONS; a++) {
      if (useMask[a] && a !== ACTION_ENDCHAIN) legal.push(a);
    }
    const denom = legal.length || 1;
    for (const a of legal) out[a] = 1 / denom;
    return out;
  })();

  const deadline = performance.now() + Math.max(20, capMs || 0);
  const ctx = {
    deadline,
    evalFn,
    tt: new TranspositionTable(120000),
    killers1: new Int32Array(64),
    killers2: new Int32Array(64),
    branchLimit: Math.max(12, Math.min(40, (k * 2) | 0)),
    allowLMR: true,
    allowNull: true,
  };
  ctx.killers1.fill(-1);
  ctx.killers2.fill(-1);

  
  const rootMask = useMask;
  const rootList = listLegalActionsFromMask(rootMask, { pruneEarlyEndChain: true }).actions;
  let rootActs;
  if (rootList.length <= Math.max(1, k | 0)) {
    rootActs = rootList;
  } else {
    
    rootActs = topKLegalActions(rootMask, k, piSafe);
    if (rootMask[ACTION_ENDCHAIN] && !rootActs.includes(ACTION_ENDCHAIN)) {
      
      if (rootList.length === 1 && rootList[0] === ACTION_ENDCHAIN) rootActs.push(ACTION_ENDCHAIN);
    }
  }

  const rootKey = zobristKey();
  let scores = new Map();

  const maxD = Math.max(1, Math.min(10, depth | 0));
  for (let d = 1; d <= maxD; d++) {
    if (performance.now() >= deadline) break;

    
    rootActs = rootActs.slice().sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));

    const tmp = new Map(scores);
    let complete = true;

    for (let i = 0; i < rootActs.length; i++) {
      if (performance.now() >= deadline) { complete = false; break; }
      const a = rootActs[i];

      const snap = snapshotStateSim();
      applyActionSim(a);

      
      let alpha = -Infinity;
      let beta = Infinity;
      if (tmp.has(a)) {
        const prev = tmp.get(a) || 0;
        const w = 18 + Math.min(60, Math.abs(prev) * 0.05);
        alpha = prev - w;
        beta = prev + w;
      }

      const pathKeys = new Set([rootKey]);
      let v = minimaxAB(side, d - 1, alpha, beta, ctx, a, 1, pathKeys);

      
      if (v <= alpha) v = minimaxAB(side, d - 1, -Infinity, beta, ctx, a, 1, pathKeys);
      else if (v >= beta) v = minimaxAB(side, d - 1, alpha, Infinity, ctx, a, 1, pathKeys);

      restoreSnapshotSim(snap);
      tmp.set(a, v);
    }

    if (!complete) break;
    scores = tmp;
  }

  return scores;
}

async function mauriMinimaxScoreActions(side, pi, effMask, k = 10, maxDepth = 5, capMs = 350) {
  return minimaxScoreActions(side, pi, effMask, k, maxDepth, capMs, getMauritanianScore);
}









class MctsNode {
  constructor(key, toMove) {
    this.key = key;
    this.toMove = toMove;
    this.visits = 0;
    this.valueSum = 0;
    this.children = new Map(); 
    this.priors = null;        
    this.untried = null;       
    this.raveVisits = new Map();
    this.raveValueSum = new Map();
  }
}

function makeMctsStore(maxNodes) {
  const MAX_NODES = Math.max(5000, (maxNodes | 0) || 200000);
  const nodes = new Map(); 
  function get(key, toMove) {
    let n = nodes.get(key);
    if (!n) {
      if (nodes.size >= MAX_NODES) nodes.clear();
      n = new MctsNode(key, toMove);
      nodes.set(key, n);
    } else {
      
      if (toMove === TOP || toMove === BOT) n.toMove = toMove;
    }
    return n;
  }
  function peek(key) {
    return nodes.get(key) || null;
  }
  return { get, peek, clear: () => nodes.clear() };
}


const AI_MCTS = makeMctsStore(200000);
const AI_MCTS_MAURI = makeMctsStore(220000);

function rolloutMoveScore(a, prevA, pi = null, guideEvalFn = null) {
  if (guideEvalFn && guideEvalFn.__isMauri) return mauriRolloutMoveScore(a, prevA, pi);
  if (a === ACTION_ENDCHAIN) return -1e15;
  const from = Math.floor(a / N_CELLS);
  const to = a % N_CELLS;
  const [isCap] = classifyCapture(from, to);
  let s = 0;
  if (isCap) s += 4e6;
  try { s += 2e3 * heuristicEvalMove(Game.player, from, to); } catch {}

  const pI = sideIdx(Game.player);
  const h = AI_ORDER.history[pI][a] | 0;
  if (h) s += h;
  if (prevA != null) {
    const cm = AI_ORDER.countermove[pI][prevA] | 0;
    if (cm === a) s += 2e6;
  }
  let prior = 0;
  if (pi) {
    if (pi instanceof Map) prior = Number(pi.get(a) || 0);
    else if (pi[a] != null) prior = Number(pi[a] || 0);
  }
  if (prior) {
    const pp = prior;
    if (pp) s += 1e6 * pp;
  }
  return s;
}

function initMctsNode(node, pi, maskOverride, guideEvalFn = null) {
  if (node.untried) return;
  const { mask } = legalActions();
  const baseMask = maskOverride || mask;

  const { actions } = listLegalActionsFromMask(baseMask, { pruneEarlyEndChain: true });
  node.untried = actions.slice();

  
  
  const priors = new Map();
  let sum = 0;

  let baseGuide = null;
  if (guideEvalFn) {
    try { baseGuide = guideEvalFn(node.toMove); } catch { baseGuide = null; }
  }

  for (let i = 0; i < node.untried.length; i++) {
    const a = node.untried[i];
    let p = (pi && pi[a] != null) ? Number(pi[a]) : 1;
    if (!Number.isFinite(p) || p <= 0) p = 0.0;

    
    if (a !== ACTION_ENDCHAIN && isCaptureAction(a)) p *= 1.35;

    
    if (guideEvalFn && baseGuide != null && a !== ACTION_ENDCHAIN) {
      const snap = snapshotStateSim();
      applyActionSim(a);
      let g1 = baseGuide;
      try { g1 = guideEvalFn(node.toMove); } catch {}
      restoreSnapshotSim(snap);
      const d = Math.max(-60, Math.min(60, (g1 - baseGuide) || 0));
      
      p *= Math.exp(d / 90);
    }

    priors.set(a, p);
    sum += p;
  }

  if (sum <= 0) {
    const u = 1 / Math.max(1, node.untried.length);
    for (const a of node.untried) priors.set(a, u);
  } else {
    for (const a of node.untried) priors.set(a, priors.get(a) / sum);
  }
  node.priors = priors;

  
  node.untried.sort((a, b) => rolloutMoveScore(b, null, node.priors, guideEvalFn) - rolloutMoveScore(a, null, node.priors, guideEvalFn));
}

function selectMctsAction(store, node, visitedKeys, cPuct, useRave = true) {
  const sqrtN = Math.sqrt(node.visits + 1);
  const actions = [];
  for (const [a, childKey] of node.children.entries()) {
    const child = store.peek(childKey) || store.get(childKey, -node.toMove);
    const qChild = child.visits > 0 ? (child.valueSum / child.visits) : 0;
    const q = (child.toMove === node.toMove) ? qChild : -qChild;

    let qMix = q;
    if (useRave) {
      const rv = node.raveVisits.get(a) || 0;
      if (rv > 0) {
        const rw = node.raveValueSum.get(a) || 0;
        const qRave = rw / rv;
        const beta = rv / (rv + child.visits + 4);
        qMix = (1 - beta) * q + beta * qRave;
      }
    }

    const prior = node.priors ? (node.priors.get(a) || 0) : 0;
    const u = cPuct * prior * (sqrtN / (1 + child.visits));
    let s = qMix + u;

    
    if (visitedKeys && visitedKeys.size > 0) {
      
      if (visitedKeys.has(childKey)) s -= 0.75;
    }
    actions.push({ a, s });
  }
  actions.sort((x, y) => y.s - x.s);
  return actions.map((o) => o.a);
}

function mctsRolloutEval(rootSide, maxPlies, visitedKeys, guideEvalFn = null, traj = null) {
  let prevA = null;
  for (let p = 0; p < maxPlies; p++) {
    const term = simTerminalScore(rootSide);
    if (term != null) return term;

    const { mask } = legalActions();
    const { actions } = listLegalActionsFromMask(mask, { pruneEarlyEndChain: true });
    if (!actions.length) break;

    
    const items = actions.map((a) => ({ a, s: rolloutMoveScore(a, prevA, null, guideEvalFn) }));
    items.sort((x, y) => y.s - x.s);
    const top = items.slice(0, Math.min(6, items.length));

    let chosen = top[(Math.random() * top.length) | 0].a;

    
    let applied = false;
    for (let t = 0; t < top.length; t++) {
      const a = top[t].a;
      const snap = snapshotStateSim();
      const beforeP = Game.player;
      applyActionSim(a);
      const k = zobristKey();
      if (!visitedKeys || !visitedKeys.has(k)) {
        if (visitedKeys) visitedKeys.add(k);
        if (traj) traj.push({ a, p: beforeP });
        prevA = a;
        applied = true;
        
        break;
      }
      restoreSnapshotSim(snap);
      Game.player = beforeP;
    }
    if (!applied) {
      
      const beforeP = Game.player;
      applyActionSim(chosen);
      const k = zobristKey();
      if (visitedKeys) visitedKeys.add(k);
      if (traj) traj.push({ a: chosen, p: beforeP });
      prevA = chosen;
    }
  }
  
  if (!guideEvalFn) return staticEval(rootSide);
  let g = 0;
  try { g = guideEvalFn(rootSide); } catch { g = 0; }
  const h = staticEval(rootSide);
  return 0.65 * g + 0.35 * h;
}

async function mctsScoreActions(side, pi, effMask, sims = 400, capMs = 200) {
  const { mask } = legalActions();
  const useMask = effMask || mask;
  const rootKey = zobristKey();

  const endTs = performance.now() + Math.max(20, capMs || 0);
  const cPuct = 1.25;
  const useRave = true;
  const PW_C = 1.75;
  const PW_A = 0.55;

  
  const root = AI_MCTS.get(rootKey, Game.player);
  initMctsNode(root, pi, useMask, null);
  if (!root.untried || !root.untried.length) return new Map();

  let it = 0;
  while (it++ < sims && performance.now() < endTs) {
    const snapRoot = snapshotStateSim();
    const path = [];
    const traj = []; 
    const visitedKeys = new Set([rootKey]);

    let node = root;

    while (true) {
      const term = simTerminalScore(side);
      if (term != null) {
        
        const vSide = term;
        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          const vNode = (n.toMove === side) ? vSide : -vSide;
          n.visits++;
          n.valueSum += vNode;
        }
        restoreSnapshotSim(snapRoot);
        break;
      }

      
      node = AI_MCTS.get(zobristKey(), Game.player);
      initMctsNode(node, null, null, null);
      path.push(node);

      const allowed = Math.max(1, Math.floor(PW_C * Math.pow(node.visits + 1, PW_A)));
      if (node.untried && node.untried.length && node.children.size < allowed) {
        
        const a = node.untried.shift();
        const beforeP = Game.player;
        applyActionSim(a);
        traj.push({ a, p: beforeP });

        const k = zobristKey();
        if (visitedKeys.has(k)) {
          
          const vSide = 0;
          for (let i = 0; i < path.length; i++) {
            const n = path[i];
            const vNode = (n.toMove === side) ? vSide : -vSide;
            n.visits++;
            n.valueSum += vNode;
          }
          restoreSnapshotSim(snapRoot);
          break;
        }
        visitedKeys.add(k);

        const childKey = k;
        node.children.set(a, childKey);
        
        AI_MCTS.get(childKey, Game.player);
        
        const vSide = mctsRolloutEval(side, 14, visitedKeys, null, traj);

        
        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          const vNode = (n.toMove === side) ? vSide : -vSide;
          n.visits++;
          n.valueSum += vNode;

          
          if (useRave) {
            const seen = new Set();
            for (let t = 0; t < traj.length; t++) {
              const st = traj[t];
              if (st.p !== n.toMove) continue;
              const aa = st.a;
              if (seen.has(aa)) continue;
              seen.add(aa);
              n.raveVisits.set(aa, (n.raveVisits.get(aa) || 0) + 1);
              n.raveValueSum.set(aa, (n.raveValueSum.get(aa) || 0) + vNode);
            }
          }
        }

        restoreSnapshotSim(snapRoot);
        break;
      }

      
      const ordered = selectMctsAction(AI_MCTS, node, visitedKeys, cPuct, useRave);
      if (!ordered.length) {
        
        if (node.untried && node.untried.length) {
          continue;
        }
        
        const vSide = staticEval(side);
        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          const vNode = (n.toMove === side) ? vSide : -vSide;
          n.visits++;
          n.valueSum += vNode;
        }
        restoreSnapshotSim(snapRoot);
        break;
      }

      let moved = false;
      for (let j = 0; j < Math.min(4, ordered.length); j++) {
        const a = ordered[j];
        const snapTry = snapshotStateSim();
        const beforeP = Game.player;
        applyActionSim(a);
        const k = zobristKey();
        if (!visitedKeys.has(k)) {
          visitedKeys.add(k);
          traj.push({ a, p: beforeP });
          moved = true;
          break;
        }
        restoreSnapshotSim(snapTry);
        Game.player = beforeP;
      }
      if (!moved) {
        
        const a = ordered[0];
        const beforeP = Game.player;
        applyActionSim(a);
        traj.push({ a, p: beforeP });
        visitedKeys.add(zobristKey());
      }
    }
  }

  
  const out = new Map();
  for (const a of root.children.keys()) {
    const ck = root.children.get(a);
    const child = AI_MCTS.peek(ck) || AI_MCTS.get(ck, -side);
    const qChild = child.visits > 0 ? (child.valueSum / child.visits) : 0;
    const qSide = (child.toMove === side) ? qChild : -qChild;
    out.set(a, qSide);
  }
  
  return out;
}



async function mauriMctsScoreActions(side, pi, effMask, sims = 650, capMs = 350) {
  const { mask } = legalActions();
  const useMask = effMask || mask;
  const rootKey = zobristKey();

  const endTs = performance.now() + Math.max(20, capMs || 0);
  const cPuct = 1.20;
  const useRave = true;
  const PW_C = 1.85;
  const PW_A = 0.55;

  const root = AI_MCTS_MAURI.get(rootKey, Game.player);
  initMctsNode(root, pi, useMask, getMauritanianScore);
  if (!root.untried || !root.untried.length) return new Map();

  let it = 0;
  while (it++ < sims && performance.now() < endTs) {
    const snapRoot = snapshotStateSim();
    const path = [];
    const traj = [];
    const visitedKeys = new Set([rootKey]);

    let node = root;
    while (true) {
      const term = simTerminalScore(side);
      if (term != null) {
        const vSide = term;
        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          const vNode = (n.toMove === side) ? vSide : -vSide;
          n.visits++;
          n.valueSum += vNode;
        }
        restoreSnapshotSim(snapRoot);
        break;
      }

      node = AI_MCTS_MAURI.get(zobristKey(), Game.player);
      initMctsNode(node, null, null, getMauritanianScore);
      path.push(node);

      const allowed = Math.max(1, Math.floor(PW_C * Math.pow(node.visits + 1, PW_A)));
      if (node.untried && node.untried.length && node.children.size < allowed) {
        const a = node.untried.shift();
        const beforeP = Game.player;
        applyActionSim(a);
        traj.push({ a, p: beforeP });

        const k = zobristKey();
        if (visitedKeys.has(k)) {
          const vSide = 0;
          for (let i = 0; i < path.length; i++) {
            const n = path[i];
            const vNode = (n.toMove === side) ? vSide : -vSide;
            n.visits++;
            n.valueSum += vNode;
          }
          restoreSnapshotSim(snapRoot);
          break;
        }
        visitedKeys.add(k);

        node.children.set(a, k);
        AI_MCTS_MAURI.get(k, Game.player);
        const vSide = mctsRolloutEval(side, 16, visitedKeys, getMauritanianScore, traj);

        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          const vNode = (n.toMove === side) ? vSide : -vSide;
          n.visits++;
          n.valueSum += vNode;

          if (useRave) {
            const seen = new Set();
            for (let t = 0; t < traj.length; t++) {
              const st = traj[t];
              if (st.p !== n.toMove) continue;
              const aa = st.a;
              if (seen.has(aa)) continue;
              seen.add(aa);
              n.raveVisits.set(aa, (n.raveVisits.get(aa) || 0) + 1);
              n.raveValueSum.set(aa, (n.raveValueSum.get(aa) || 0) + vNode);
            }
          }
        }

        restoreSnapshotSim(snapRoot);
        break;
      }

      const ordered = selectMctsAction(AI_MCTS_MAURI, node, visitedKeys, cPuct, useRave);
      if (!ordered.length) {
        if (node.untried && node.untried.length) continue;
        const vSide = mctsRolloutEval(side, 12, visitedKeys, getMauritanianScore, traj);
        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          const vNode = (n.toMove === side) ? vSide : -vSide;
          n.visits++;
          n.valueSum += vNode;
        }
        restoreSnapshotSim(snapRoot);
        break;
      }

      let moved = false;
      for (let j = 0; j < Math.min(4, ordered.length); j++) {
        const a = ordered[j];
        const snapTry = snapshotStateSim();
        const beforeP = Game.player;
        applyActionSim(a);
        const k = zobristKey();
        if (!visitedKeys.has(k)) {
          visitedKeys.add(k);
          traj.push({ a, p: beforeP });
          moved = true;
          break;
        }
        restoreSnapshotSim(snapTry);
        Game.player = beforeP;
      }
      if (!moved) {
        const a = ordered[0];
        const beforeP = Game.player;
        applyActionSim(a);
        traj.push({ a, p: beforeP });
        visitedKeys.add(zobristKey());
      }
    }
  }

  const out = new Map();
  for (const a of root.children.keys()) {
    const ck = root.children.get(a);
    const child = AI_MCTS_MAURI.peek(ck) || AI_MCTS_MAURI.get(ck, -side);
    const qChild = child.visits > 0 ? (child.valueSum / child.visits) : 0;
    const qSide = (child.toMove === side) ? qChild : -qChild;
    out.set(a, qSide);
  }
  return out;
}





function humanSide() {
  if (window.Online && window.Online.isActive)
    return window.Online.mySide;
  return BOT;
}
function aiSide() {
  if (window.Online && window.Online.isActive) return 0;
  return -humanSide();
}




const HM_CAP_LOGIT = 2.5;






const TrainRecorder = (() => {
  const TRAIN_PATH = "trainGamesV3";
  const KEEP_MS = 48 * 60 * 60 * 1000;

  
  const MIN_SAMPLES = 12;
  const MIN_DURATION_MS = 25_000;
  const MAX_DECISIONS_PER_SEC = 3.0;

  let cur = null;

  function bytesToBase64(u8) {
    let s = "";
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(s);
  }

  function nowMs() {
    return Date.now();
  }

  function detectMode() {
    return window.Online && window.Online.isActive ? "online_pvp" : "vs_cpu";
  }

  function ensureGame() {
    if (!cur) {
      cur = {
        schema: 3,
        mode: detectMode(),
        startedAt: nowMs(),
        steps: [],
        samples: [],
        _pendingSteps: [],
        _pendingSamples: [],
        _heldSoufla: null,
        _heldSouflaMeta: null,
        _inForceRewrite: false,
        _moveBoundaries: [],
      };
    }
    return cur;
  }

  function resetGame() {
    cur = null;
  }

  function ensureFirebaseInit() {
    try {
      const fb = window.firebase || (typeof firebase !== "undefined" ? firebase : null);
      if (!fb) return false;

      // If no default app exists, initialize using window.firebaseConfig (provided by js/firebase.config.js).
      if (!fb.apps || !fb.apps.length) {
        const cfg = (window.firebaseConfig && typeof window.firebaseConfig === "object") ? window.firebaseConfig : null;
        if (!cfg || typeof fb.initializeApp !== "function") return false;
        fb.initializeApp(cfg);
      }
      return true;
    } catch (_) {
      return false;
    }
  }


  function packBoard() {
    
    const a = new Int8Array(N_CELLS);
    let o = 0;
    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        a[o++] = Game.board[r][c] | 0;
      }
    }
    return bytesToBase64(new Uint8Array(a.buffer));
  }

  function captureStateForTraining() {
    return {
      b: packBoard(),
      p: Game.player | 0, 
      ic: Game.inChain ? 1 : 0,
      cp: Game.chainPos == null ? -1 : (Game.chainPos | 0),
    };
  }

  function isSquareCapturableBySide(targetIdx, bySide) {
    
    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        const v = Game.board[r][c];
        if (!v) continue;
        if (pieceOwner(v) !== bySide) continue;
        const fromIdx = r * BOARD_N + c;
        const caps = generateCapturesFrom(fromIdx, v);
        for (const cap of caps) {
          const jumpedIdx = cap[1];
          if (jumpedIdx === targetIdx) return true;
        }
      }
    }
    return false;
  }

  function beginDecision({ fromIdx = null, toIdx = null, action = null, actor = null } = {}) {
    const g = ensureGame();
    g.mode = detectMode();

    const side = actor == null ? Game.player : actor;

    
    if (g._inForceRewrite) return null;

    
    if (g.mode === "vs_cpu" && side !== humanSide()) return null;

    return {
      snap: captureStateForTraining(),
      actor: side,
      action: action,
      fromIdx,
      toIdx,
      pieceBefore: fromIdx == null ? null : valueAt(fromIdx),
      tRel: Math.max(0, nowMs() - g.startedAt),
    };
  }

  function endDecision(token, { cap = 0, crown = 0, trap = 0, fromStr = null, toStr = null } = {}) {
    if (!token) return;

    const g = ensureGame();

    
    let crown2 = crown ? 1 : 0;
    try {
      if (!crown2 && token.toIdx != null && token.pieceBefore != null) {
        const afterV = valueAt(token.toIdx);
        const beforeKind = pieceKind(token.pieceBefore);
        const afterKind = pieceKind(afterV);
        if (beforeKind === MAN && afterKind === KING) crown2 = 1;
      }
    } catch {}

    let trap2 = trap ? 1 : 0;
    try {
      if (token.toIdx != null) {
        const afterV = valueAt(token.toIdx);
        const owner = pieceOwner(afterV);
        trap2 = isSquareCapturableBySide(token.toIdx, -owner) ? 1 : 0;
      } else if (Game.chainPos != null) {
        
        trap2 = isSquareCapturableBySide(Game.chainPos, -Game.player) ? 1 : 0;
      }
    } catch {}

    const sample = {
      s: token.snap,
      a: token.action,
      actor: token.actor,
      cap: cap ? 1 : 0,
      crown: crown2,
      trap: trap2,
      t: token.tRel,
      
      sf: 0,
      sfFlags: 0,
      sfDecision: 0,
      Lmax: 0,
      Ls: 0,
      capturesDone: 0,
      sfStartedFrom: -1,
    };
    _ensureTurnBuffers(g);
    g._pendingSamples.push(sample);

    try {
      const f = fromStr != null ? fromStr : (token.fromIdx == null ? "END" : rcStr(token.fromIdx));
      const t = toStr != null ? toStr : (token.toIdx == null ? "END" : rcStr(token.toIdx));
      _ensureTurnBuffers(g);
      g._pendingSteps.push([f, t]);
    } catch {}
  }


  function _ensureTurnBuffers(g) {
    if (!g) return;
    if (!Array.isArray(g._pendingSamples)) g._pendingSamples = [];
    if (!Array.isArray(g._pendingSteps)) g._pendingSteps = [];
  }

  function _buildSouflaMeta(pending, decisionKind) {
    const sf = pending ? 1 : 0;
    const Lmax = pending ? (pending.longestGlobal | 0) : 0;
    const startedFrom = pending && pending.ctxStartedFrom != null ? (pending.ctxStartedFrom | 0) : null;
    const capturesDone = pending ? (pending.capturesDone | 0) : 0;
    const Ls = pending ? (pending.ctxLs | 0) : 0;

    let flags = 0;
    if (pending) {
      
      
      
      
      if (startedFrom == null) flags |= 1;
      if (Lmax > 0 && Ls < Lmax) flags |= 2;
      if (Ls > 0 && capturesDone < Ls) flags |= 4;
    }

    return {
      sf,
      sfFlags: flags | 0,
      sfDecision: decisionKind | 0, 
      Lmax,
      Ls,
      capturesDone,
      sfStartedFrom: startedFrom == null ? -1 : startedFrom,
    };
  }

  function _applyMeta(sample, meta) {
    if (!sample || !meta) return;
    sample.sf = meta.sf | 0;
    sample.sfFlags = meta.sfFlags | 0;
    sample.sfDecision = meta.sfDecision | 0;
    sample.Lmax = meta.Lmax | 0;
    sample.Ls = meta.Ls | 0;
    sample.capturesDone = meta.capturesDone | 0;
    sample.sfStartedFrom = meta.sfStartedFrom | 0;
  }

  function _commitPendingTurn(g, meta) {
    _ensureTurnBuffers(g);
    if (!g._pendingSamples.length) return;

    
    for (const s of g._pendingSamples) _applyMeta(s, meta);

    
    if (!Array.isArray(g.samples)) g.samples = [];
    if (!Array.isArray(g.steps)) g.steps = [];
    
    _pushMoveBoundary(g, { type: "turn", moveIndex: null, by: null });
    g.samples.push(...g._pendingSamples);
    g.steps.push(...g._pendingSteps);

    
    g._pendingSamples.length = 0;
    g._pendingSteps.length = 0;
  }

  function _discardPendingTurn(g) {
    _ensureTurnBuffers(g);
    g._pendingSamples.length = 0;
    g._pendingSteps.length = 0;
  }
  
  
  
  function _pushMoveBoundary(g, meta = null) {
    if (!g) return;
    if (!Array.isArray(g.samples)) g.samples = [];
    if (!Array.isArray(g.steps)) g.steps = [];
    if (!Array.isArray(g._moveBoundaries)) g._moveBoundaries = [];
    g._moveBoundaries.push({
      samplesLen: g.samples.length | 0,
      stepsLen: g.steps.length | 0,
      meta: meta || null,
    });
  }

  function beginMoveBoundary(meta = null) {
    const g = ensureGame();
    _pushMoveBoundary(g, meta);
  }

  function rollbackLastMoveBoundary(match = null) {
    const g = ensureGame();
    if (!g || !Array.isArray(g._moveBoundaries) || !g._moveBoundaries.length) return false;

    // If a matcher is provided, roll back only if the last boundary matches.
    if (match && typeof match === "object") {
      const last = g._moveBoundaries[g._moveBoundaries.length - 1];
      const m = last && last.meta ? last.meta : null;
      if (!m) return false;

      if (match.type != null && m.type !== match.type) return false;
      if (match.moveIndex != null && (m.moveIndex | 0) !== (match.moveIndex | 0)) return false;
    }

    const b = g._moveBoundaries.pop();
    if (!b) return false;

    try {
      if (Array.isArray(g.samples)) g.samples.length = Math.max(0, b.samplesLen | 0);
      if (Array.isArray(g.steps)) g.steps.length = Math.max(0, b.stepsLen | 0);
    } catch {}
    return true;
  }

  
  
  
  
  
  
  const ACTION_SOUFLA_REMOVE = 0;
  const ACTION_SOUFLA_FORCE = BOARD_N * BOARD_N + 1; 

  function recordSouflaPenaltyChoice({ pending = null, kind = null, actor = null } = {}) {
    const g = ensureGame();
    g.mode = detectMode();

    const side = actor == null ? Game.player : actor;

    
    if (g.mode === "vs_cpu" && side !== humanSide()) return;

    
    if (g._inForceRewrite) return;

    const k = kind === "force" ? 2 : (kind === "remove" ? 1 : 0);
    if (!k) return;

    const meta = _buildSouflaMeta(pending, k);
    const st = captureStateForTraining();
    if (!st) return;

    const action = k === 1 ? ACTION_SOUFLA_REMOVE : ACTION_SOUFLA_FORCE;

    const sample = {
      s: st,
      a: action,
      actor: side,
      cap: 0,
      crown: 0,
      trap: 0,
      t: Math.max(0, nowMs() - g.startedAt),

      
      sf: 0,
      sfFlags: 0,
      sfDecision: 0,
      Lmax: 0,
      Ls: 0,
      capturesDone: 0,
      sfStartedFrom: -1,

      
      sfPenaltyChoice: 1,
      sfPenaltyByHuman: 1,
    };
    _applyMeta(sample, meta);

    try {
      if (!Array.isArray(g.samples)) g.samples = [];
      if (!Array.isArray(g.steps)) g.steps = [];      g.samples.push(sample);
      g.steps.push(["SF", k === 1 ? "REM" : "FOR"]);
    } catch {}
  }


  
  function turnEnd({ pending = null } = {}) {
    const g = ensureGame();
    _ensureTurnBuffers(g);

    
    if (g._heldSoufla && !pending) {
      const metaPrev = g._heldSouflaMeta || _buildSouflaMeta(g._heldSoufla, 1);
      _discardPendingTurn(g);
      g._heldSoufla = null;
      g._heldSouflaMeta = null;
      g._inForceRewrite = false;
    }

    if (pending) {
      
      
      _discardPendingTurn(g);
      g._heldSoufla = pending;
      g._heldSouflaMeta = _buildSouflaMeta(pending, 0);
      g._inForceRewrite = false;
      return;
    }

    
    const meta = _buildSouflaMeta(null, 0);
    _commitPendingTurn(g, meta);
    g._heldSoufla = null;
    g._heldSouflaMeta = null;
    g._inForceRewrite = false;
  }

  
  function souflaBeginForce(decision, pending) {
    const g = ensureGame();
    _ensureTurnBuffers(g);
    g._heldSoufla = pending || g._heldSoufla || null;
    g._heldSouflaMeta = _buildSouflaMeta(g._heldSoufla, 2);
    g._inForceRewrite = true;

    
    _discardPendingTurn(g);
  }

  
  function souflaApplied(decision, pending) {
    const g = ensureGame();
    _ensureTurnBuffers(g);
    const held = pending || g._heldSoufla || null;
    const kind = decision && decision.kind === "force" ? 2 : (decision && decision.kind === "remove" ? 1 : 0);

    if (kind === 2) {
      
      return;
    }

    const meta = _buildSouflaMeta(held, kind);
    _discardPendingTurn(g);
    g._heldSoufla = null;
    g._heldSouflaMeta = null;
    g._inForceRewrite = false;
  }

  
  function souflaEndForce(decision, pending) {
    const g = ensureGame();
    _ensureTurnBuffers(g);
    const held = pending || g._heldSoufla || null;
    const meta = _buildSouflaMeta(held, 2);

    _discardPendingTurn(g);
    g._heldSoufla = null;
    g._heldSouflaMeta = null;
    g._inForceRewrite = false;
  }

  function isAcceptableForUpload(record) {
    if (!record) return false;
    if (!record.samples || record.samples.length < MIN_SAMPLES) return false;
    if (!Number.isFinite(record.durationMs) || record.durationMs < MIN_DURATION_MS) return false;

    const sps = record.samples.length / Math.max(1, record.durationMs / 1000);
    if (sps > MAX_DECISIONS_PER_SEC) return false;

    
    if (record.endReason === "disconnect" || record.endReason === "abort" || record.endReason === "cancel") {
      return false;
    }
    return true;
  }


  function _isRegisteredSession() {
    try {
      const s = (window.ZAuth && typeof ZAuth.readSession === "function") ? ZAuth.readSession() : null;
      return !!(s && s.kind === "registered" && s.uid);
    } catch (_) {
      return false;
    }
  }

  function _getRegisteredFirebaseUid() {
    try {
      if (!(window.firebase && firebase.auth)) return null;
      const u = firebase.auth().currentUser;
      if (!u || u.isAnonymous) return null;
      return u.uid ? String(u.uid) : null;
    } catch (_) {
      return null;
    }
  }

  function _dbErrorReason(e) {
    try {
      const _t = (key, vars) => {
        try {
          return (typeof t === "function") ? t(key, vars) : String(key || "");
        } catch (_) {
          return String(key || "");
        }
      };
      const code = (e && (e.code || e.name)) ? String(e.code || e.name).toLowerCase() : "";
      const msg = (e && e.message) ? String(e.message) : "";
      if (code.includes("permission") || msg.toLowerCase().includes("permission")) return _t("errors.db.permission");
      if (code.includes("network") || msg.toLowerCase().includes("network")) return _t("errors.db.network");
      if (code.includes("timeout") || msg.toLowerCase().includes("timeout")) return _t("errors.db.timeout");
      if (code.includes("auth")) return _t("errors.db.auth");
      if (code) return code;
      return null;
    } catch (_) {
      return null;
    }
  }

  async function _recordMatchLogAndStats(record) {

    try {
      try { if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase(); } catch (_) {}

      if (!(window.firebase && firebase.database && firebase.auth)) {
        return { ok: false, reason: "no_firebase" };
      }
      const auth = firebase.auth();
      const db = firebase.database();

      const regUid = _getRegisteredFirebaseUid();
      const hasRegistered = !!regUid || _isRegisteredSession();
      if (!hasRegistered) return { ok: false, reason: "not_registered" };

      const mode = record && record.mode ? record.mode : "unknown";
      const endedAt = Number.isFinite(record.endedAt) ? record.endedAt : nowMs();


      let matchId = null;
      let whiteUid = null;
      let blackUid = null;

      const isOnline = (mode === "online_pvp") && window.Online && window.Online.isActive && window.Online.gameId;
      if (isOnline) {
        matchId = String(window.Online.gameId);
        try {
          const gd = window.Online._lastGameData || null;
          whiteUid = gd && gd.players && gd.players.white && gd.players.white.uid ? String(gd.players.white.uid) : null;
          blackUid = gd && gd.players && gd.players.black && gd.players.black.uid ? String(gd.players.black.uid) : null;
        } catch (_) {}
      } else {

        const u = auth.currentUser;
        if (!u || u.isAnonymous) return { ok: false, reason: "no_user" };
        matchId = `pvc_${u.uid}_${endedAt}`;
      }

      if (!matchId) return { ok: false, reason: "no_match_id" };


      const winner =
        (record && (record.winner === TOP || record.winner === BOT))
          ? record.winner
          : null;


      const res = await _applyMatchStats(db, {
        matchId, mode, endedAt, winner,
        whiteUid, blackUid,
        myUid: regUid,
      });

      if (res && res.ok) return { ok: true };
      return { ok: false, reason: (res && res.reason) ? res.reason : "unknown" };
    } catch (e) {
      return { ok: false, reason: _dbErrorReason(e) || "unknown" };
    }
  }


  
  async function _applyMatchStats(db, { matchId, mode, endedAt, winner, whiteUid = null, blackUid = null, myUid = null } = {}) {
    if (!db || !matchId) return { ok: false, reason: "no_db" };

    const safeReason = (e) => _dbErrorReason(e) || "db_error";
    const endedAtTs = Number.isFinite(endedAt) ? endedAt : Date.now();

    // Temporary operational idempotency marker: prevents double-counting stats on retries.
    // This is NOT a permanent match log and is cleaned by the 6h RTDB maintenance job.
    const MARKER_TTL_MS = 24 * 60 * 60 * 1000; // 24h

    // Global leaderboard entry for GlobalRank computation (spec 3.0.2.8)
    const _lbNum = (v) => (typeof v === "number" && isFinite(v)) ? v : 0;
    const _lbPad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, "0");
    const _lbInv = (n, max) => (max - Math.max(0, Math.floor(n)));

    const _lbSortKey = (uid, points, wins, losses, lastActivity) => {
      // Order (best first): higher points, higher wins, lower losses, then newer activity (as tie-breaker)
      const MAX_P = 999999999;        // 9 digits
      const MAX_W = 999999999;        // 9 digits
      const MAX_T = 9999999999999;    // 13 digits (ms)
      const p = Math.min(_lbNum(points), MAX_P);
      const w = Math.min(_lbNum(wins), MAX_W);
      const l = Math.min(_lbNum(losses), 999999999);
      const t = Math.min(Math.max(0, Math.floor(_lbNum(lastActivity))), MAX_T);

      const invP = _lbInv(p, MAX_P);
      const invW = _lbInv(w, MAX_W);
      const invT = _lbInv(t, MAX_T);

      return (
        _lbPad(invP, 9) + "_" +
        _lbPad(invW, 9) + "_" +
        _lbPad(l, 9) + "_" +
        _lbPad(invT, 13) + "_" +
        String(uid)
      );
    };

    const _upsertLeaderboardV1 = async (uid, stats, endedAtMs) => {
      try {
        if (!uid) return;
        const s = stats || {};
        const points = _lbNum(s.points);
        const wins = _lbNum(s.wins);
        const losses = _lbNum(s.losses);

        const lastActivity = _lbNum(s.updatedAt) || _lbNum(s.lastActiveAt) || _lbNum(endedAtMs) || Date.now();
        const sortKey = _lbSortKey(uid, points, wins, losses, lastActivity);

        await db.ref("leaderboardV1").child(String(uid)).set({
          points: points,
          wins: wins,
          losses: losses,
          lastActivity: lastActivity,
          sortKey: sortKey,
        });
      } catch (_) {
        // best-effort; ignore leaderboard failures
      }
    };

    const _claimMarkerOnce = async (uid) => {
      const ref = db.ref("statsMarkersV1").child(String(uid)).child(String(matchId));
      const tx = await ref.transaction((cur) => {
        if (cur) return; // abort
        return {
          endedAt: endedAtTs,
          purgeAt: endedAtTs + MARKER_TTL_MS,
        };
      });
      return { committed: !!(tx && tx.committed), ref };
    };

    const _rollbackMarker = async (ref) => {
      try { await ref.remove(); } catch (_) {}
    };

    const _bestEffortLeaderboardRefresh = async (uid) => {
      try {
        const s = await db.ref("profiles").child(String(uid)).child("stats").once("value");
        const stats = (s && typeof s.val === "function") ? s.val() : null;
        await _upsertLeaderboardV1(uid, stats || {}, endedAtTs);
      } catch (_) {}
    };

    // PvC (single registered player)
    if (!whiteUid && !blackUid) {
      const u = firebase.auth().currentUser;
      if (!u || u.isAnonymous) return { ok: false, reason: "no_user" };

      const uid = String(u.uid);
      const res = (winner === BOT) ? "win" : (winner === TOP) ? "loss" : "draw";

      // PvC scoring per spec: win +3, draw +1, loss -2, clamp at 0
      const pointsDelta = (res === "win") ? 3 : (res === "draw") ? 1 : -2;

      // Claim idempotency marker first (prevents double-counting)
      let marker = null;
      try {
        marker = await _claimMarkerOnce(uid);
        if (!marker.committed) {
          await _bestEffortLeaderboardRefresh(uid);
          return { ok: true, reason: "already_recorded" };
        }
      } catch (e) {
        return { ok: false, reason: safeReason(e) };
      }

      let statsTx = null;
      try {
        const statsRef = db.ref("profiles").child(uid).child("stats");
        statsTx = await statsRef.transaction((s) => {
          s = s || {};
          const n = (k) => (typeof s[k] === "number" && isFinite(s[k])) ? s[k] : 0;
          const add = (k, v) => { s[k] = n(k) + v; };

          add("played", 1);
          add("totalGames", 1);

          add("vsComputerGames", 1);
          add("vsComputerWins", res === "win" ? 1 : 0);
          add("vsComputerLosses", res === "loss" ? 1 : 0);
          add("vsComputerDraws", res === "draw" ? 1 : 0);

          add("wins", res === "win" ? 1 : 0);
          add("losses", res === "loss" ? 1 : 0);
          add("draws", res === "draw" ? 1 : 0);

          let pts = n("points") + pointsDelta;
          if (pts < 0) pts = 0;
          s.points = pts;

          s.splitV1 = 1;
          s.updatedAt = endedAtTs;
          return s;
        });
      } catch (e) {
        if (marker && marker.ref) await _rollbackMarker(marker.ref);
        return { ok: false, reason: safeReason(e) };
      }

      try {
        const newStats = (statsTx && statsTx.snapshot && typeof statsTx.snapshot.val === "function") ? statsTx.snapshot.val() : null;
        await _upsertLeaderboardV1(uid, newStats || {}, endedAtTs);
      } catch (_) {}

      return { ok: true };
    }

    // Online (2 players): update ONLY the current registered player's stats.
    const au = firebase.auth().currentUser;
    const my = (au && au.uid) || myUid || _getRegisteredFirebaseUid();
    if (!my) return { ok: false, reason: "no_user" };

    const me = String(my);
    const w = whiteUid != null ? String(whiteUid) : null;
    const b = blackUid != null ? String(blackUid) : null;

    let role = null;
    if (w && me === w) role = "white";
    else if (b && me === b) role = "black";
    else return { ok: false, reason: "not_participant" };

    const res =
      (winner == null) ? "draw" :
      (winner === BOT && role === "white") ? "win" :
      (winner === TOP && role === "black") ? "win" :
      "loss";

    // PvP scoring per spec: win +4, draw +2, loss -2, clamp at 0
    const pointsDelta = (res === "win") ? 4 : (res === "draw") ? 2 : -2;

    // Ensure profile exists and likely satisfies validate requirements (e.g., nickname present).
    try {
      const ps = await db.ref("profiles").child(me).once("value");
      const okNick = !!(ps && typeof ps.child === "function" && ps.child("nickname") && typeof ps.child("nickname").exists === "function" && ps.child("nickname").exists());
      const okExists = !!(ps && typeof ps.exists === "function" && ps.exists());
      if (!okExists || !okNick) return { ok: false, reason: "no_profile" };
    } catch (_) {}

    // Claim idempotency marker first (prevents double-counting)
    let marker = null;
    try {
      marker = await _claimMarkerOnce(me);
      if (!marker.committed) {
        await _bestEffortLeaderboardRefresh(me);
        return { ok: true, reason: "already_recorded" };
      }
    } catch (e) {
      return { ok: false, reason: safeReason(e) };
    }

    let statsTx = null;
    try {
      const statsRef = db.ref("profiles").child(me).child("stats");
      statsTx = await statsRef.transaction((s) => {
        s = s || {};
        const n = (k) => (typeof s[k] === "number" && isFinite(s[k])) ? s[k] : 0;
        const add = (k, v) => { s[k] = n(k) + v; };

        add("played", 1);
        add("totalGames", 1);

        add("vsHumansGames", 1);
        add("vsHumansWins", res === "win" ? 1 : 0);
        add("vsHumansLosses", res === "loss" ? 1 : 0);
        add("vsHumansDraws", res === "draw" ? 1 : 0);

        add("wins", res === "win" ? 1 : 0);
        add("losses", res === "loss" ? 1 : 0);
        add("draws", res === "draw" ? 1 : 0);

        let pts = n("points") + pointsDelta;
        if (pts < 0) pts = 0;
        s.points = pts;

        s.splitV1 = 1;
        s.updatedAt = endedAtTs;
        return s;
      });
    } catch (e) {
      if (marker && marker.ref) await _rollbackMarker(marker.ref);
      return { ok: false, reason: safeReason(e) };
    }

    try {
      const newStats = (statsTx && statsTx.snapshot && typeof statsTx.snapshot.val === "function") ? statsTx.snapshot.val() : null;
      await _upsertLeaderboardV1(me, newStats || {}, endedAtTs);
    } catch (_) {}

    return { ok: true };
  }

  async function finalizeAndUpload({ winner = null, endReason = null } = {}) {
    const g = ensureGame();
    const endedAt = nowMs();
    const startedAt = Number.isFinite(g.startedAt) ? g.startedAt : endedAt;
    const durationMs = Math.max(0, endedAt - startedAt);

    const mode = detectMode();

    const record = {
      schema: 3,
      mode,
      startedAt,
      endedAt,
      durationMs,
      winner: winner === TOP ? TOP : (winner === BOT ? BOT : null),
      endReason: endReason || (winner == null ? "draw" : "natural_win"),
      steps: Array.isArray(g.steps) ? g.steps : [],
      samples: Array.isArray(g.samples) ? g.samples : [],
      processed: false,
      purgeAt: endedAt + KEEP_MS,
    };

    let statsRes = null;
    try {
      if (record.endReason !== "disconnect" && record.endReason !== "abort" && record.endReason !== "cancel") {
        statsRes = await _recordMatchLogAndStats(record);
      } else {
        statsRes = { ok: false, reason: `skipped_${record.endReason}` };
      }
    } catch (e) {
      statsRes = { ok: false, reason: _dbErrorReason(e) || "unknown" };
    }

    try {
      if (window.UI && typeof UI.log === "function") {
        const okMsg = t("log.results.savedOk");
        const failMsg = t("log.results.savedFail");
        const skipMsg = t("log.results.skipped");
        if (statsRes && statsRes.ok) UI.log(okMsg);
        else if (statsRes && typeof statsRes.reason === "string" && statsRes.reason.startsWith("skipped_")) UI.log(`${skipMsg} (${statsRes.reason})`);
        else if (statsRes && statsRes.reason) UI.log(`${failMsg} (${statsRes.reason})`);
        else if (statsRes === null) UI.log(`${skipMsg} (no_attempt)`);
        else UI.log(failMsg);
      }
    } catch (_) {}

    const _logLearningUpload = (ok, reason = null) => {
      try {
        if (!(window.UI && typeof UI.log === "function")) return;
        const okMsg = t("log.learning.sentOk");
        const failMsg = t("log.learning.sentFail");
        if (ok) UI.log(okMsg);
        else if (reason) UI.log(`${failMsg} (${reason})`);
        else UI.log(failMsg);
      } catch (_) {}
    };

    if (!isAcceptableForUpload(record)) {
      _logLearningUpload(false, "skipped");
      resetGame();
      return { uploaded: false, skipped: true };
    }

    try {
      const fb = window.firebase || (typeof firebase !== "undefined" ? firebase : null);
      if (!ensureFirebaseInit() || !fb || typeof fb.database !== "function") {
        _logLearningUpload(false, "no_firebase_init");
        resetGame();
        return { uploaded: false, skipped: false, reason: "no_firebase_init" };
      }

      try {
        if (fb.auth) {
          const a = fb.auth();
          if (a && !a.currentUser && typeof a.signInAnonymously === "function") {
            await a.signInAnonymously().catch(() => null);
          }
        }
      } catch (_) {}

      // Auth is best-effort; do not abort upload if auth is unavailable.
      // RTDB rules (if any) will enforce auth requirements.

      const ref = fb.database().ref(TRAIN_PATH).push();
      record.id = ref.key;

      await ref.set(record);

      _logLearningUpload(true);

      resetGame();
      return { uploaded: true, id: record.id };
    } catch (e) {
      console.warn("TrainRecorder upload failed:", e);
      _logLearningUpload(false, _dbErrorReason(e) || "upload_failed");
      resetGame();
      return { uploaded: false, skipped: false, reason: "upload_failed" };
    }
  }

  
  function startNewGame() {
    resetGame();
    ensureGame();
  }

  function recordExternalDecision({ state, action, actor, cap = 0, crown = 0, trap = 0, tRel = null, fromStr = null, toStr = null } = {}) {
    
    const g = ensureGame();
    g.mode = detectMode();
    if (g.mode !== "online_pvp") return;

    if (!state || typeof action !== "number") return;

    const sample = {
      s: state,
      a: action,
      actor: actor == null ? 0 : actor,
      cap: cap ? 1 : 0,
      crown: crown ? 1 : 0,
      trap: trap ? 1 : 0,
      t: Number.isFinite(tRel) ? tRel : Math.max(0, nowMs() - g.startedAt),
      sf: 0,
      sfFlags: 0,
      sfDecision: 0,
      Lmax: 0,
      Ls: 0,
      capturesDone: 0,
      sfStartedFrom: -1,
    };
    g.samples.push(sample);

    try {
      const f = fromStr != null ? fromStr : "UNK";
      const t = toStr != null ? toStr : "UNK";
      g.steps.push([f, t]);
    } catch {}
  }

  return {
    startNewGame,
    beginDecision,
    endDecision,
    finalizeAndUpload,
    captureStateForTraining,
    recordExternalDecision,
    beginMoveBoundary,
    rollbackLastMoveBoundary,
    recordSouflaPenaltyChoice,
    
    turnEnd,
    souflaBeginForce,
    souflaApplied,
    souflaEndForce,
  };
})();







const ONNXCache = (() => {
  const DB_NAME = "onnx_models_cache_v1";
  const STORE = "models";

  function _open() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("idb_open_failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  function _key(kind, version) {
    return String(kind || "").trim() + ":" + String(version || "").trim();
  }

  async function get(kind, version) {
    const db = await _open();
    const k = _key(kind, version);
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const st = tx.objectStore(STORE);
        const req = st.get(k);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error("idb_get_failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  async function put(kind, version, buf) {
    const db = await _open();
    const k = _key(kind, version);
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        const req = st.put(buf, k);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error("idb_put_failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  async function del(key) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        const req = st.delete(String(key));
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error("idb_del_failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  async function keys() {
    const db = await _open();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const st = tx.objectStore(STORE);
        const req = st.getAllKeys();
        req.onsuccess = () => resolve((req.result || []).map(String));
        req.onerror = () => reject(req.error || new Error("idb_keys_failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  async function prune(kind, keepVersions) {
    try {
      const pref = String(kind || "").trim() + ":";
      const ks = await keys();
      for (const k of ks) {
        if (!k.startsWith(pref)) continue;
        const ver = k.slice(pref.length);
        if (!keepVersions.has(String(ver))) {
          try { await del(k); } catch {}
        }
      }
    } catch {}
  }

  return { get, put, prune };
})();






const ModelLog = (() => {
  // We want a single "final status" line per model at page start:
  // newer | noNewer | failedUseCached | noCachedMinimax
  const finalSeen = new Set(); // modelId

  function _tr(key, vars) {
    try {
      if (typeof t === "function") {
        const v = t(key, vars);
        return (v && v !== key) ? v : String(key || "");
      }
      if (typeof window.tr === "function") {
        const v2 = window.tr(key, null, vars);
        return (v2 && v2 !== key) ? v2 : String(key || "");
      }
    } catch {}
    return String(key || "");
  }

  function _label(modelId) {
    const id = String(modelId || "").toLowerCase();
    if (id.includes("human")) return _tr("modelLog.label.human");
    return _tr("modelLog.label.auto");
  }

  function _suffix(kind) {
    if (kind === "newer") return _tr("modelLog.newer");
    if (kind === "noNewer") return _tr("modelLog.noNewer");
    if (kind === "failedUseCached") return _tr("modelLog.failedUseCached");
    if (kind === "noCachedMinimax") return _tr("modelLog.noCachedMinimax");
    return "";
  }

  function _log(msg) {
    try {
      if (window.UI && typeof window.UI.logAIState === "function") {
        window.UI.logAIState(msg);
        return;
      }
      if (window.UI && typeof window.UI.log === "function") {
        window.UI.log(msg);
        return;
      }
    } catch {}

    // UI not ready yet: buffer messages and let UI flush it later.
    try {
      window.__uiLogBuffer = window.__uiLogBuffer || [];
      window.__uiLogBuffer.push(String(msg));
    } catch {}
  }

  function _emitFinal(modelId, kind) {
    const id = String(modelId || "");
    if (!id) return;
    if (finalSeen.has(id)) return;
    finalSeen.add(id);

    const lbl = _label(id);
    const sfx = _suffix(kind);
    const msg = `${lbl}: ${sfx || ""}`.trim();
    if (msg) _log(msg);
  }

  function _noop() {}

  return {
    // Lifecycle logs were causing noisy/duplicated lines; keep log output to one
    // final status line per model.
    loading: _noop,
    ready: _noop,
    failed: _noop,
    off: _noop,

    newerLoaded: (modelId) => _emitFinal(modelId, "newer"),
    noNewerUseCached: (modelId) => _emitFinal(modelId, "noNewer"),
    failedNewerUseCached: (modelId) => _emitFinal(modelId, "failedUseCached"),
    noCachedFallbackMinimax: (modelId) => _emitFinal(modelId, "noCachedMinimax"),
  };
})();
;
;;























const HumanModel = (() => {
  let session = null;
  let readyFlag = false;
  let failedFlag = false;
  let loadPromise = null;
  let currentPtr = null;

  let lastNoCached = false;

  function _humanEnabled() {
    try {
      const adv = Game && Game.settings && Game.settings.advanced ? Game.settings.advanced : {};
      const v = Number(adv.w_human);
      return Number.isFinite(v) ? (v > 0) : true;
    } catch {
      return true;
    }
  }


  function consumeNoCachedFlag() {
    const v = !!lastNoCached;
    lastNoCached = false;
    return v;
  }


  const LOCAL_VER_KEY = "onnx.human_model.version";
  const LEGACY_LOCAL_VER_KEY = "onnx.human.version";

  
  try {
    const cur = localStorage.getItem(LOCAL_VER_KEY);
    if (!cur) {
      const old = localStorage.getItem(LEGACY_LOCAL_VER_KEY);
      if (old) localStorage.setItem(LOCAL_VER_KEY, old);
    }
  } catch {}

  const failedVersions = new Set(); 
  let prefetchDone = false;
  let prefetchPromise = null;

  function setBadge(state) {
    const el = (typeof qs === "function") ? qs("#humanBadge") : document.getElementById("humanBadge");
    if (!el) return;
    if (state === "ready") {
      el.textContent = "✅";
      el.className = "badge ok";
    } else if (state === "loading") {
      el.textContent = "🔄";
      el.className = "badge warn";
    } else if (state === "off") {
      el.textContent = "—";
      el.className = "badge";
    } else {
      el.textContent = "❌";
      el.className = "badge err";
    }
  }

  async function cacheGet(version) {
    const v = String(version || "").trim();
    if (!v) return null;

    
    let buf = null;
    try { buf = await ONNXCache.get(HUMAN_MODEL_ID, v); } catch { buf = null; }

    if (!buf) {
      try {
        const legacy = await ONNXCache.get("human", v);
        if (legacy) {
          buf = legacy;
          try { await ONNXCache.put(HUMAN_MODEL_ID, v, legacy); } catch {}
        }
      } catch {}
    }

    return buf || null;
  }

  async function cachePut(version, buf) {
    const v = String(version || "").trim();
    if (!v) return false;
    try { await ONNXCache.put(HUMAN_MODEL_ID, v, buf); } catch {}
    return true;
  }

  async function cleanupCache(keepVersion) {
    const keep = new Set([String(keepVersion)]);
    try { await ONNXCache.prune(HUMAN_MODEL_ID, keep); } catch {}
    try { await ONNXCache.prune("human", keep); } catch {}
  }

  async function waitFirebaseReady(timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.firebase && firebase.database) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  async function readPtr(path) {
    if (!(window.firebase && firebase.database)) return null;
    try {
      const snap = await firebase.database().ref(path).once("value");
      const v = snap && typeof snap.val === "function" ? snap.val() : null;
      if (!v || !v.version || !v.file) return null;
      return { version: String(v.version), file: String(v.file) };
    } catch {
      return null;
    }
    return null;
  }

  function normalizeHumanFile(file) {
    let f = String(file || "").trim();
    if (!f) return "";

    // Absolute URLs pass through unchanged.
    if (/^https?:\/\//i.test(f)) return f;

    // Normalize leading ./ or /
    if (f.startsWith("./")) f = f.slice(2);
    if (f.startsWith("/")) f = f.slice(1);

    // Legacy path -> current hosted path.
    if (f.startsWith("models/human/")) f = f.replace(/^models\/human\//, "assets/models/human/");

    // If it's just a filename, anchor it into assets/models/human/.
    if (!f.startsWith("assets/")) f = "assets/models/human/" + f.replace(/^\/+/, "");

    // Ensure .onnx extension without breaking query/hash.
    const q = f.indexOf("?");
    const h = f.indexOf("#");
    const cut = (q >= 0 && h >= 0) ? Math.min(q, h) : (q >= 0 ? q : h);
    const base = cut >= 0 ? f.slice(0, cut) : f;
    const tail = cut >= 0 ? f.slice(cut) : "";
    if (!/\.onnx$/i.test(base)) f = base + ".onnx" + tail;

    return assetUrl(f);
  }

  function withVersion(url, version) {
    const u = String(url || "");
    const v = encodeURIComponent(String(version || ""));
    if (!u) return "";
    return `${u}${u.includes("?") ? "&" : "?"}v=${v}`;
  }



  async function createSession(buf) {
    const opts = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    return ort.InferenceSession.create(buf, opts);
  }

  async function ensureCached(ptr) {
    const version = String(ptr?.version || "").trim();
    const baseFile = normalizeHumanFile(ptr?.file || "");
    if (!version || !baseFile) throw new Error("human_ptr_invalid");

    
    let buf = null;
    try { buf = await cacheGet(version); } catch { buf = null; }
    if (buf) return { version, baseFile, buf, downloaded: false };

    
    if (failedVersions.has(version)) throw new Error("human_fetch_blocked");

    const url = withVersion(baseFile, version);
    const resp = await fetch(url, { cache: "force-cache" });
    if (!resp.ok) {
      failedVersions.add(version);
      throw new Error("fetch_failed_" + resp.status);
    }
    buf = await resp.arrayBuffer();

    try { await cachePut(version, buf); } catch {}
    try { localStorage.setItem(LOCAL_VER_KEY, version); } catch {}

    await cleanupCache(version);

    return { version, baseFile, buf, downloaded: true };
  }

  async function prefetchOnce() {
    if (prefetchDone) return;
    if (prefetchPromise) return prefetchPromise;

    prefetchDone = true;

    prefetchPromise = (async () => {
const enabled = _humanEnabled();
try { if (enabled) setBadge("loading"); else setBadge("off"); } catch {}

const ok = await waitFirebaseReady(3000);
if (!ok) {
  // Can't check the remote pointer right now. Use a cached local version if present,
  // otherwise fall back to Minimax and log the final status immediately.
  let localVer = "";
  try { localVer = String(localStorage.getItem(LOCAL_VER_KEY) || "").trim(); } catch { localVer = ""; }
  if (localVer) {
    try {
      const cached = await cacheGet(localVer);
      if (cached) {
        lastNoCached = false;
        try { ModelLog.failedNewerUseCached(HUMAN_MODEL_ID); } catch {}
        try { if (enabled) setBadge("ready"); else setBadge("off"); } catch {}
        return;
      }
    } catch {}
  }

  lastNoCached = true;
      try { ModelLog.noCachedFallbackMinimax(HUMAN_MODEL_ID); } catch {}
      try { if (_humanEnabled()) setBadge("fail"); else setBadge("off"); } catch {}
  try { ModelLog.noCachedFallbackMinimax(HUMAN_MODEL_ID); } catch {}
  try { if (enabled) setBadge("fail"); else setBadge("off"); } catch {}
  return;
}

      const cur = await readPtr("Human-model/current");
      if (!cur) return;

      let localVer = "";
      try { localVer = String(localStorage.getItem(LOCAL_VER_KEY) || "").trim(); } catch { localVer = ""; }

      
      if (localVer && localVer === String(cur.version)) {
        try {
          const cached = await cacheGet(String(cur.version));
          if (cached) {
            lastNoCached = false;
            ModelLog.noNewerUseCached(HUMAN_MODEL_ID);
            return;
            try { if (_humanEnabled()) setBadge("ready"); else setBadge("off"); } catch {}

          }
        } catch {}
      }

      try {
        const res = await ensureCached(cur);
        lastNoCached = false;
        if (res.downloaded) ModelLog.newerLoaded(HUMAN_MODEL_ID);
        else ModelLog.noNewerUseCached(HUMAN_MODEL_ID);
        return;
            try { if (_humanEnabled()) setBadge("ready"); else setBadge("off"); } catch {}

      } catch {}

      
      if (localVer) {
        try {
          const cached = await cacheGet(localVer);
          if (cached) {
            lastNoCached = false;
            ModelLog.failedNewerUseCached(HUMAN_MODEL_ID);
            return;
            try { if (_humanEnabled()) setBadge("ready"); else setBadge("off"); } catch {}

          }
        } catch {}
      }

      lastNoCached = true;
    })().finally(() => {
      prefetchPromise = null;
    });

    return prefetchPromise;
  }

  async function load() {
    if (readyFlag && session) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      setBadge("loading");
      try { ModelLog.loading(HUMAN_MODEL_ID); } catch {}
      readyFlag = false;
      failedFlag = false;

      const ok = await waitFirebaseReady(3000);
      if (!ok) {
        setBadge("off");
        try { ModelLog.off(HUMAN_MODEL_ID); } catch {}
        failedFlag = true;
        throw new Error("human_firebase_unavailable");
      }

      const cur = await readPtr("Human-model/current");
      if (!cur) {
        setBadge("off");
        try { ModelLog.off(HUMAN_MODEL_ID); } catch {}
        failedFlag = true;
        throw new Error("human_ptr_missing");
      }

      let localVer = "";
      try { localVer = String(localStorage.getItem(LOCAL_VER_KEY) || "").trim(); } catch { localVer = ""; }

      let res = null;

      try {
        res = await ensureCached(cur);
        lastNoCached = false;

        if (res.downloaded) ModelLog.newerLoaded(HUMAN_MODEL_ID);
        else ModelLog.noNewerUseCached(HUMAN_MODEL_ID);
      } catch (e) {
        
        if (localVer) {
          try {
            const oldBuf = await cacheGet(localVer);
            if (oldBuf) {
              res = { version: localVer, baseFile: "", buf: oldBuf, downloaded: false };
              lastNoCached = false;
              ModelLog.failedNewerUseCached(HUMAN_MODEL_ID);
            }
          } catch {}
        }

        if (!res) {
          lastNoCached = true;
          setBadge("fail");
        try { ModelLog.failed(HUMAN_MODEL_ID); } catch {}
          failedFlag = true;
          throw e;
        }
      }

      
      try { localStorage.setItem(LOCAL_VER_KEY, String(res.version)); } catch {}
      try { await cleanupCache(res.version); } catch {}

      session = await createSession(res.buf);
      session.__humanVersion = res.version;
      currentPtr = { version: res.version, file: res.baseFile };
      readyFlag = true;
      failedFlag = false;
      setBadge("ready");
      try { ModelLog.ready(HUMAN_MODEL_ID); } catch {}
    })().catch((e) => {
      failedFlag = true;
      readyFlag = false;
      if (String(e?.message || e) === "human_ptr_missing") {
        setBadge("off");
        try { ModelLog.off(HUMAN_MODEL_ID); } catch {}
      } else {
        setBadge("fail");
        try { ModelLog.failed(HUMAN_MODEL_ID); } catch {}
      }
      throw e;
    }).finally(() => {
      loadPromise = null;
    });

    return loadPromise;
  }


  async function policyValue() {
    await load();
    if (!session) throw new Error("No human session");
    const input = encodeState();
    const feeds = { state: input };
    const results = await session.run(feeds);
    let logits = results["policy_value_logits"]?.data;
    const value = results["value"]?.data?.[0];

    
    if (!logits) {
      const fromL = results["from_logits"]?.data;
      const toL = results["to_logits"]?.data;
      const endL = results["end_logit"]?.data || results["end_logits"]?.data;
      if (fromL && toL) {
        const out = new Float32Array(N_ACTIONS);
        for (let fr = 0; fr < N_CELLS; fr++) {
          const lf = fromL[fr] || 0;
          const base = fr * N_CELLS;
          for (let to = 0; to < N_CELLS; to++) out[base + to] = lf + (toL[to] || 0);
        }
        out[ACTION_ENDCHAIN] = endL ? (endL[0] || 0) : 0;
        logits = out;
      }
    }

    return { logits, value };
  }

  function ready() { return readyFlag; }
  function failed() { return failedFlag; }
  function version() { return currentPtr ? String(currentPtr.version || "") : ""; }

  return { load, policyValue, ready, failed, version, prefetchOnce, consumeNoCachedFlag };
})();

const AI = (() => {
  let session = null;
  let readyFlag = false;
  let failedFlag = false;
  let loadPromise = null;
  let currentSig = "";
  let lastNoCached = false;

  function _autoEnabled() {
    try {
      const adv = Game && Game.settings && Game.settings.advanced ? Game.settings.advanced : {};
      const v = Number(adv.w_onnx);
      return Number.isFinite(v) ? (v > 0) : true;
    } catch {
      return true;
    }
  }


  function consumeNoCachedFlag() {
    const v = !!lastNoCached;
    lastNoCached = false;
    return v;
  }


  
  
  
  
  
  
  
  

  const AUTO_VERSION_PATH = assetUrl("assets/models/auto-model.version.txt");
  const LOCAL_VER_KEY = "onnx.auto_model.version";
  const LEGACY_LOCAL_VER_KEY = "onnx.auto.version";

  
  try {
    const cur = localStorage.getItem(LOCAL_VER_KEY);
    if (!cur) {
      const old = localStorage.getItem(LEGACY_LOCAL_VER_KEY);
      if (old) localStorage.setItem(LOCAL_VER_KEY, old);
    }
  } catch {}

  const failedVersions = new Set(); 
  let prefetchDone = false;
  let prefetchPromise = null;
  function _cleanVersionToken(s) {
    
    const t0 = String(s || "").trim();
    if (!t0) return "";
    
    if (t0.length > 64) return "";
    if (!/^[A-Za-z0-9._-]+$/.test(t0)) return "";
    return t0;
  }

  async function versionFromFile() {
    try {
      
      const resp = await fetch(AUTO_VERSION_PATH, { method: "GET", cache: "no-store" });
      if (!resp.ok) return null;
      const txt = await resp.text();
      const tok = _cleanVersionToken(txt);
      return tok || null;
    } catch {
      return null;
    }
  }

  async function resolveRemoteVersion() {
    return (await versionFromFile()) || "static";
  }

  async function cacheGet(ver) {
    const v = String(ver || "").trim();
    if (!v) return null;

    
    let buf = null;
    try { buf = await ONNXCache.get(AUTO_MODEL_ID, v); } catch { buf = null; }

    if (!buf) {
      try {
        const legacy = await ONNXCache.get("auto", v);
        if (legacy) {
          buf = legacy;
          try { await ONNXCache.put(AUTO_MODEL_ID, v, legacy); } catch {}
        }
      } catch {}
    }

    return buf || null;
  }

  async function cachePut(ver, buf) {
    const v = String(ver || "").trim();
    if (!v) return false;
    try { await ONNXCache.put(AUTO_MODEL_ID, v, buf); } catch {}
    return true;
  }

  async function cleanupCache(keepVersions) {
    try { await ONNXCache.prune(AUTO_MODEL_ID, keepVersions); } catch {}
    try { await ONNXCache.prune("auto", keepVersions); } catch {}
  }

  async function createSession(buf) {
    const opts = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    return ort.InferenceSession.create(buf, opts);
  }
  async function ensureCached(ver) {
    const v = String(ver || "static");

    
    let buf = null;
    try { buf = await cacheGet(v); } catch { buf = null; }
    if (buf) return { ver: v, buf, downloaded: false };

    if (failedVersions.has(v)) throw new Error("auto_fetch_blocked");

    const bases = [ONNX_MODEL_PATH, ONNX_MODEL_PATH_LEGACY].filter(Boolean);
    let lastStatus = 0;

    for (const base of bases) {
      const url = `${base}${base.includes("?") ? "&" : "?"}v=${encodeURIComponent(v)}`;
      try {
        const resp = await fetch(url, { cache: "force-cache" });
        lastStatus = resp.status || 0;
        if (!resp.ok) {
          
          if (resp.status === 404) continue;
          failedVersions.add(v);
          throw new Error("fetch_failed_" + resp.status);
        }
        buf = await resp.arrayBuffer();
        try { await cachePut(v, buf); } catch {}
        try { localStorage.setItem(LOCAL_VER_KEY, v); } catch {}
        await cleanupCache(new Set([v]));
        return { ver: v, buf, downloaded: true };
      } catch (e) {
        
        if (base !== bases[bases.length - 1]) continue;
        failedVersions.add(v);
        throw e;
      }
    }

    failedVersions.add(v);
    throw new Error("fetch_failed_" + String(lastStatus || "unknown"));
  }

  async function prefetchOnce() {
    if (prefetchDone) return;
    if (prefetchPromise) return prefetchPromise;
    try { if (_autoEnabled()) setAIBadge("loading"); else setAIBadge("off"); } catch {}


    prefetchDone = true;

    prefetchPromise = (async () => {
      const remoteVer = await resolveRemoteVersion();
      const sig = String(remoteVer || "static");

      let localVer = "";
      try { localVer = String(localStorage.getItem(LOCAL_VER_KEY) || "").trim(); } catch { localVer = ""; }

      
      if (localVer && localVer === sig) {
        try {
          const cached = await cacheGet(sig);
          if (cached) {
            lastNoCached = false;
            ModelLog.noNewerUseCached(AUTO_MODEL_ID);
            return;
            try { if (_autoEnabled()) setAIBadge("ready"); else setAIBadge("off"); } catch {}

          }
        } catch {}
      }

      try {
        const res = await ensureCached(sig);
        lastNoCached = false;
        if (res.downloaded) ModelLog.newerLoaded(AUTO_MODEL_ID);
        else ModelLog.noNewerUseCached(AUTO_MODEL_ID);
        return;
            try { if (_autoEnabled()) setAIBadge("ready"); else setAIBadge("off"); } catch {}

      } catch {}

      
      if (localVer) {
        try {
          const cached = await cacheGet(localVer);
          if (cached) {
            lastNoCached = false;
            ModelLog.failedNewerUseCached(AUTO_MODEL_ID);
            return;
            try { if (_autoEnabled()) setAIBadge("ready"); else setAIBadge("off"); } catch {}

          }
        } catch {}
      }

      lastNoCached = true;
      try { ModelLog.noCachedFallbackMinimax(AUTO_MODEL_ID); } catch {}
      try { if (_autoEnabled()) setAIBadge("fail"); else setAIBadge("off"); } catch {}
    })().finally(() => {
      prefetchPromise = null;
    });

    return prefetchPromise;
  }

  async function load() {
    if (readyFlag && session) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      setAIBadge("loading");
      try { ModelLog.loading(AUTO_MODEL_ID); } catch {}
      readyFlag = false;
      failedFlag = false;

      const remoteVer = await resolveRemoteVersion();
      currentSig = String(remoteVer || "static");

      
      if (session && session.__autoVersion === currentSig) {
        readyFlag = true;
        failedFlag = false;
        setAIBadge("ready");
        try { ModelLog.ready(AUTO_MODEL_ID); } catch {}
        return;
      }

      let localVer = "";
      try { localVer = String(localStorage.getItem(LOCAL_VER_KEY) || "").trim(); } catch { localVer = ""; }

      let res = null;
      try {
        res = await ensureCached(currentSig);
        lastNoCached = false;

        if (res.downloaded) ModelLog.newerLoaded(AUTO_MODEL_ID);
        else ModelLog.noNewerUseCached(AUTO_MODEL_ID);
      } catch (e) {
        
        if (localVer) {
          try {
            const oldBuf = await cacheGet(localVer);
            if (oldBuf) {
              currentSig = localVer;
              res = { ver: localVer, buf: oldBuf, downloaded: false };
              lastNoCached = false;
              ModelLog.failedNewerUseCached(AUTO_MODEL_ID);
              await cleanupCache(new Set([localVer]));
            }
          } catch {}
        }

        if (!res) {
          lastNoCached = true;
          throw e;
        }
      }

      
      try { localStorage.setItem(LOCAL_VER_KEY, String(currentSig)); } catch {}
      try { await cleanupCache(new Set([String(currentSig)])); } catch {}

      session = await createSession(res.buf);
      session.__autoVersion = currentSig;

      readyFlag = true;
      failedFlag = false;
      setAIBadge("ready");
    })()
      .catch((e) => {
        failedFlag = true;
        readyFlag = false;
        setAIBadge("fail");
        try { ModelLog.failed(AUTO_MODEL_ID); } catch {}
        throw e;
      })
      .finally(() => {
        loadPromise = null;
      });

    return loadPromise;
  }

function setAIBadge(state, type = "onnx") {
  // Keep badges independent: ONNX badge tracks the auto model, human badge tracks the human model.
  const id = (type === "human") ? "humanBadge" : "onnxBadge";
  const el = document.getElementById(id);
  if (!el) return;

  if (state === "ready") {
    el.textContent = "✅";
    el.className = "badge ok";
  } else if (state === "loading") {
    el.textContent = "🔄";
    el.className = "badge warn";
  } else if (state === "off") {
    el.textContent = "—";
    el.className = "badge";
  } else {
    // "fail" or any other error state
    el.textContent = "❌";
    el.className = "badge err";
  }
}


  function ready() {
    return readyFlag;
  }
  function failed() {
    return failedFlag;
  }

  function version() {
    return String(currentSig || "");
  }

  function maskPolicy(logits, legal) {
    const out = new Float32Array(logits.length);
    let max = -1e9;
    for (let i = 0; i < logits.length; i++) {
      out[i] = legal[i] ? logits[i] : -1e9;
      if (legal[i] && out[i] > max) max = out[i];
    }
    let sum = 0;
    const probs = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      if (legal[i]) {
        const e = Math.exp(out[i] - max);
        probs[i] = e;
        sum += e;
      } else probs[i] = 0;
    }
    if (sum > 0) {
      for (let i = 0; i < probs.length; i++) probs[i] /= sum;
    }
    return probs;
  }


  function blendPlayerData(pi) {
    const key = stateHash();
    const rec = Game.playerData.policy.get(key);
    if (!rec) return pi;
    const out = new Float32Array(pi.length);
    let sum = 0;
    for (let i = 0; i < pi.length; i++) {
      const v = pi[i] + 0.08 * (rec.visitsByAction?.[i] || 0);
      out[i] = v;
      sum += v;
    }
    if (sum > 0) {
      for (let i = 0; i < out.length; i++) out[i] /= sum;
    }
    return out;
  }

  function stateHash() {
    let s = Game.player === TOP ? "T" : "B";
    for (let r = 0; r < BOARD_N; r++) {
      for (let c = 0; c < BOARD_N; c++) {
        s += "," + Game.board[r][c];
      }
    }
    return s;
  }

  async function policyValue() {
    if (!session) throw new Error("No session");
    const input = encodeState();
    const feeds = { state: input };
    const results = await session.run(feeds);
    const logits = results["policy_value_logits"].data;
    const value = results["value"].data[0];
    return { logits, value };
  }

  async function policyValueHybrid() {
    const w = getActiveWeights();
    const modelTotal = (w.onnx || 0) + (w.human || 0);
    if (modelTotal <= 0) return null;

    let logitsOnnx = null, valueOnnx = 0;
    let logitsHuman = null, valueHuman = 0;

    if (w.onnx > 0) {
      try {
        await load();
        const pv = await policyValue();
        logitsOnnx = pv?.logits || null;
        valueOnnx = Number.isFinite(pv?.value) ? pv.value : 0;
      } catch (_) {
        logitsOnnx = null;
      }
    }

    if (w.human > 0) {
      try {
        await HumanModel.load();
        const pvj = await HumanModel.policyValue();
        logitsHuman = pvj?.logits || null;
        valueHuman = Number.isFinite(pvj?.value) ? pvj.value : 0;
      } catch (_) {
        logitsHuman = null;
      }
    }

    if (!logitsOnnx && !logitsHuman) return null;
    if (logitsOnnx && !logitsHuman) return { logits: logitsOnnx, value: valueOnnx };
    if (logitsHuman && !logitsOnnx) return { logits: logitsHuman, value: valueHuman };

    const denom = Math.max(1e-9, (w.onnx || 0) + (w.human || 0));
    const a = (w.onnx || 0) / denom;
    const b = (w.human || 0) / denom;

    const L = Math.max(logitsOnnx.length, logitsHuman.length);
    const out = new Array(L);
    for (let i = 0; i < L; i++) {
      const lo = logitsOnnx[i] ?? 0;
      const lj = logitsHuman[i] ?? 0;
      out[i] = a * lo + b * lj;
    }

    return { logits: out, value: a * valueOnnx + b * valueHuman };
  }


  function capturesOnlyMask(baseMask) {
    const out = baseMask.slice();
    let anyCap = false;
    for (let from = 0; from < N_CELLS; from++) {
      const v = valueAt(from);
      if (!v || pieceOwner(v) !== Game.player) continue;
      for (let to = 0; to < N_CELLS; to++) {
        const a = encodeAction(from, to);
        if (!baseMask[a]) continue;
        const [isCap] = classifyCapture(from, to);
        if (!isCap) {
          out[a] = false;
        } else {
          anyCap = true;
        }
      }
    }
    if (anyCap) return out;
    return baseMask;
  }

  
  

  function getActiveWeights() {
    Game.normalizeAdvancedSettings();
    const adv = Game.settings.advanced || {};

    const rawThinkMs = Number(adv.thinkTimeMs);
    const rawBoostMs = Number(adv.timeBoostCriticalMs);

    const raw = {
      onnx: clampInt(adv.w_onnx, 0, 10, 0),
      human: clampInt(adv.w_human, 0, 10, 10),
      heur: clampInt(adv.w_heur, 0, 10, 0),
      minimax: clampInt(adv.w_minimax, 0, 10, 0),
      mcts: clampInt(adv.w_mcts, 0, 10, 0),
      mauri: clampInt(adv.w_mauritanian, 0, 10, 0),
    };

    let total = raw.onnx + raw.human + raw.heur + raw.minimax + raw.mcts + raw.mauri;
    if (total <= 0) {
      total = 1;
    }

    return {
      onnx: raw.onnx / total,
      human: raw.human / total,
      heur: raw.heur / total,
      minimax: raw.minimax / total,
      mcts: raw.mcts / total,
      mauri: raw.mauri / total,

      depth: clampInt(adv.minimaxDepth, 1, 10, 3),
      sims: clampInt(adv.mctsSimulations, 10, 5000, 200),

      thinkMs: rawThinkMs === 0 ? Infinity : clampInt(rawThinkMs, 50, 5000, 250),
      boostMs: rawBoostMs === 0 ? Infinity : clampInt(rawBoostMs, 0, 5000, 250),

      rawTotal: total,
      raw,
    };
  }

  async function rescoreAndPick(side, piOnnx, effMask, w = getActiveWeights()) {
    
    
    let ww = w;
    if (ww && ww.mauri > 0) {
      ww = { ...ww, onnx: 0, human: 0, heur: 0, minimax: 0, mcts: 0, mauri: ww.mauri, sims: ww.sims, depth: ww.depth, thinkMs: ww.thinkMs, boostMs: ww.boostMs, rawTotal: ww.rawTotal };
    }
    const { mask } = legalActions();
    const useMask = effMask || mask;

    const actions = [];
    for (let a = 0; a < N_ACTIONS; a++) {
      if (useMask[a]) actions.push(a);
    }
    if (!actions.length) return { action: ACTION_ENDCHAIN, score: -Infinity, debug: {} };

    const critical = detectCriticalState(side);
    const capMs = Math.max(30, (ww.thinkMs || 500) + (critical ? (ww.boostMs || 0) : 0));

    const algoTotal = (ww.minimax || 0) + (ww.mcts || 0);
    const mmMs = ww.minimax > 0 ? (algoTotal > 0 ? Math.max(20, capMs * (ww.minimax / algoTotal)) : capMs) : 0;
    const mctsMs = ww.mcts > 0 ? (algoTotal > 0 ? Math.max(20, capMs * (ww.mcts / algoTotal)) : capMs) : 0;

    let mctsScores = null;
    let minimaxScores = null;

    if (ww.mcts > 0) {
      mctsScores = await mctsScoreActions(side, piOnnx, useMask, ww.sims, mctsMs);
    }
    if (ww.minimax > 0) {
      minimaxScores = await minimaxScoreActions(side, piOnnx, useMask, 8, ww.depth, mmMs);
    }

    const raw = {
      model: new Map(),
      heur: new Map(),
      mm: new Map(),
      mcts: new Map(),
      mauri: new Map(),
    };

    const hasModel = (ww.onnx + ww.human) > 0;
    const hasHeur = ww.heur > 0;
    const hasMauri = ww.mauri > 0;

    
    
        let mauriDeepScores = null;
    if (hasMauri) {

      
      let pieceCount = 0;
      for (let r = 0; r < BOARD_N; r++) {
        for (let c = 0; c < BOARD_N; c++) {
          if (Game.board[r][c]) pieceCount++;
        }
      }
      const nonEndCount = actions.filter((x) => x !== ACTION_ENDCHAIN).length;

      
      const mauriCritical = detectMauritanianCriticalState(side);

      
      let mauriDepth = (pieceCount >= 20) ? 4 : (pieceCount >= 12 ? 5 : 6);
      if (mauriCritical) mauriDepth += 1;
      if (nonEndCount <= 6) mauriDepth += 1;
      mauriDepth = Math.max(3, Math.min(10, mauriDepth));

      
      
      const baseThink = Number.isFinite(ww.thinkMs) ? (ww.thinkMs || 0) : 1500;
      const baseBoost = Number.isFinite(ww.boostMs) ? (ww.boostMs || 0) : 1200;
      const mauriCapMs = Math.max(20, baseThink + (mauriCritical ? baseBoost : 0));

      
      let g0 = 0;
      try { g0 = getMauritanianScore(side) || 0; } catch { g0 = 0; }
      const uncertainty = 1 / (1 + Math.abs(g0) / 20); 

      
      let mauriMs = Math.max(20, Math.min(10000, mauriCapMs));

      let simsPerMs = 1.6 + 0.18 * mauriDepth;
      simsPerMs *= (1 + 0.55 * uncertainty);
      if (mauriCritical) simsPerMs *= 1.25;
      if (pieceCount <= 10) simsPerMs *= 1.15;
      if (nonEndCount <= 6) simsPerMs *= 1.10;

      const mauriSims = Math.max(350, Math.min(25000, Math.round(mauriMs * simsPerMs)));

      
      mauriDeepScores = await mauriMctsScoreActions(side, piOnnx, useMask, mauriSims, mauriMs);
    }

    for (const a of actions) {
      if (hasModel && piOnnx) raw.model.set(a, Number(piOnnx[a] || 0));

      if (a === ACTION_ENDCHAIN) {
        if (hasHeur || hasMauri) {
          const snap = snapshotStateSim();
          applyActionSim(a);
          if (hasHeur) raw.heur.set(a, heuristicEvalBoard(side));
          if (hasMauri) raw.mauri.set(a, (mauriDeepScores && mauriDeepScores.has(a)) ? mauriDeepScores.get(a) : getMauritanianScore(side));
          restoreSnapshotSim(snap);
        }
        continue;
      }

      if (hasHeur || hasMauri) {
        const from = Math.floor(a / N_CELLS);
        const to = a % N_CELLS;
        const snap = simulateApply(from, to);
        if (hasHeur) raw.heur.set(a, heuristicEvalBoard(side));
        if (hasMauri) raw.mauri.set(a, (mauriDeepScores && mauriDeepScores.has(a)) ? mauriDeepScores.get(a) : getMauritanianScore(side));
        undoTo(snap);
      }

      if (minimaxScores && minimaxScores.has(a)) raw.mm.set(a, minimaxScores.get(a));
      if (mctsScores && mctsScores.has(a)) raw.mcts.set(a, mctsScores.get(a));
    }

    const minMaxNorm = (m) => {
      if (!m || m.size === 0) return new Map();
      let mn = Infinity, mx = -Infinity;
      for (const v of m.values()) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const out = new Map();
      const denom = mx - mn;
      for (const [k, v] of m.entries()) {
        out.set(k, denom > 1e-12 ? (v - mn) / denom : 0.5);
      }
      return out;
    };

    const nModel = minMaxNorm(raw.model);
    const nHeur = minMaxNorm(raw.heur);
    const nMM = minMaxNorm(raw.mm);
    const nMCTS = minMaxNorm(raw.mcts);
    const nMauri = minMaxNorm(raw.mauri);

    let bestA = actions[0];
    let bestScore = -Infinity;

    for (const a of actions) {
      const sModel = hasModel ? (nModel.get(a) ?? 0) : 0;
      const sHeur = hasHeur ? (nHeur.get(a) ?? 0) : 0;
      const sMM = ww.minimax > 0 ? (nMM.get(a) ?? 0) : 0;
      const sMCTS = ww.mcts > 0 ? (nMCTS.get(a) ?? 0) : 0;
      const sMauri = hasMauri ? (nMauri.get(a) ?? 0) : 0;

      const score =
        sModel * (ww.onnx + ww.human) +
        sHeur * ww.heur +
        sMM * ww.minimax +
        sMCTS * ww.mcts +
        sMauri * ww.mauri;

      if (score > bestScore) {
        bestScore = score;
        bestA = a;
      }
    }

    return {
      action: bestA,
      score: bestScore,
      debug: {
        capMs,
        critical,
        rawTotal: ww.rawTotal,
      },
    };
  }

  async function decideAction() {
    
    
    simEnter();
    try {
    if (Game.forcedEnabled && Game.forcedPly < 10) {
      const step = Game.forcedSeq[Game.forcedPly];
      return encodeAction(
        rcToIdx(step[0][0], step[0][1]),
        rcToIdx(step[1][0], step[1][1])
      );
    }

    const { mask } = legalActions();
    const legal = new Array(N_ACTIONS).fill(false);
    for (let i = 0; i < N_ACTIONS; i++) legal[i] = !!mask[i];

    const allMask = legal.slice();
    let captureMask = null;

    const tmpCap = capturesOnlyMask(allMask.slice());
    const hasCaptures = tmpCap.some((v) => !!v);

    if (hasCaptures) {
      captureMask = tmpCap;

      if (Game.settings.aiCaptureMode === "mandatory") {
        if (Game.inChain && Game.chainPos != null) {
          for (let a = 0; a < N_ACTIONS; a++) {
            if (!captureMask[a]) continue;
            if (a === ACTION_ENDCHAIN) continue;
            const from = Math.floor(a / N_CELLS);
            if (from !== Game.chainPos) captureMask[a] = false;
          }

          const L = maxCaptureLenFrom(Game.chainPos);
          if (L > 0) {
            const allowed = new Set();
            const paths = longestPathsWithJumpsFrom(Game.chainPos, L);
            for (const o of paths) {
              if (o.path[0] != null) allowed.add(encodeAction(Game.chainPos, o.path[0]));
            }
            for (let a = 0; a < N_ACTIONS; a++) {
              if (captureMask[a] && a !== ACTION_ENDCHAIN && !allowed.has(a)) captureMask[a] = false;
            }
          }
        } else {
          const longest = computeLongestForPlayer(Game.player);
          if (longest.Lmax > 0) {
            const allowedFirst = new Set();
            for (const fromIdx of longest.candidates) {
              const paths = longestPathsWithJumpsFrom(fromIdx, longest.Lmax);
              for (const o of paths) {
                if (o.path[0] != null) allowedFirst.add(encodeAction(fromIdx, o.path[0]));
              }
            }
            for (let a = 0; a < N_ACTIONS; a++) {
              if (captureMask[a] && a !== ACTION_ENDCHAIN && !allowedFirst.has(a)) captureMask[a] = false;
            }
          }
        }
      }
    }

    let piAll = null;
    let piCap = null;

    const w = getActiveWeights();
    let wEff = w;
    if (w.onnx > 0 || w.human > 0) {
      try {
        const pv = await policyValueHybrid();
        if (!pv || !pv.logits) throw new Error("model_logits_missing");
        const logits = pv.logits;
        piAll = blendPlayerData(maskPolicy(logits, allMask));
        piCap = captureMask ? blendPlayerData(maskPolicy(logits, captureMask)) : null;
      } catch (e) {
        piAll = new Float32Array(N_ACTIONS).fill(1.0);
        piCap = captureMask ? new Float32Array(N_ACTIONS).fill(1.0) : null;

        
        
        const raw = (w && w.raw) ? w.raw : {};
        const modelRawSum = (raw.onnx || 0) + (raw.human || 0);
        const otherRawSum =
          (raw.heur || 0) + (raw.minimax || 0) + (raw.mcts || 0) + (raw.mauri || 0);

        if (modelRawSum > 0 && otherRawSum === 0) {
          wEff = { ...w, onnx: 0, human: 0, heur: 0, minimax: 1, mcts: 0, mauri: 0, depth: 3, rawTotal: 1 };
          try {
            const na = (AI && typeof AI.consumeNoCachedFlag === "function") ? AI.consumeNoCachedFlag() : false;
            if (na) ModelLog.noCachedFallbackMinimax(AUTO_MODEL_ID);
          } catch {}
          try {
            const nh = (HumanModel && typeof HumanModel.consumeNoCachedFlag === "function") ? HumanModel.consumeNoCachedFlag() : false;
            if (nh) ModelLog.noCachedFallbackMinimax(HUMAN_MODEL_ID);
          } catch {}
        }
      }
    } else {
      piAll = new Float32Array(N_ACTIONS).fill(1.0);
      piCap = captureMask ? new Float32Array(N_ACTIONS).fill(1.0) : null;
    }

if (Game.settings.aiCaptureMode === "mandatory" && captureMask) {
      const best = await rescoreAndPick(Game.player, piCap || piAll, captureMask, wEff);
      return best.action;
    }

    if (Game.settings.aiCaptureMode === "random" && captureMask) {
      const pct = clampInt(Game.settings.aiRandomIgnoreCaptureRatePct, 0, 100, 12);
      const rate = pct / 100;

      const bestCap = await rescoreAndPick(Game.player, piCap || piAll, captureMask, wEff);

      if (rate > 1e-9 && Math.random() < rate) {
        const nonCapMask = new Array(N_ACTIONS);
        for (let a = 0; a < N_ACTIONS; a++) nonCapMask[a] = !!allMask[a];

        for (let a = 0; a < N_ACTIONS; a++) {
          if (captureMask[a] && a !== ACTION_ENDCHAIN) nonCapMask[a] = false;
        }

        let any = false;
        for (let a = 0; a < N_ACTIONS; a++) {
          if (nonCapMask[a]) {
            any = true;
            break;
          }
        }

        if (any) {
          const bestNon = await rescoreAndPick(Game.player, piAll, nonCapMask, wEff);
          return bestNon.action;
        }
      }

      return bestCap.action;
    }

    const best = await rescoreAndPick(Game.player, piAll, allMask, wEff);
    return best.action;
    } finally {
      simExit();
    }
  }


  async function play() {
    if (Game.gameOver || Game.awaitingPenalty) return;
    if (Game.player !== aiSide()) return;
    const a = await decideAction();
    if (a === ACTION_ENDCHAIN) {
      finishAIChainEndTurn();
      return;
    }
    const from = Math.floor(a / N_CELLS),
      to = a % N_CELLS;
    const [isCap, jumped] = classifyCapture(from, to);
    if (isCap) {
      const preSnap = snapshotState();

      applyMove(from, to, true, jumped);
      if (!Turn.ctx) Turn.start();
      Turn.beginCapture(from);
      Turn.recordCapture();
      Game.inChain = true;
      Game.chainPos = to;
      Game.lastMovedTo = to;
      Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
      UI.log(
        `${nowHHMMSS()} ${t("log.jump")}: ${rcStr(from)}→${rcStr(
          to
        )}, ${t("log.remove")} ${rcStr(jumped)} (${sideLabel(
          aiSide()
        )})`
      );

      if (Game.settings.aiCaptureMode === "mandatory") {
        const keep = snapshotState();
        restoreSnapshotSilent(preSnap);
        const longest0 = computeLongestForPlayer(Game.player);
        const Lmax0 = longest0.longestByPiece.get(from) || 0;
        const fullPaths0 =
          Lmax0 > 0 ? longestPathsWithJumpsFrom(from, Lmax0) : [];
        let chosen0 =
          fullPaths0.find((p) => p.path && p.path.length && p.path[0] === to) ||
          fullPaths0.find((p) => p.path && p.path[0] === to) ||
          null;
        restoreSnapshotSilent(keep);

        if (chosen0) {
          let cur = to;
          for (let k = 1; k < chosen0.path.length; k++) {
            const nxt = chosen0.path[k];
            const [ic2, jp2] = classifyCapture(cur, nxt);
            if (!ic2 || jp2 == null) break;
            applyMove(cur, nxt, true, jp2);
            Turn.recordCapture();

            Game.lastMovedFrom = cur;
            Game.lastMovedTo = nxt;
            Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
            cur = nxt;
          }
        }
        finishAIChainEndTurn();
      }
      else {
        const caps = generateCapturesFrom(to, valueAt(to));
        if (caps.length === 0) {
          finishAIChainEndTurn();
        } else {
          let guard = 12;
          while (guard-- > 0) {
            const { mask } = legalActions();
            const options = [];
            for (let i = 0; i < N_ACTIONS; i++) {
              if (!mask[i] || i === ACTION_ENDCHAIN) continue;
              const fr = Math.floor(i / N_CELLS),
                tt = i % N_CELLS;
              if (fr !== Game.chainPos) continue;
              const [ic] = classifyCapture(fr, tt);
              if (ic) options.push(i);
            }
            if (!options.length) break;
            const next =
              options[Math.floor(Math.random() * options.length)];
            const nf = Math.floor(next / N_CELLS),
              nt = next % N_CELLS;
            const [ic, jp] = classifyCapture(nf, nt);
            if (!ic) break;
            applyMove(nf, nt, true, jp);
            Turn.recordCapture();
            Game.chainPos = nt;
            Game.lastMovedTo = nt;
            Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);
          }
          finishAIChainEndTurn();
        }
      }
    } else {
      applyMove(from, to, false, null);
      Visual.setLastMovePath(Game.lastMoveFrom, Game.lastMovePath);

      UI.log(
        `${nowHHMMSS()} ${t("log.move")}: ${rcStr(
          from
        )}→${rcStr(to)} (${sideLabel(aiSide())})`
      );

      Turn.finishTurnAndSoufla();
    }
    Visual.draw();
  }
  function finishAIChainEndTurn() {
    maybeQueueDeferredPromotion(Game.chainPos ?? Game.lastMovedTo);

    Game.inChain = false;
    Game.chainPos = null;
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


  async function pickSouflaDecision(pending) {
    
    
    

    const keepOuter = snapshotState();

    function sideHasAnyCapture(side) {
      for (let idx = 0; idx < N_CELLS; idx++) {
        const v = valueAt(idx);
        if (!v || pieceOwner(v) !== side) continue;
        const caps = generateCapturesFrom(idx, v);
        if (caps && caps.length) return true;
      }
      return false;
    }

    function isSquareCapturableBy(attackerSide, targetIdx) {
      for (let idx = 0; idx < N_CELLS; idx++) {
        const v = valueAt(idx);
        if (!v || pieceOwner(v) !== attackerSide) continue;
        const caps = generateCapturesFrom(idx, v);
        for (const [_to, jumped] of caps) {
          if (jumped === targetIdx) return true;
        }
      }
      return false;
    }

    function maxCaptureLenForSide(side) {
      let best = 0;
      for (let idx = 0; idx < N_CELLS; idx++) {
        const v = valueAt(idx);
        if (!v || pieceOwner(v) !== side) continue;
        const L = maxCaptureLenFrom(idx);
        if (L > best) best = L;
        if (best >= 2) return best;
      }
      return best;
    }

    function canCaptureOppKingNext(side) {
      const opp = -side;
      for (let idx = 0; idx < N_CELLS; idx++) {
        const v = valueAt(idx);
        if (!v || pieceOwner(v) !== side) continue;
        const caps = generateCapturesFrom(idx, v);
        for (const [_to, jumped] of caps) {
          if (jumped == null) continue;
          const jv = valueAt(jumped);
          if (jv && pieceOwner(jv) === opp && pieceKind(jv) === KING) return true;
        }
      }
      return false;
    }

    function canCrownNext(side) {
      const hasCap = sideHasAnyCapture(side);
      for (let idx = 0; idx < N_CELLS; idx++) {
        const v0 = valueAt(idx);
        if (!v0 || pieceOwner(v0) !== side) continue;
        if (pieceKind(v0) !== MAN) continue;

        if (!hasCap) {
          for (const to of generateStepsFrom(idx, v0)) {
            if (isBackRank(to, side)) return true;
          }
        }

        const keep = cloneBoard(Game.board);
        try {
          function dfs(curIdx, v) {
            const caps = generateCapturesFrom(curIdx, v);
            for (const [toIdx, jumped] of caps) {
              if (jumped == null) continue;
              const [jr, jc] = idxToRC(jumped);
              const [r1, c1] = idxToRC(curIdx);
              const [r2, c2] = idxToRC(toIdx);

              const keep2 = cloneBoard(Game.board);
              Game.board[r1][c1] = 0;
              Game.board[jr][jc] = 0;
              Game.board[r2][c2] = v;

              if (isBackRank(toIdx, side)) return true;
              if (dfs(toIdx, v)) return true;

              Game.board = keep2;
            }
            return false;
          }
          if (dfs(idx, v0)) return true;
        } finally {
          Game.board = keep;
        }
      }
      return false;
    }

    function canApproachCrownSafely(side) {
      const opp = -side;
      const backRow = side === TOP ? 8 : 0;
      const hasCap = sideHasAnyCapture(side);

      for (let idx = 0; idx < N_CELLS; idx++) {
        const v0 = valueAt(idx);
        if (!v0 || pieceOwner(v0) !== side) continue;
        if (pieceKind(v0) !== MAN) continue;

        
        {
          const [r0] = idxToRC(idx);
          const dist0 = Math.abs(backRow - r0);
          if (dist0 <= 2 && !isSquareCapturableBy(opp, idx)) return true;
        }

        
        if (!hasCap) {
          for (const to of generateStepsFrom(idx, v0)) {
            const [r1] = idxToRC(to);
            const dist1 = Math.abs(backRow - r1);
            if (dist1 <= 2 && !isSquareCapturableBy(opp, to)) return true;
          }
        }

        
        for (const [to, _jumped] of generateCapturesFrom(idx, v0)) {
          const [r1] = idxToRC(to);
          const dist1 = Math.abs(backRow - r1);
          if (dist1 <= 2 && !isSquareCapturableBy(opp, to)) return true;
        }
      }
      return false;
    }

    function benefitVector(side) {
      const capLen = maxCaptureLenForSide(side);
      const kingCap = canCaptureOppKingNext(side);
      const crown = canCrownNext(side);
      const approach = canApproachCrownSafely(side);
      const cap2 = capLen >= 2;
      return { capLen, cap2, kingCap, crown, approach };
    }

    function benefitScore(v) {
      let s = 0;
      if (v.kingCap) s += 100;
      if (v.crown) s += 80;
      if (v.cap2) s += 60 + Math.max(0, (v.capLen | 0) - 2) * 5;
      if (v.approach) s += 40;
      return s;
    }

    async function policyValueForCurrentPlayer() {
      try {
        const { value } = await policyValueHybrid();
        return value;
      } catch {
        let my = 0, opp = 0;
        for (let r = 0; r < BOARD_N; r++) {
          for (let c = 0; c < BOARD_N; c++) {
            const v = Game.board[r][c];
            if (!v) continue;
            const owner = pieceOwner(v);
            const kind = pieceKind(v);
            const w = kind === KING ? 3 : 1;
            if (owner === Game.player) my += w;
            else opp += w;
          }
        }
        return my - opp;
      }
    }

    
    
    
    let bestRemove = null;
    let bestRemoveVal = -Infinity;
    let bestRemoveBenefit = -Infinity;

    for (const decision of pending.options) {
      if (!decision || decision.kind !== "remove") continue;
      simEnter();
      const keep = snapshotState();
      try {
        restoreSnapshotSilent(pending.turnStartSnapshot);

        let removeIdx = decision.offenderIdx;
        if (
          pending.startedFrom === decision.offenderIdx &&
          pending.lastPieceIdx != null
        ) {
          removeIdx = pending.lastPieceIdx;
        }
        setValueAt(removeIdx, 0);

        Game.player = pending.penalizer;

        const bv = benefitVector(pending.penalizer);
        const bScore = benefitScore(bv);
        const val = await policyValueForCurrentPlayer();

        
        if (val > bestRemoveVal || (val === bestRemoveVal && bScore > bestRemoveBenefit)) {
          bestRemoveVal = val;
          bestRemove = decision;
          bestRemoveBenefit = bScore;
        }
      } finally {
        restoreSnapshotSilent(keep);
        simExit();
      }
    }

    
    if (!bestRemove) {
      bestRemove = pending.options.find((o) => o.kind === "remove") || pending.options[0];
      bestRemoveBenefit = 0;
      bestRemoveVal = -Infinity;
    }

    
    
    
    
    let bestForce = null;
    let bestForceBenefit = -Infinity;
    let bestForceVal = -Infinity;

    for (const decision of pending.options) {
      if (!decision || decision.kind !== "force") continue;
      simEnter();
      const keep = snapshotState();
      try {
        restoreSnapshotSilent(pending.turnStartSnapshot);

        const from = decision.offenderIdx;
        let cur = from;
        for (const to of decision.path || []) {
          const [isCap, jumped] = classifyCapture(cur, to);
          if (!isCap || jumped == null) break;
          applyMove(cur, to, true, jumped);
          cur = to;
        }

        Game.player = pending.penalizer;

        const bv = benefitVector(pending.penalizer);
        const bScore = benefitScore(bv);

        
        if (bScore <= bestRemoveBenefit) {
          continue;
        }

        
        if (!bv.cap2 && !bv.crown && !bv.approach && !bv.kingCap) {
          continue;
        }

        const val = await policyValueForCurrentPlayer();

        
        if (bScore > bestForceBenefit || (bScore == bestForceBenefit && val > bestForceVal)) {
          bestForceBenefit = bScore;
          bestForceVal = val;
          bestForce = decision;
        }
      } finally {
        restoreSnapshotSilent(keep);
        simExit();
      }
    }

    restoreSnapshotSilent(keepOuter);

    return bestForce || bestRemove || pending.options[0];
  }

  function scheduleMove() {
    const adv = Game.settings?.advanced || {};
    const base = adv.thinkTimeMs || 0;

    let extra = 0;
    if (detectCriticalState(Game.player)) {
      extra = adv.timeBoostCriticalMs || 0;
    }

    const total = Math.max(0, base + extra);
    if (total <= 0) play();
    else setTimeout(play, total);
  }
  return {
    load,
    ready,
    failed,
    prefetchOnce,
    consumeNoCachedFlag,
    scheduleMove,
    pickSouflaDecision,
  };
})();


