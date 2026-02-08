# Section: training/rtdb_migrate_stage17.py — Python utility script

"""One-time RTDB migration for Stage 17.

Objectives (post-migration expected state):
  1) Human model pointers are canonical and exclusive:
     - Human-model/current
     - Human-model/previous
     and their "file" values point to assets/models/human/*.onnx (not models/human/*).

  2) Legacy model pointer nodes are removed:
     - humanONNX
     - human_model

  3) No permanent per-match history is kept:
     - remove legacy nodes if still present (playerMatchesV1, matchResultsV1, matchLogsV1, roomArchivesV1)

  4) Player/Stats indices are consistent:
     - refresh leaderboardV1 sortKey (and lastActivity fallback) for up to LEADERBOARD_LIMIT entries
     - optionally write profiles/<uid>/stats/globalRank for those entries (best-effort)

  5) Learning data hygiene:
     - delete trainGamesV3 records already marked processed=true (per spec: remove after training use)
     - ensure missing fields are repaired conservatively:
        processed defaults to false
        purgeAt defaults to endedAt + 48h (same TTL used in the app)
     - repair statsMarkersV1 purgeAt defaults to endedAt + 24h (same TTL used in the app)

Auth:
  Provide FIREBASE_DATABASE_URL and either:
    - FIREBASE_SERVICE_ACCOUNT_JSON (preferred; Admin SDK), or
    - FIREBASE_DB_SECRET (REST auth)

Safety:
  Set DRY_RUN=1 to print intended actions without writing/deleting.

Limits (env, defaults are conservative):
  - LEADERBOARD_LIMIT: 5000
  - TRAIN_DELETE_LIMIT: 2000
  - TRAIN_REPAIR_LIMIT: 2000
  - MARKER_USERS_LIMIT: 500
  - MARKER_PER_USER_LIMIT: 250
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import requests


def _env_int(name: str, default: int) -> int:
    try:
        v = int(str(os.environ.get(name, str(default))).strip())
        return v
    except Exception:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "y", "on")


DRY_RUN = _env_bool("DRY_RUN", False)

RTDB_URL = (os.environ.get("FIREBASE_DATABASE_URL") or "").strip().rstrip("/")
if not RTDB_URL:
    raise RuntimeError("Missing env FIREBASE_DATABASE_URL")


def _firebase_connect():
    """Return firebase_admin.db module when using service account, else None."""
    sa_json = (os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if sa_json:
        import firebase_admin
        from firebase_admin import credentials, db

        if not firebase_admin._apps:
            cred = credentials.Certificate(json.loads(sa_json))
            firebase_admin.initialize_app(cred, {"databaseURL": RTDB_URL})
        return db

    secret = (os.environ.get("FIREBASE_DB_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("Provide FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_DB_SECRET")
    return None


def _rest_url(path: str, extra: str = "") -> str:
    secret = os.environ["FIREBASE_DB_SECRET"]
    p = (path or "").strip("/")
    base = f"{RTDB_URL}/{p}.json" if p else f"{RTDB_URL}/.json"
    if extra:
        if extra.startswith("&") or extra.startswith("?"):
            return f"{base}?auth={secret}{extra}"
        return f"{base}?auth={secret}&{extra}"
    return f"{base}?auth={secret}"


def _rest_get(path: str, extra: str = "") -> Any:
    r = requests.get(_rest_url(path, extra), timeout=30)
    r.raise_for_status()
    return r.json()


def _rest_patch(path: str, obj: Dict[str, Any]) -> None:
    r = requests.patch(_rest_url(path), json=obj, timeout=30)
    r.raise_for_status()


def _rest_put(path: str, obj: Any) -> None:
    r = requests.put(_rest_url(path), json=obj, timeout=30)
    r.raise_for_status()


def _rest_delete(path: str) -> None:
    r = requests.delete(_rest_url(path), timeout=30)
    r.raise_for_status()


class RTDB:
    def __init__(self):
        self.db = _firebase_connect()
        self.use_admin = self.db is not None

    def get(self, path: str, extra: str = "") -> Any:
        if self.use_admin:
            ref = self.db.reference(path.strip("/")) if path else self.db.reference("/")
            return ref.get()
        return _rest_get(path, extra)

    def put(self, path: str, obj: Any) -> None:
        if DRY_RUN:
            print(f"[DRY_RUN] PUT {path}: {type(obj).__name__}")
            return
        if self.use_admin:
            ref = self.db.reference(path.strip("/")) if path else self.db.reference("/")
            ref.set(obj)
            return
        _rest_put(path, obj)

    def patch(self, path: str, obj: Dict[str, Any]) -> None:
        if DRY_RUN:
            print(f"[DRY_RUN] PATCH {path}: keys={list(obj.keys())[:8]}{'...' if len(obj)>8 else ''}")
            return
        if self.use_admin:
            ref = self.db.reference(path.strip("/")) if path else self.db.reference("/")
            ref.update(obj)
            return
        _rest_patch(path, obj)

    def delete(self, path: str) -> None:
        if DRY_RUN:
            print(f"[DRY_RUN] DELETE {path}")
            return
        if self.use_admin:
            ref = self.db.reference(path.strip("/")) if path else self.db.reference("/")
            ref.delete()
            return
        _rest_delete(path)

    def query_order_by_child(self, path: str, child: str, limit: int, equal_to: Optional[Any] = None) -> Dict[str, Any]:
        """Return dict of children at `path` ordered by a child key (REST or Admin)."""
        path = (path or "").strip("/")
        if self.use_admin:
            ref = self.db.reference(path) if path else self.db.reference("/")
            q = ref.order_by_child(child)
            if equal_to is not None:
                q = q.equal_to(equal_to)
            q = q.limit_to_first(limit)
            out = q.get()
            return out or {}
        # REST query params must be JSON encoded strings
        params = {
            'orderBy': json.dumps(child),
            'limitToFirst': str(int(limit)),
        }
        if equal_to is not None:
            params['equalTo'] = json.dumps(equal_to)
        extra = "&" + "&".join([f"{k}={requests.utils.quote(str(v))}" for k, v in params.items()])
        out = self.get(path, extra=extra)
        return out or {}

    def shallow_keys(self, path: str) -> List[str]:
        """Fetch only keys under a node (REST only). For Admin, falls back to full fetch."""
        path = (path or "").strip("/")
        if self.use_admin:
            v = self.get(path)
            if isinstance(v, dict):
                return list(v.keys())
            return []
        out = self.get(path, extra="&shallow=true")
        if isinstance(out, dict):
            return list(out.keys())
        return []


# --- Helpers

def _now_ms() -> int:
    return int(time.time() * 1000)


def _normalize_human_file(file_val: str) -> str:
    f = (file_val or "").strip()
    if not f:
        return ""
    # keep absolute URL if provided
    if f.lower().startswith("http://") or f.lower().startswith("https://"):
        return f
    if f.startswith("./"):
        f = f[2:]
    if f.startswith("/"):
        f = f[1:]
    # legacy path -> new hosted path
    if f.startswith("models/human/"):
        f = "assets/models/human/" + f[len("models/human/"):]
    # if only filename, enforce directory
    if not f.startswith("assets/"):
        f = "assets/models/human/" + f.lstrip("/")
    # enforce extension
    base = f.split("?", 1)[0].split("#", 1)[0]
    if not base.lower().endswith(".onnx"):
        f = base + ".onnx"
    return f


def _leader_sort_key(uid: str, points: int, wins: int, losses: int, last_activity: int) -> str:
    # matches js/dashboard.js and js/game.js ordering
    def _pad(n: int, w: int) -> str:
        return str(max(0, int(n))).zfill(w)

    def _inv(n: int, maxv: int) -> int:
        return maxv - max(0, int(n))

    MAX_P = 999_999_999
    MAX_W = 999_999_999
    MAX_T = 9_999_999_999_999  # 13 digits (ms)
    p = min(max(0, int(points)), MAX_P)
    w = min(max(0, int(wins)), MAX_W)
    l = min(max(0, int(losses)), 999_999_999)
    t = min(max(0, int(last_activity)), MAX_T)

    invP = _inv(p, MAX_P)
    invW = _inv(w, MAX_W)
    invT = _inv(t, MAX_T)
    return f"{_pad(invP,9)}_{_pad(invW,9)}_{_pad(l,9)}_{_pad(invT,13)}_{uid}"


# --- Migration steps

def migrate_model_pointers(rtdb: RTDB) -> None:
    print("== Model pointer migration ==")
    # Read all possible sources (including existing canonical)
    cur = rtdb.get("Human-model/current") or None
    prev = rtdb.get("Human-model/previous") or None

    legacy_cur = rtdb.get("humanONNX/current") or None
    legacy_prev = rtdb.get("humanONNX/previous") or None

    legacy2_cur = rtdb.get("human_model/current") or None
    legacy2_prev = rtdb.get("human_model/previous") or None

    # pick best available pointer
    chosen_cur = cur if isinstance(cur, dict) and cur.get("version") and cur.get("file") else None
    chosen_prev = prev if isinstance(prev, dict) and prev.get("version") and prev.get("file") else None

    if chosen_cur is None:
        for cand in (legacy2_cur, legacy_cur):
            if isinstance(cand, dict) and cand.get("version") and cand.get("file"):
                chosen_cur = cand
                break

    if chosen_prev is None:
        for cand in (legacy2_prev, legacy_prev):
            if isinstance(cand, dict) and cand.get("version") and cand.get("file"):
                chosen_prev = cand
                break

    if not chosen_cur:
        print("No usable current pointer found in RTDB. Skipping model pointer migration.")
        return

    def norm_ptr(ptr: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(ptr)
        out["version"] = str(out.get("version", "")).strip()
        out["file"] = _normalize_human_file(str(out.get("file", "")).strip())
        if "updatedAt" in out:
            try:
                out["updatedAt"] = int(out["updatedAt"])
            except Exception:
                out["updatedAt"] = _now_ms()
        else:
            out["updatedAt"] = _now_ms()
        return {"version": out["version"], "file": out["file"], "updatedAt": out["updatedAt"]}

    canonical_cur = norm_ptr(chosen_cur)
    canonical_prev = norm_ptr(chosen_prev) if chosen_prev else None

    print(f"Writing Human-model/current = {canonical_cur.get('version')} -> {canonical_cur.get('file')}")
    rtdb.put("Human-model/current", canonical_cur)

    if canonical_prev:
        print(f"Writing Human-model/previous = {canonical_prev.get('version')} -> {canonical_prev.get('file')}")
        rtdb.put("Human-model/previous", canonical_prev)

    # Remove legacy nodes
    for legacy in ("humanONNX", "human_model"):
        try:
            if rtdb.get(legacy) is not None:
                print(f"Deleting legacy node: {legacy}")
                rtdb.delete(legacy)
        except Exception as e:
            print(f"Warning: failed deleting {legacy}: {e}")


def cleanup_legacy_nodes(rtdb: RTDB) -> None:
    print("== Legacy node cleanup ==")
    for node in ("playerMatchesV1", "matchResultsV1", "matchLogsV1", "roomArchivesV1"):
        try:
            if rtdb.get(node) is not None:
                print(f"Deleting {node}")
                rtdb.delete(node)
        except Exception as e:
            print(f"Warning: failed deleting {node}: {e}")


def repair_stats_markers(rtdb: RTDB) -> None:
    print("== statsMarkersV1 repair ==")
    users_limit = _env_int("MARKER_USERS_LIMIT", 500)
    per_user_limit = _env_int("MARKER_PER_USER_LIMIT", 250)
    ttl_ms = 24 * 60 * 60 * 1000  # 24h

    keys = rtdb.shallow_keys("statsMarkersV1")
    if not keys:
        print("No statsMarkersV1 present.")
        return

    keys = keys[:users_limit]
    repaired = 0
    scanned = 0
    for uid in keys:
        node = rtdb.get(f"statsMarkersV1/{uid}") or {}
        if not isinstance(node, dict):
            continue
        # limit per-user
        items = list(node.items())[:per_user_limit]
        for match_id, marker in items:
            scanned += 1
            if not isinstance(marker, dict):
                continue
            ended = marker.get("endedAt")
            purge = marker.get("purgeAt")
            if ended is None or purge is not None:
                continue
            try:
                ended_i = int(ended)
            except Exception:
                continue
            patch = {"purgeAt": ended_i + ttl_ms}
            print(f"Repair marker {uid}/{match_id}: set purgeAt")
            rtdb.patch(f"statsMarkersV1/{uid}/{match_id}", patch)
            repaired += 1
    print(f"statsMarkersV1 scanned={scanned}, repaired={repaired}")


def repair_and_cleanup_train_games(rtdb: RTDB) -> None:
    print("== trainGamesV3 cleanup/repair ==")
    delete_limit = _env_int("TRAIN_DELETE_LIMIT", 2000)
    repair_limit = _env_int("TRAIN_REPAIR_LIMIT", 2000)
    ttl_ms = 48 * 60 * 60 * 1000  # 48h (matches app)

    # 1) delete processed=true games (per spec: delete after training)
    deleted = 0
    while deleted < delete_limit:
        batch = rtdb.query_order_by_child("trainGamesV3", "processed", limit=min(200, delete_limit - deleted), equal_to=True)
        if not isinstance(batch, dict) or not batch:
            break
        for gid in list(batch.keys()):
            print(f"Delete processed train game: {gid}")
            rtdb.delete(f"trainGamesV3/{gid}")
            deleted += 1
            if deleted >= delete_limit:
                break
    print(f"Deleted processed train games: {deleted}")

    # 2) repair missing fields for remaining games (limited)
    repaired = 0
    # We cannot query "missing processed" directly; read a limited set ordered by endedAt
    batch = rtdb.query_order_by_child("trainGamesV3", "endedAt", limit=repair_limit)
    if isinstance(batch, dict) and batch:
        for gid, rec in batch.items():
            if not isinstance(rec, dict):
                continue
            patch: Dict[str, Any] = {}
            if "processed" not in rec:
                patch["processed"] = False
            if "purgeAt" not in rec:
                ended = rec.get("endedAt")
                try:
                    ended_i = int(ended) if ended is not None else _now_ms()
                except Exception:
                    ended_i = _now_ms()
                patch["purgeAt"] = ended_i + ttl_ms
            if patch:
                print(f"Repair train game {gid}: {list(patch.keys())}")
                rtdb.patch(f"trainGamesV3/{gid}", patch)
                repaired += 1
    print(f"Repaired train games: {repaired}")


def rebuild_leaderboard(rtdb: RTDB) -> None:
    print("== leaderboardV1 refresh ==")
    limit = _env_int("LEADERBOARD_LIMIT", 5000)
    # fetch ordered by sortKey if exists, else by points (fallback)
    batch = rtdb.query_order_by_child("leaderboardV1", "sortKey", limit=limit)
    if not isinstance(batch, dict) or not batch:
        batch = rtdb.query_order_by_child("leaderboardV1", "points", limit=limit)
    if not isinstance(batch, dict) or not batch:
        print("No leaderboardV1 entries found.")
        return

    # compute new sortKeys
    entries: List[Tuple[str, Dict[str, Any]]] = []
    for uid, row in batch.items():
        if not isinstance(row, dict):
            continue
        entries.append((str(uid), row))

    # refresh each entry
    updates = 0
    for uid, row in entries:
        pts = int(row.get("points") or 0)
        wins = int(row.get("wins") or 0)
        losses = int(row.get("losses") or 0)
        last_activity = row.get("lastActivity") or row.get("updatedAt") or row.get("lastActiveAt") or _now_ms()
        try:
            last_activity = int(last_activity)
        except Exception:
            last_activity = _now_ms()
        sort_key = _leader_sort_key(uid, pts, wins, losses, last_activity)
        patch = {"sortKey": sort_key, "lastActivity": last_activity}
        print(f"Update leaderboardV1/{uid}: sortKey refresh")
        rtdb.patch(f"leaderboardV1/{uid}", patch)
        updates += 1

    # compute rank by ordering all fetched entries by sortKey
    # NOTE: lexicographic ascending = best first due to inverted numbers
    refreshed = rtdb.query_order_by_child("leaderboardV1", "sortKey", limit=limit)
    if not isinstance(refreshed, dict) or not refreshed:
        return

    # write globalRank best-effort
    rank = 0
    for uid in refreshed.keys():
        rank += 1
        try:
            rtdb.patch(f"profiles/{uid}/stats", {"globalRank": rank})
        except Exception:
            pass
    print(f"leaderboard refreshed entries={updates}, globalRank written for top={rank}")


def cleanup_operational_play_data(rtdb: RTDB) -> None:
    """One-time cleanup for operational (online play) data.

    This mirrors the scheduled maintenance policy, but is bounded and conservative.
    It does NOT create new behavior; it only removes stale/ended operational rows.

    Env (defaults match maintenance):
      - STALE_PLAYER_MINUTES (10)
      - STALE_GAME_PRESENCE_MINUTES (2)
      - STALE_ENDED_ROOM_MINUTES (10)
      - STALE_ABANDONED_ROOM_MINUTES (60)
      - OP_DELETE_LIMIT (500)
      - PROTECT_GAME_STATUSES ("active,pending")
    """
    print("== Operational play data cleanup ==")

    stale_player_min = _env_int("STALE_PLAYER_MINUTES", 10)
    stale_presence_min = _env_int("STALE_GAME_PRESENCE_MINUTES", 2)
    stale_ended_min = _env_int("STALE_ENDED_ROOM_MINUTES", 10)
    stale_abandoned_min = _env_int("STALE_ABANDONED_ROOM_MINUTES", 60)
    op_limit = _env_int("OP_DELETE_LIMIT", 500)
    protect_statuses = set([s.strip() for s in (os.environ.get("PROTECT_GAME_STATUSES") or "active,pending").split(",") if s.strip()])

    now = _now_ms()
    stale_player_ms = max(1, stale_player_min) * 60 * 1000
    stale_presence_ms = max(1, stale_presence_min) * 60 * 1000
    stale_ended_ms = max(1, stale_ended_min) * 60 * 1000
    stale_abandoned_ms = max(1, stale_abandoned_min) * 60 * 1000

    games = rtdb.get("games") or {}
    if not isinstance(games, dict):
        games = {}

    # Collect protected players currently in active/pending games
    protected_uids = set()
    for gid, g in games.items():
        if not isinstance(g, dict):
            continue
        st = str(g.get("status") or "")
        if st in protect_statuses:
            pres = g.get("presence")
            if isinstance(pres, dict):
                for uid in pres.keys():
                    protected_uids.add(str(uid))

    updates: Dict[str, Any] = {}
    deleted = 0

    # 1) delete stale /players presence rows (not in active/pending games)
    players = rtdb.get("players") or {}
    if isinstance(players, dict):
        for uid, row in players.items():
            if deleted >= op_limit:
                break
            if not isinstance(row, dict):
                continue
            if str(uid) in protected_uids:
                continue
            ts = row.get("updatedAt") or row.get("lastActiveAt") or row.get("lastSeenAt")
            try:
                ts = int(ts)
            except Exception:
                continue
            if now - ts > stale_player_ms:
                updates[f"players/{uid}"] = None
                deleted += 1

    # 2) delete stale in-room presence rows under /games/{gid}/presence
    for gid, g in games.items():
        if deleted >= op_limit:
            break
        if not isinstance(g, dict):
            continue
        pres = g.get("presence")
        if not isinstance(pres, dict):
            continue
        for uid, prow in list(pres.items()):
            if deleted >= op_limit:
                break
            if not isinstance(prow, dict):
                continue
            ts = prow.get("updatedAt") or prow.get("lastActiveAt") or prow.get("lastSeenAt")
            try:
                ts = int(ts)
            except Exception:
                continue
            if now - ts > stale_presence_ms:
                updates[f"games/{gid}/presence/{uid}"] = None
                deleted += 1

    # 3) delete ended/rejected rooms (and companion nodes) and abandoned rooms
    for gid, g in games.items():
        if deleted >= op_limit:
            break
        if not isinstance(g, dict):
            continue

        st = str(g.get("status") or "")
        ended_at = g.get("endedAt")
        try:
            ended_at_i = int(ended_at) if ended_at is not None else None
        except Exception:
            ended_at_i = None

        # ended / rejected
        if st in ("ended", "rejected") or ended_at_i is not None:
            if ended_at_i is None:
                # if status suggests ended but missing endedAt, use updatedAt/createdAt as fallback
                ts = g.get("updatedAt") or g.get("createdAt") or g.get("startedAt")
                try:
                    ended_at_i = int(ts)
                except Exception:
                    ended_at_i = None
            if ended_at_i is not None and (now - ended_at_i) > stale_ended_ms:
                for p in (f"games/{gid}", f"chats/{gid}", f"rtc/{gid}", f"spectators/{gid}", f"roomArchivesV1/{gid}"):
                    updates[p] = None
                deleted += 1
                continue

        # abandoned: status protected but presence empty, old timestamp
        if st in protect_statuses:
            pres = g.get("presence")
            is_empty = not (isinstance(pres, dict) and len(pres) > 0)
            if is_empty:
                ts = g.get("updatedAt") or g.get("createdAt") or g.get("startedAt")
                try:
                    ts = int(ts)
                except Exception:
                    ts = None
                if ts is not None and (now - ts) > stale_abandoned_ms:
                    for p in (f"games/{gid}", f"chats/{gid}", f"rtc/{gid}", f"spectators/{gid}", f"roomArchivesV1/{gid}"):
                        updates[p] = None
                    deleted += 1

    if updates:
        print(f"Applying operational cleanup updates: {len(updates)} paths")
        rtdb.patch("", updates)
    else:
        print("No operational cleanup actions needed (within current limits).")

def main() -> None:
    print("Stage 17 RTDB migration starting.")
    print(f"DRY_RUN={DRY_RUN}")
    rtdb = RTDB()

    migrate_model_pointers(rtdb)
    cleanup_legacy_nodes(rtdb)
    repair_stats_markers(rtdb)
    repair_and_cleanup_train_games(rtdb)
    rebuild_leaderboard(rtdb)

    print("Stage 17 RTDB migration complete.")


if __name__ == "__main__":
    main()
