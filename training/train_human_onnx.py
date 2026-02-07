# Section: training/train_human_onnx.py — Python utility script

















from __future__ import annotations

import argparse
import base64
import dataclasses
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


import torch
import torch.nn as nn
import torch.nn.functional as F
import onnx






BOARD_N = 9
N_CELLS = BOARD_N * BOARD_N
ACTION_ENDCHAIN = N_CELLS * N_CELLS  
N_ACTIONS = ACTION_ENDCHAIN + 1      

# RTDB model pointers (spec: Human-model/current & Human-model/previous)
RTDB_HUMAN_PTR_CURRENT = "Human-model/current"
RTDB_HUMAN_PTR_PREVIOUS = "Human-model/previous"



TOP = +1
BOT = -1
MAN = 1
KING = 2


DIAG_A_SEGMENTS = [
    [[0, 2], [2, 0]],
    [[0, 4], [4, 0]],
    [[0, 6], [6, 0]],
    [[0, 8], [8, 0]],
    [[2, 8], [8, 2]],
]
DIAG_B_SEGMENTS = [
    [[0, 6], [2, 8]],
    [[0, 4], [4, 8]],
    [[0, 2], [6, 8]],
    [[0, 0], [8, 8]],
    [[2, 0], [8, 6]],
]


def _build_segments(seg_list, diag_dir: str) -> List[List[Tuple[int, int]]]:
    lines: List[List[Tuple[int, int]]] = []
    for a, b in seg_list:
        (r0, c0), (r1, c1) = a, b
        dr = 1
        dc = -1 if diag_dir == "A" else +1
        line: List[Tuple[int, int]] = []
        r, c = r0, c0
        while True:
            line.append((r, c))
            if r == r1 and c == c1:
                break
            r += dr
            c += dc
        lines.append(line)
    return lines



def _make_masks() -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:

    is_in_a = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)
    is_in_b = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)

    for line in _build_segments(DIAG_A_SEGMENTS, "A"):
        for r, c in line:
            is_in_a[r, c] = True
    for line in _build_segments(DIAG_B_SEGMENTS, "B"):
        for r, c in line:
            is_in_b[r, c] = True

    is_wide = np.logical_or(is_in_a, is_in_b)

    back_top = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)
    back_bot = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)
    corners = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)
    eyes = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)
    midback = np.zeros((BOARD_N, BOARD_N), dtype=np.bool_)

    back_top[0, :] = True
    back_bot[8, :] = True

    for r, c in [(0, 0), (0, 8), (8, 0), (8, 8)]:
        corners[r, c] = True
    for r, c in [(0, 2), (0, 6), (8, 2), (8, 6)]:
        eyes[r, c] = True
    for r, c in [(0, 4), (8, 4)]:
        midback[r, c] = True

    return is_wide, back_top, back_bot, corners, eyes, midback


IS_WIDE, MASK_BACK_TOP, MASK_BACK_BOT, MASK_CORNERS, MASK_EYES, MASK_MIDBACK = _make_masks()






class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)


class ZamatNet(nn.Module):
    def __init__(self, in_channels: int = 12, channels: int = 64, num_blocks: int = 4, n_actions: int = N_ACTIONS):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(in_channels, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
        )
        self.blocks = nn.Sequential(*[ResidualBlock(channels) for _ in range(num_blocks)])
        self.policy = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False),
            nn.BatchNorm2d(2),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(2 * BOARD_N * BOARD_N, n_actions),
        )
        self.value_head = nn.Sequential(
            nn.Conv2d(channels, 1, 1, bias=False),
            nn.BatchNorm2d(1),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(1 * BOARD_N * BOARD_N, channels),
            nn.ReLU(inplace=True),
            nn.Linear(channels, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        h = self.stem(x)
        h = self.blocks(h)
        logits = self.policy(h)
        value = self.value_head(h)
        return logits, value.squeeze(-1)


def export_onnx_model(net: ZamatNet, path: Path, opset_version: int = 14) -> None:
    net_cpu = net.to("cpu").eval()
    dummy = torch.zeros((1, 12, 9, 9), dtype=torch.float32)
    path.parent.mkdir(parents=True, exist_ok=True)


    with torch.inference_mode():
        try:
            torch.onnx.export(
                net_cpu,
                dummy,
                str(path),
                input_names=["state"],
                output_names=["policy_value_logits", "value"],
                opset_version=opset_version,
                export_params=True,
                do_constant_folding=True,
                dynamic_axes={
                    "state": {0: "batch"},
                    "policy_value_logits": {0: "batch"},
                    "value": {0: "batch"},
                },
            )
            
        except Exception:
            torch.onnx.export(
                net_cpu,
                dummy,
                str(path),
                input_names=["state"],
                output_names=["policy_value_logits", "value"],
                opset_version=opset_version,
                export_params=True,
                do_constant_folding=True,
            )
    try:
        model = onnx.load(str(path))
        onnx.save_model(model, str(path), save_as_external_data=False)
        print(f"[export] Fixed: Model saved as a single self-contained file: {path.name}")
    except Exception as e:
        print(f"[export] Error during re-saving: {e}")







def _firebase_connect():








    db_url = os.environ.get("FIREBASE_DATABASE_URL", "").strip()
    if not db_url:
        raise RuntimeError("Missing env FIREBASE_DATABASE_URL")

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if sa_json:
        import firebase_admin
        from firebase_admin import credentials, db
        if not firebase_admin._apps:
            cred = credentials.Certificate(json.loads(sa_json))
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        return db


    secret = os.environ.get("FIREBASE_DB_SECRET", "").strip()
    if not secret:
        raise RuntimeError("Provide FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_DB_SECRET")

    import requests  
    return None  



def _rest_url(path: str) -> str:
    base_url = os.environ["FIREBASE_DATABASE_URL"].rstrip("/")
    secret = os.environ["FIREBASE_DB_SECRET"]
    p = (path or "").strip("/")
    if p:
        return f"{base_url}/{p}.json?auth={secret}"
    return f"{base_url}/.json?auth={secret}"

def _rtdb_rest_get(path: str) -> Dict[str, Any]:
    import requests
    url = _rest_url(path)
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def _rtdb_rest_patch(path: str, payload: Dict[str, Any]) -> None:
    import requests
    url = _rest_url(path)
    r = requests.patch(url, json=payload, timeout=60)
    r.raise_for_status()


def _rtdb_rest_put(path: str, payload: Any) -> None:
    import requests
    url = _rest_url(path)
    r = requests.put(url, json=payload, timeout=60)
    r.raise_for_status()


def _rtdb_rest_delete(path: str) -> None:
    import requests
    url = _rest_url(path)
    r = requests.delete(url, timeout=60)
    r.raise_for_status()






@dataclasses.dataclass
class Sample:
    x: np.ndarray          
    a: int                 
    v: float               
    w: float               


def _decode_board_b64(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64.encode("ascii"))

    arr_u8 = np.frombuffer(raw, dtype=np.uint8, count=N_CELLS)
    arr_i8 = arr_u8.view(np.int8).astype(np.int16)
    board = arr_i8.reshape((BOARD_N, BOARD_N))
    return board



def _encode_state(snap: Dict[str, Any]) -> np.ndarray:















    b64 = snap.get("b", "")
    board = _decode_board_b64(b64)
    cur = int(snap.get("p", 0)) or TOP
    in_chain = int(snap.get("ic", 0)) == 1
    cp = int(snap.get("cp", -1))

    planes = np.zeros((12, BOARD_N, BOARD_N), dtype=np.float32)

    for r in range(BOARD_N):
        for c in range(BOARD_N):
            v = int(board[r, c])
            if v == 0:
                continue
            owner = TOP if v > 0 else BOT
            kind = KING if abs(v) == 2 else MAN
            if owner == cur:
                planes[0 if kind == MAN else 1, r, c] = 1.0
            else:
                planes[2 if kind == MAN else 3, r, c] = 1.0

    if in_chain and cp is not None and int(cp) >= 0:
        rr, cc = divmod(int(cp), BOARD_N)
        if 0 <= rr < BOARD_N and 0 <= cc < BOARD_N:
            planes[4, rr, cc] = 1.0

    pv = 1.0 if cur == TOP else 0.0
    planes[5, :, :] = pv

    planes[6, :, :] = IS_WIDE.astype(np.float32)
    planes[7, :, :] = MASK_BACK_TOP.astype(np.float32)
    planes[8, :, :] = MASK_BACK_BOT.astype(np.float32)
    planes[9, :, :] = MASK_CORNERS.astype(np.float32)
    planes[10, :, :] = MASK_EYES.astype(np.float32)
    planes[11, :, :] = MASK_MIDBACK.astype(np.float32)

    return planes



def _client_like_filter(game: Dict[str, Any]) -> bool:

    try:
        end_reason = str(game.get("endReason") or "")
        if end_reason in ("disconnect", "abort", "cancel"):
            return False

        samples = game.get("samples") or []
        if not isinstance(samples, list) or len(samples) < 12:
            return False

        started = int(game.get("startedAt") or 0)
        ended = int(game.get("endedAt") or 0)
        duration_ms = int(game.get("durationMs") or max(0, ended - started))
        if duration_ms < 25_000:
            return False

        sps = len(samples) / max(1.0, duration_ms / 1000.0)
        if sps > 3.0:
            return False


        if duration_ms > 60 * 60 * 1000:  
            return False


        if ended <= 0 or started <= 0 or ended < started:
            return False

        return True
    except Exception:
        return False



def _weight_for(sample: Dict[str, Any], winner: Optional[int]) -> Tuple[float, float]:

    actor = int(sample.get("actor") or sample.get("by") or 0)  
    cap = 1 if int(sample.get("cap") or 0) == 1 else 0
    crown = 1 if int(sample.get("crown") or 0) == 1 else 0
    trap = 1 if int(sample.get("trap") or 0) == 1 else 0


    if winner is None:
        v_tgt = 0.0
        outcome_mul = 1.0
    else:
        v_tgt = 1.0 if actor == winner else -1.0
        outcome_mul = 1.25 if actor == winner else 0.75


    w = 1.0
    w *= outcome_mul
    w *= (1.0 + 0.35 * cap)
    w *= (1.0 + 0.60 * crown)
    w *= (1.0 - 0.50 * trap)


    w = float(max(0.05, min(5.0, w)))
    return float(v_tgt), w



def _make_dataset(games: Dict[str, Dict[str, Any]], max_samples: int = 50_000) -> Tuple[List[Sample], List[str], List[str]]:





    now_ms = int(time.time() * 1000)
    dataset: List[Sample] = []
    used_ids: List[str] = []
    purge_ids: List[str] = []


    for gid, g in games.items():
        try:
            purge_at = int(g.get("purgeAt") or 0)
            if purge_at and purge_at <= now_ms:
                purge_ids.append(gid)
        except Exception:
            pass


    for gid, g in games.items():
        if len(dataset) >= max_samples:
            break
        if not isinstance(g, dict):
            continue
        if bool(g.get("processed")):
            continue
        if not _client_like_filter(g):
            continue

        winner_raw = g.get("winner", None)
        winner = None
        if winner_raw in (TOP, BOT, int(TOP), int(BOT)):
            winner = int(winner_raw)

        samples = g.get("samples") or []
        if not isinstance(samples, list) or not samples:
            continue

        ok_any = False
        for s in samples:
            if len(dataset) >= max_samples:
                break
            if not isinstance(s, dict):
                continue
            try:
                snap = s.get("s")
                a = int(s.get("a"))
                if not isinstance(snap, dict):
                    continue
                if a < 0 or a >= N_ACTIONS:
                    continue
                x = _encode_state(snap)
                v_tgt, w = _weight_for(s, winner)
                dataset.append(Sample(x=x, a=a, v=v_tgt, w=w))
                ok_any = True
            except Exception:
                continue

        if ok_any:
            used_ids.append(gid)

    return dataset, used_ids, purge_ids






def _latest_ckpt(models_dir: Path) -> Optional[Path]:

    stable = models_dir / "human_model.pt"
    if stable.exists():
        return stable
    prev = models_dir / "human_model.prev.pt"
    if prev.exists():
        return prev


    pts = sorted(models_dir.glob("human_ckpt_*.pt"))
    return pts[-1] if pts else None



def _load_or_init(models_dir: Path, preferred_version: Optional[str]) -> Tuple[ZamatNet, Optional[dict]]:




    ckpt_path = None
    if preferred_version:
        p = models_dir / f"human_ckpt_{preferred_version}.pt"
        if p.exists():
            ckpt_path = p
    if ckpt_path is None:
        ckpt_path = _latest_ckpt(models_dir)

    net = ZamatNet(in_channels=12, channels=64, num_blocks=4, n_actions=N_ACTIONS)

    payload = None
    if ckpt_path and ckpt_path.exists():
        payload = torch.load(ckpt_path, map_location="cpu")
        state = payload.get("model")
        if isinstance(state, dict):
            net.load_state_dict(state, strict=True)
    return net, payload


def _train_incremental(net: ZamatNet, payload: Optional[dict], dataset: List[Sample], epochs: int = 2, batch_size: int = 256) -> dict:
    net.train()
    device = torch.device("cpu")
    net.to(device)


    opt = torch.optim.Adam(net.parameters(), lr=3e-4, weight_decay=1e-4)
    if payload and isinstance(payload.get("optim"), dict):
        try:
            opt.load_state_dict(payload["optim"])
        except Exception:
            pass


    xs = np.stack([s.x for s in dataset], axis=0)  
    actions = np.array([s.a for s in dataset], dtype=np.int64)
    values = np.array([s.v for s in dataset], dtype=np.float32)
    weights = np.array([s.w for s in dataset], dtype=np.float32)


    rng = np.random.default_rng(seed=42)
    idx = np.arange(xs.shape[0])
    rng.shuffle(idx)
    xs, actions, values, weights = xs[idx], actions[idx], values[idx], weights[idx]

    x_t = torch.from_numpy(xs).to(device)
    a_t = torch.from_numpy(actions).to(device)
    v_t = torch.from_numpy(values).to(device)
    w_t = torch.from_numpy(weights).to(device)

    n = x_t.shape[0]
    ce = torch.nn.CrossEntropyLoss(reduction="none")
    mse = torch.nn.MSELoss(reduction="none")

    step = int(payload.get("step", 0)) if payload else 0

    for _ep in range(epochs):

        for i in range(0, n, batch_size):
            xb = x_t[i:i+batch_size]
            ab = a_t[i:i+batch_size]
            vb = v_t[i:i+batch_size]
            wb = w_t[i:i+batch_size]

            logits, vpred = net(xb)
            loss_pi = ce(logits, ab)  
            loss_v = mse(vpred, vb)   


            loss = (loss_pi * wb).mean() + 0.50 * (loss_v * wb).mean()

            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 2.0)
            opt.step()

            step += 1

    net.eval()
    return {
        "model": net.state_dict(),
        "optim": opt.state_dict(),
        "step": step,
        "meta": {
            "channels": 64,
            "num_blocks": 4,
            "n_actions": N_ACTIONS,
        },
        "trainedAt": int(time.time() * 1000),
        "samplesSeen": int(n),
    }






def _now_version_utc() -> str:

    return time.strftime("%Y%m%d_%H%M", time.gmtime())


def _read_pointer_from_firebase(db, path: str) -> Optional[dict]:
    if db is None:
        data = _rtdb_rest_get(path)
        return data if isinstance(data, dict) and data else None
    try:
        val = db.reference(path).get()
        return val if isinstance(val, dict) and val else None
    except Exception:
        return None



def _normalize_assets_human_rel(file_value: str) -> str:
    f = str(file_value or "").strip()
    if not f:
        return ""
    # URL is allowed
    if re.match(r"^https?://", f, flags=re.IGNORECASE):
        return f
    # normalize leading
    if f.startswith("./"):
        f = f[2:]
    if f.startswith("/"):
        f = f[1:]
    # legacy repo path
    if f.startswith("models/human/"):
        f = "assets/models/human/" + f[len("models/human/"):]
    # if only filename, place under assets/models/human/
    if not f.startswith("assets/"):
        f = "assets/models/human/" + f.lstrip("/")
    # ensure .onnx for file pointer if no extension
    base = re.split(r"[?#]", f, maxsplit=1)[0]
    if not base.lower().endswith(".onnx"):
        f = f + ".onnx"
    return f


def _read_pointer_any(db) -> Tuple[Optional[dict], Optional[dict]]:
    """Read canonical human model pointers from RTDB.

    Stage 17 removes legacy fallback paths; RTDB must contain Human-model/current.
    """
    cur = _read_pointer_from_firebase(db, RTDB_HUMAN_PTR_CURRENT)
    prev = _read_pointer_from_firebase(db, RTDB_HUMAN_PTR_PREVIOUS)
    if isinstance(cur, dict) and cur:
        return cur, prev if isinstance(prev, dict) else None
    return None, None


def _write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def _prune_models(models_dir: Path, keep_files: List[str]) -> List[str]:
    keep_set = set(keep_files)
    removed: List[str] = []

    for p in models_dir.glob("*"):
        if not p.is_file():
            continue
        if p.name == ".gitkeep":

            continue

        repo_rel = "assets/models/human/" + p.name
        if repo_rel in keep_set:
            continue

        try:
            p.unlink(missing_ok=True)
            removed.append(repo_rel)
        except Exception:
            pass
    return removed






def cmd_prepare(repo_root: Path) -> int:
    out_dir = repo_root / "training" / "_out"
    out_dir.mkdir(parents=True, exist_ok=True)


    db = _firebase_connect()


    old_current, old_previous = _read_pointer_any(db)

    prev_pointer = None


    games: Dict[str, Any] = {}
    if db is None:

        games = _rtdb_rest_get("trainGamesV3")
    else:

        try:
            games = db.reference("trainGamesV3").order_by_child("processed").equal_to(False).get() or {}
        except Exception:
            games = db.reference("trainGamesV3").get() or {}

    if not isinstance(games, dict):
        games = {}

    dataset, used_ids, purge_ids = _make_dataset(games)
    if len(dataset) < 64:

        meta = {
            "new": None,
            "old_current": old_current,
            "old_previous": old_previous,
            "prev_ptr": None,
"used_game_ids": [],
            "purge_game_ids": purge_ids,
            "note": "Not enough new samples to train",
            "createdAt": int(time.time() * 1000),
        }

        _write_json(out_dir / "next_version.json", meta)
        print(f"[prepare] Not enough samples to train (got {len(dataset)}). Will only purge old games in apply.")
        return 0


    models_dir = repo_root / "assets" / "models" / "human"
    models_dir.mkdir(parents=True, exist_ok=True)

    preferred_ver = None
    if isinstance(old_current, dict):
        preferred_ver = str(old_current.get("version") or "") or None

    net, ckpt_payload = _load_or_init(models_dir, preferred_ver)


    ckpt = _train_incremental(net, ckpt_payload, dataset, epochs=2, batch_size=256)


    new_ver = _now_version_utc()




    
    # Export new versioned artifacts under assets/models/human/
    new_onnx_name = f"human_learned_{new_ver}.onnx"
    new_ckpt_name = f"human_ckpt_{new_ver}.pt"

    new_onnx_rel = "assets/models/human/" + new_onnx_name
    new_ckpt_rel = "assets/models/human/" + new_ckpt_name

    export_onnx_model(net, repo_root / new_onnx_rel)
    torch.save(ckpt, repo_root / new_ckpt_rel)

    new_pointer = {
        "version": new_ver,
        "file": new_onnx_rel,
        "updatedAt": int(time.time() * 1000),
    }

    # Previous pointer follows the current pointer prior to this run (if any),
    # but we normalize legacy paths to assets/models/human/.
    prev_pointer = None
    prev_ver = None
    prev_file_rel = None
    if isinstance(old_current, dict) and old_current.get("version") and old_current.get("file"):
        prev_ver = str(old_current.get("version"))
        prev_file_rel = _normalize_assets_human_rel(str(old_current.get("file")))
        if prev_file_rel and not re.match(r"^https?://", prev_file_rel, flags=re.IGNORECASE):
            prev_pointer = {
                "version": prev_ver,
                "file": prev_file_rel,
                "updatedAt": int(time.time() * 1000),
            }

    keep_files: List[str] = [new_onnx_rel, new_ckpt_rel]

    # Keep previous ONNX + checkpoint if present (keep only 2 generations)
    if prev_pointer is not None and prev_file_rel:
        if (repo_root / prev_file_rel).exists():
            keep_files.append(prev_file_rel)
        if prev_ver:
            prev_ckpt_rel = f"assets/models/human/human_ckpt_{prev_ver}.pt"
            if (repo_root / prev_ckpt_rel).exists():
                keep_files.append(prev_ckpt_rel)

    removed = _prune_models(models_dir, keep_files)

    meta = {
        "new": new_pointer,
        "old_current": old_current,
        "old_previous": old_previous,
        "prev_ptr": prev_pointer,
        "used_game_ids": used_ids,
        "purge_game_ids": purge_ids,
        "stats": {
            "games_seen": len(games),
            "games_used": len(used_ids),
            "samples_used": len(dataset),
            "files_removed": removed,
        },
        "createdAt": int(time.time() * 1000),
    }
    _write_json(out_dir / "next_version.json", meta)
    print(f"[prepare] Trained on {len(dataset)} samples from {len(used_ids)} games -> {cur_onnx_rel}")
    return 0


def _chunked_root_update(db, updates: Dict[str, Any], chunk_size: int = 400) -> None:
    if not updates:
        return
    items = list(updates.items())
    for i in range(0, len(items), chunk_size):
        chunk = dict(items[i : i + chunk_size])
        if db is None:
            _rtdb_rest_patch("", chunk)
        else:
            db.reference("/").update(chunk)


def _safe_get_dict(db, path: str) -> Dict[str, Any]:
    try:
        if db is None:
            d = _rtdb_rest_get(path)
            return d if isinstance(d, dict) else {}
        d = db.reference(path).get()
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _cleanup_operational_data(db, now_ms: int) -> None:









    MAX_ACTIVE_MS = 12 * 60 * 60 * 1000
    MAX_PENDING_MS = 30 * 60 * 1000

    updates: Dict[str, Any] = {}

    games = _safe_get_dict(db, "games")
    to_delete_game_ids: List[str] = []
    for gid, g in games.items():
        if not isinstance(g, dict):
            continue
        status = str(g.get("status") or "")
        created = int(g.get("createdAt") or 0)
        ended = int(g.get("endedAt") or 0)
        accepted = int(g.get("acceptedAt") or 0)


        if status == "pending":
            if created and now_ms - created > MAX_PENDING_MS:
                to_delete_game_ids.append(gid)
            continue


        if status and status != "active":
            to_delete_game_ids.append(gid)
            continue


        if created and now_ms - created > MAX_ACTIVE_MS:
            to_delete_game_ids.append(gid)
            continue


        if ended and now_ms - ended > 60_000:
            to_delete_game_ids.append(gid)
            continue


        if not accepted and created and now_ms - created > MAX_PENDING_MS:
            to_delete_game_ids.append(gid)

    for gid in to_delete_game_ids:
        updates[f"games/{gid}"] = None
        updates[f"chats/{gid}"] = None
        updates[f"rtc/{gid}"] = None
        updates[f"spectators/{gid}"] = None


    for root_path in ("chats", "rtc", "spectators"):
        d = _safe_get_dict(db, root_path)
        for gid in d.keys():
            if gid not in games:
                updates[f"{root_path}/{gid}"] = None


    inv_root = _safe_get_dict(db, "invites")
    for to_uid, invs in inv_root.items():
        if not isinstance(invs, dict):
            continue
        for inv_id, inv in invs.items():
            if not isinstance(inv, dict):
                updates[f"invites/{to_uid}/{inv_id}"] = None
                continue

            gid = str(inv.get("gameId") or "")
            if not gid:

                updates[f"invites/{to_uid}/{inv_id}"] = None
                continue

            g = games.get(gid)
            if not isinstance(g, dict):
                updates[f"invites/{to_uid}/{inv_id}"] = None
                continue

            st = str(g.get("status") or "")
            if st not in ("active", "pending"):
                updates[f"invites/{to_uid}/{inv_id}"] = None


    players = _safe_get_dict(db, "players")

    def _extract_uid(side_val: Any) -> str:



        if isinstance(side_val, dict):
            return str(side_val.get("uid") or "").strip()
        return str(side_val or "").strip()

    for uid, p in players.items():
        if not isinstance(p, dict):
            updates[f"players/{uid}"] = None
            continue
        st = str(p.get("status") or "")
        role = str(p.get("role") or "")
        room_id = str(p.get("roomId") or "").strip() or ""

        def _set_available():
            updates[f"players/{uid}/status"] = "available"
            updates[f"players/{uid}/role"] = "lobby"
            updates[f"players/{uid}/roomId"] = None
            updates[f"players/{uid}/updatedAt"] = now_ms


        if room_id:
            g = games.get(room_id)
            if not isinstance(g, dict):
                if st in ("inPvP", "spectating") or role in ("player", "spectator"):
                    _set_available()
                continue
            g_status = str(g.get("status") or "")
            if g_status != "active":
                if st in ("inPvP", "spectating") or role in ("player", "spectator"):
                    _set_available()
                continue


            if st == "inPvP" or role == "player":
                pls = g.get("players") if isinstance(g.get("players"), dict) else {}
                w = _extract_uid(pls.get("white"))
                b = _extract_uid(pls.get("black"))
                if uid not in (w, b):
                    _set_available()


        if (st == "inPvP" or role == "player") and not room_id:
            _set_available()

    if updates:
        _chunked_root_update(db, updates)
    print(
        "[apply] Cleanup operational data: "
        f"rooms={len(to_delete_game_ids)} "
        f"updates={len(updates)}"
    )


def cmd_apply(repo_root: Path) -> int:
    meta_path = repo_root / "training" / "_out" / "next_version.json"
    if not meta_path.exists():
        print("[apply] No meta file found. Nothing to apply.")
        return 0

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    new_ptr = meta.get("new")
    old_current = meta.get("old_current")
    used_ids: List[str] = meta.get("used_game_ids") or []
    purge_ids: List[str] = meta.get("purge_game_ids") or []

    db = _firebase_connect()
    now_ms = int(time.time() * 1000)


    if isinstance(new_ptr, dict) and new_ptr.get("file"):
        prev_ptr = meta.get("prev_ptr") if isinstance(meta.get("prev_ptr"), dict) and meta.get("prev_ptr").get("file") else (old_current if isinstance(old_current, dict) and old_current.get("file") else None)

        if db is None:
            if prev_ptr is not None:
                _rtdb_rest_put(RTDB_HUMAN_PTR_PREVIOUS, prev_ptr)
            _rtdb_rest_put(RTDB_HUMAN_PTR_CURRENT, new_ptr)
        else:
            if prev_ptr is not None:
                db.reference(RTDB_HUMAN_PTR_PREVIOUS).set(prev_ptr)
            db.reference(RTDB_HUMAN_PTR_CURRENT).set(new_ptr)

        print(
            "[apply] Updated pointers: "
            f"current={new_ptr.get('version')} "
            f"previous={(prev_ptr or {}).get('version') if prev_ptr else 'None'}"
        )
    else:
        print("[apply] No new model pointer in meta (training skipped). Will only purge / cleanup.")



    model_version = None
    try:
        model_version = (new_ptr or {}).get("version") if isinstance(new_ptr, dict) else None
    except Exception:
        model_version = None

    if used_ids:
        mark_updates: Dict[str, Any] = {}
        for gid in used_ids:
            mark_updates[f"trainGamesV3/{gid}/processed"] = True
            mark_updates[f"trainGamesV3/{gid}/processedAt"] = now_ms
            if model_version:
                mark_updates[f"trainGamesV3/{gid}/processedByVersion"] = str(model_version)
        _chunked_root_update(db, mark_updates, chunk_size=250)
        print(f"[apply] Marked processed: {len(used_ids)} games")
    else:
        print("[apply] No consumed games to mark as processed.")



    MAX_DELETE_PER_RUN = 900
    delete_train_ids = []

    try:
        used_slice = list(used_ids)[:MAX_DELETE_PER_RUN]
        used_set = set(used_slice)
        purge_slice = [gid for gid in (purge_ids or []) if gid not in used_set][:MAX_DELETE_PER_RUN]
        delete_train_ids = sorted(set(used_slice + purge_slice))
    except Exception:
        delete_train_ids = sorted(set((used_ids or []) + (purge_ids or [])))[:MAX_DELETE_PER_RUN]

    if delete_train_ids:
        updates: Dict[str, Any] = {f"trainGamesV3/{gid}": None for gid in delete_train_ids}
        _chunked_root_update(db, updates, chunk_size=300)
        suffix = ""
        if len((used_ids or [])) > MAX_DELETE_PER_RUN or len((purge_ids or [])) > MAX_DELETE_PER_RUN:
            suffix = f" (capped at {MAX_DELETE_PER_RUN}/run)"
        print(f"[apply] Deleted training data: {len(delete_train_ids)} games (used+expired){suffix}")
    else:
        print("[apply] No training data deletions needed (no used or expired items).")

    try:
        _cleanup_operational_data(db, now_ms)
    except Exception as e:
        print(f"[apply] Operational cleanup skipped due to error: {e}")

    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("prepare")
    p1.add_argument("--repo-root", required=True)

    p2 = sub.add_parser("apply")
    p2.add_argument("--repo-root", required=True)

    args = ap.parse_args()
    repo_root = Path(args.repo_root).resolve()

    if args.cmd == "prepare":
        return cmd_prepare(repo_root)
    if args.cmd == "apply":
        return cmd_apply(repo_root)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
