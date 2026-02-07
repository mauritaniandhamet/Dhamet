# Section: training/rtdb_maintenance.py — Python utility script

"""RTDB maintenance tasks that should run on a schedule.

This script is intentionally lightweight (no torch / onnx) and focuses on
operational data hygiene.

Current task(s):
  - delete stale player presence rows under /players based on updatedAt
    while protecting users who are currently inside active/pending games.
  - delete stale in-room presence rows under /games/{gid}/presence based on updatedAt
    (helps avoid "ghost" rooms/players when clients crash or mobile browsers suspend).
  - delete ended/rejected rooms (and their companion nodes) and abandoned rooms
    (no presence for a period), in small batches.

Configuration (env):
  - FIREBASE_DATABASE_URL (required)
  - FIREBASE_SERVICE_ACCOUNT_JSON (preferred) OR FIREBASE_DB_SECRET
  - STALE_PLAYER_MINUTES (default: 10)
  - STALE_GAME_PRESENCE_MINUTES (default: 2)
  - STALE_ENDED_ROOM_MINUTES (default: 10)
  - STALE_ABANDONED_ROOM_MINUTES (default: 60)
  - ROOM_DELETE_LIMIT (default: 200)
  - PROTECT_GAME_STATUSES (default: "active,pending")
"""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any, Dict, Iterable, Optional, Set, Tuple







def _firebase_connect():
    """Return firebase_admin.db module when using service account, else None."""
    db_url = (os.environ.get("FIREBASE_DATABASE_URL") or "").strip()
    if not db_url:
        raise RuntimeError("Missing env FIREBASE_DATABASE_URL")

    sa_json = (os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if sa_json:
        import firebase_admin
        from firebase_admin import credentials, db

        if not firebase_admin._apps:
            cred = credentials.Certificate(json.loads(sa_json))
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        return db

    secret = (os.environ.get("FIREBASE_DB_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("Provide FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_DB_SECRET")


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

    r = requests.get(_rest_url(path), timeout=60)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def _rtdb_rest_patch(path: str, payload: Dict[str, Any]) -> None:
    import requests

    r = requests.patch(_rest_url(path), json=payload, timeout=60)
    r.raise_for_status()


def _safe_get_dict(db, path: str) -> Dict[str, Any]:
    try:
        if db is None:
            return _rtdb_rest_get(path)
        d = db.reference(path).get()
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


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







def _extract_uid(side_val: Any) -> str:



    if isinstance(side_val, dict):
        return str(side_val.get("uid") or "").strip()
    return str(side_val or "").strip()


def _iter_game_player_uids(g: Dict[str, Any]) -> Iterable[str]:
    pls = g.get("players") if isinstance(g.get("players"), dict) else {}
    w = _extract_uid(pls.get("white"))
    b = _extract_uid(pls.get("black"))
    if w:
        yield w
    if b:
        yield b


def cleanup_stale_players(db, now_ms: int, stale_minutes: int, protect_statuses: Set[str], dry_run: bool) -> Tuple[int, int, int]:
    """Delete /players/{uid} where updatedAt is older than stale_minutes.

    Protection:
      - if uid is currently a player in any game whose status is in protect_statuses,
        the player row will not be deleted.
    """
    stale_ms = max(1, int(stale_minutes)) * 60 * 1000

    games = _safe_get_dict(db, "games")
    protected_uids: Set[str] = set()
    for _gid, g in games.items():
        if not isinstance(g, dict):
            continue
        st = str(g.get("status") or "").strip()
        if st not in protect_statuses:
            continue
        for uid in _iter_game_player_uids(g):
            protected_uids.add(uid)

    players = _safe_get_dict(db, "players")
    delete_uids: list[str] = []
    considered = 0
    protected = 0

    for uid, p in players.items():
        if not uid:
            continue
        if not isinstance(p, dict):

            if uid in protected_uids:
                protected += 1
            else:
                delete_uids.append(uid)
            continue

        considered += 1
        if uid in protected_uids:
            protected += 1
            continue

        updated_at = p.get("updatedAt")
        try:
            updated_ms = int(updated_at or 0)
        except Exception:
            updated_ms = 0


        age = now_ms - updated_ms
        if age < 0:

            continue
        if age > stale_ms:
            delete_uids.append(uid)

    updates: Dict[str, Any] = {}
    for uid in delete_uids:
        updates[f"players/{uid}"] = None

    if updates and not dry_run:
        _chunked_root_update(db, updates)

    return considered, len(delete_uids), protected


def cleanup_stale_game_presence(
    db,
    now_ms: int,
    stale_minutes: int,
    protect_statuses: Set[str],
    dry_run: bool,
) -> Tuple[int, int, int]:
    """Delete /games/{gid}/presence/{uid} rows where updatedAt is older than stale_minutes.

    Protection:
      - only games whose status is in protect_statuses are scanned (typically active/pending).

    Returns: (games_scanned, presence_rows_considered, deleted)
    """
    stale_ms = max(1, int(stale_minutes)) * 60 * 1000

    games = _safe_get_dict(db, "games")
    updates: Dict[str, Any] = {}
    games_scanned = 0
    considered = 0
    deleted = 0

    for gid, g in games.items():
        if not gid or not isinstance(g, dict):
            continue
        st = str(g.get("status") or "").strip()
        if st not in protect_statuses:
            continue
        games_scanned += 1

        pres = g.get("presence")
        if not isinstance(pres, dict):
            continue

        for uid, pr in pres.items():
            if not uid:
                continue
            considered += 1
            if not isinstance(pr, dict):
                updates[f"games/{gid}/presence/{uid}"] = None
                deleted += 1
                continue


            updated_at = pr.get("updatedAt") or pr.get("joinedAt") or 0
            try:
                updated_ms = int(updated_at or 0)
            except Exception:
                updated_ms = 0

            age = now_ms - updated_ms
            if age < 0:

                continue
            if age > stale_ms:
                updates[f"games/{gid}/presence/{uid}"] = None
                deleted += 1

    if updates and not dry_run:
        _chunked_root_update(db, updates)

    return games_scanned, considered, deleted


def _best_ts(*vals: Any) -> int:
    best = 0
    for v in vals:
        try:
            iv = int(v or 0)
        except Exception:
            iv = 0
        if iv > best:
            best = iv
    return best


def cleanup_stale_rooms(
    db,
    now_ms: int,
    protect_statuses: Set[str],
    ended_room_minutes: int,
    abandoned_room_minutes: int,
    delete_limit: int,
    dry_run: bool,
) -> Tuple[int, int, int, int]:
    """Delete stale room data in small batches.

    Targets:
      - Ended/rejected rooms: delete after ended_room_minutes.
      - Abandoned rooms: status in protect_statuses but presence is empty and
        the room's last timestamp is older than abandoned_room_minutes.

    Deletes /games/{gid} and companion operational nodes:
      /chats/{gid}, /rtc/{gid}, /spectators/{gid}
    Also deletes legacy /roomArchivesV1/{gid} if present.
    """
    ended_ms = max(1, int(ended_room_minutes)) * 60 * 1000
    abandoned_ms = max(1, int(abandoned_room_minutes)) * 60 * 1000
    limit = max(1, int(delete_limit))

    games = _safe_get_dict(db, "games")
    updates: Dict[str, Any] = {}

    considered = 0
    ended_deleted = 0
    abandoned_deleted = 0

    for gid, g in games.items():
        if not gid or not isinstance(g, dict):
            continue

        considered += 1
        st = str(g.get("status") or "").strip()
        ended_at = _best_ts(g.get("endedAt"))
        created_at = _best_ts(g.get("createdAt"))
        accepted_at = _best_ts(g.get("acceptedAt"))

        last_ts = _best_ts(ended_at, accepted_at, created_at)

        pres = g.get("presence")
        pres_empty = True
        if isinstance(pres, dict):
            pres_empty = len([k for k in pres.keys() if k]) == 0

        # 1) Ended or rejected: remove after a short retention.
        is_endedish = (st in {"ended", "rejected"}) or (ended_at > 0)
        if is_endedish:
            age = now_ms - (ended_at or last_ts or now_ms)
            if age >= ended_ms:
                ended_deleted += 1
            else:
                continue

        # 2) Abandoned: active/pending with no presence for a while.
        elif st in protect_statuses and pres_empty:
            age = now_ms - (last_ts or now_ms)
            if age >= abandoned_ms:
                abandoned_deleted += 1
            else:
                continue
        else:
            continue

        # Respect batch limits
        if (ended_deleted + abandoned_deleted) > limit:
            # roll back the last increment and stop
            if is_endedish:
                ended_deleted -= 1
            else:
                abandoned_deleted -= 1
            break

        updates[f"games/{gid}"] = None
        updates[f"chats/{gid}"] = None
        updates[f"rtc/{gid}"] = None
        updates[f"spectators/{gid}"] = None
        updates[f"roomArchivesV1/{gid}"] = None

    if updates and not dry_run:
        _chunked_root_update(db, updates)

    deleted_total = ended_deleted + abandoned_deleted
    return considered, deleted_total, ended_deleted, abandoned_deleted



def _rtdb_rest_get_query(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    import requests

    # _rest_url already includes auth= secret; requests will merge query params safely
    r = requests.get(_rest_url(path), params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def cleanup_expired_training_games(db, now_ms: int, delete_limit: int, dry_run: bool) -> Tuple[int, int]:
    """Delete expired training records under /trainGamesV3 by purgeAt.

    This is the scheduled (6h) retention enforcer mentioned in the spec.
    It deletes a bounded number of records per run to stay within free-tier limits.
    """
    limit = max(1, int(delete_limit))

    expired: Dict[str, Any] = {}
    try:
        if db is None:
            expired = _rtdb_rest_get_query(
                "trainGamesV3",
                {
                    "orderBy": json.dumps("purgeAt"),
                    "endAt": now_ms,
                    "limitToFirst": limit,
                },
            )
        else:
            expired = (
                db.reference("trainGamesV3")
                .order_by_child("purgeAt")
                .end_at(now_ms)
                .limit_to_first(limit)
                .get()
            )
            if not isinstance(expired, dict):
                expired = {}
    except Exception:
        expired = {}

    updates: Dict[str, Any] = {}
    considered = 0
    deleted = 0

    for gid, row in expired.items():
        if not gid:
            continue
        considered += 1
        # Defensive check: ensure purgeAt is indeed expired
        purge_at = 0
        if isinstance(row, dict):
            try:
                purge_at = int(row.get("purgeAt") or 0)
            except Exception:
                purge_at = 0
        if purge_at and purge_at <= now_ms:
            updates[f"trainGamesV3/{gid}"] = None
            deleted += 1

    if updates and not dry_run:
        _chunked_root_update(db, updates, chunk_size=250)

    return considered, deleted




def cleanup_legacy_match_data(db, dry_run: bool, user_limit: int = 60, match_limit: int = 300) -> Tuple[int, int, int]:
    """Gradually remove legacy match-history/log nodes that should no longer exist.

    Targets (legacy):
      - /playerMatchesV1 (per-user match history)
      - /matchResultsV1
      - /matchLogsV1

    Returns: (player_users_deleted, match_results_deleted, match_logs_deleted)
    """
    updates: Dict[str, Any] = {}
    # 1) playerMatchesV1: delete by user bucket (bounded)
    pm = {}
    try:
        if db is None:
            pm = _rtdb_rest_get_query("playerMatchesV1", {"shallow": "true"})
        else:
            try:
                pm = db.reference("playerMatchesV1").get(shallow=True)
            except TypeError:
                # Older admin SDK versions may not support shallow=True
                pm = _safe_get_dict(db, "playerMatchesV1")
            if not isinstance(pm, dict):
                pm = _safe_get_dict(db, "playerMatchesV1")
    except Exception:
        pm = _safe_get_dict(db, "playerMatchesV1")
    pm_deleted_users = 0
    if isinstance(pm, dict):
        for uid in list(pm.keys())[:max(1, int(user_limit))]:
            if uid:
                updates[f"playerMatchesV1/{uid}"] = None
                pm_deleted_users += 1

    # 2) matchResultsV1: delete by matchId (bounded)
    mr = _safe_get_dict(db, "matchResultsV1")
    mr_deleted = 0
    if isinstance(mr, dict):
        for mid in list(mr.keys())[:max(1, int(match_limit))]:
            if mid:
                updates[f"matchResultsV1/{mid}"] = None
                mr_deleted += 1

    # 3) matchLogsV1: delete by matchId (bounded)
    ml = _safe_get_dict(db, "matchLogsV1")
    ml_deleted = 0
    if isinstance(ml, dict):
        for mid in list(ml.keys())[:max(1, int(match_limit))]:
            if mid:
                updates[f"matchLogsV1/{mid}"] = None
                ml_deleted += 1

    if updates and not dry_run:
        _chunked_root_update(db, updates, chunk_size=250)

    return pm_deleted_users, mr_deleted, ml_deleted



def cleanup_expired_stats_markers(db, now_ms: int, delete_limit: int, dry_run: bool) -> Tuple[int, int]:
    """Delete expired idempotency markers under /statsMarkersV1.

    These markers are temporary operational rows used to prevent double-counting
    player statistics on retries. They are not permanent match logs.
    """
    limit = max(1, int(delete_limit))

    root = _safe_get_dict(db, "statsMarkersV1")
    updates: Dict[str, Any] = {}
    considered = 0
    deleted = 0

    if not isinstance(root, dict):
        return 0, 0

    for uid, bucket in root.items():
        if not uid or not isinstance(bucket, dict):
            continue
        for mid, row in bucket.items():
            if not mid:
                continue
            considered += 1
            purge_at = 0
            if isinstance(row, dict):
                try:
                    purge_at = int(row.get("purgeAt") or 0)
                except Exception:
                    purge_at = 0

            # If purgeAt missing/invalid, keep it (defensive).
            if purge_at and purge_at <= now_ms:
                updates[f"statsMarkersV1/{uid}/{mid}"] = None
                deleted += 1
                if deleted >= limit:
                    break
        if deleted >= limit:
            break

    if updates and not dry_run:
        _chunked_root_update(db, updates)

    return considered, deleted


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Do not write changes to RTDB")
    args = parser.parse_args()

    db = _firebase_connect()
    now_ms = int(time.time() * 1000)

    stale_minutes = int((os.environ.get("STALE_PLAYER_MINUTES") or "10").strip() or "10")
    stale_game_presence_minutes = int((os.environ.get("STALE_GAME_PRESENCE_MINUTES") or "2").strip() or "2")
    ended_room_minutes = int((os.environ.get("STALE_ENDED_ROOM_MINUTES") or "10").strip() or "10")
    abandoned_room_minutes = int((os.environ.get("STALE_ABANDONED_ROOM_MINUTES") or "60").strip() or "60")
    room_delete_limit = int((os.environ.get("ROOM_DELETE_LIMIT") or "200").strip() or "200")
    train_delete_limit = int((os.environ.get("TRAIN_GAMES_DELETE_LIMIT") or "250").strip() or "250")
    legacy_user_delete_limit = int((os.environ.get("LEGACY_MATCH_USERS_DELETE_LIMIT") or "60").strip() or "60")
    legacy_match_delete_limit = int((os.environ.get("LEGACY_MATCH_RECORDS_DELETE_LIMIT") or "300").strip() or "300")
    stats_marker_delete_limit = int((os.environ.get("STATS_MARKER_DELETE_LIMIT") or "600").strip() or "600")

    protect_statuses_raw = (os.environ.get("PROTECT_GAME_STATUSES") or "active,pending").strip()
    protect_statuses = {s.strip() for s in protect_statuses_raw.split(",") if s.strip()}
    if not protect_statuses:
        protect_statuses = {"active", "pending"}

    considered, deleted, protected = cleanup_stale_players(
        db=db,
        now_ms=now_ms,
        stale_minutes=stale_minutes,
        protect_statuses=protect_statuses,
        dry_run=bool(args.dry_run),
    )

    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    print(
        f"[maintenance:{mode}] stale players cleanup: "
        f"considered={considered} deleted={deleted} protected={protected} "
        f"stale_minutes={stale_minutes} protect_statuses={sorted(protect_statuses)}"
    )

    gp_games, gp_considered, gp_deleted = cleanup_stale_game_presence(
        db=db,
        now_ms=now_ms,
        stale_minutes=stale_game_presence_minutes,
        protect_statuses=protect_statuses,
        dry_run=bool(args.dry_run),
    )

    print(
        f"[maintenance:{mode}] stale game presence cleanup: "
        f"games={gp_games} considered={gp_considered} deleted={gp_deleted} "
        f"stale_minutes={stale_game_presence_minutes} protect_statuses={sorted(protect_statuses)}"
    )

    rooms_considered, rooms_deleted, ended_deleted, abandoned_deleted = cleanup_stale_rooms(
        db=db,
        now_ms=now_ms,
        protect_statuses=protect_statuses,
        ended_room_minutes=ended_room_minutes,
        abandoned_room_minutes=abandoned_room_minutes,
        delete_limit=room_delete_limit,
        dry_run=bool(args.dry_run),
    )

    print(
        f"[maintenance:{mode}] stale rooms cleanup: "
        f"considered={rooms_considered} deleted={rooms_deleted} "
        f"(ended/rejected={ended_deleted} abandoned={abandoned_deleted}) "
        f"ended_room_minutes={ended_room_minutes} abandoned_room_minutes={abandoned_room_minutes} "
        f"limit={room_delete_limit}"
    )

    tg_considered, tg_deleted = cleanup_expired_training_games(
        db=db,
        now_ms=now_ms,
        delete_limit=train_delete_limit,
        dry_run=bool(args.dry_run),
    )

    print(
        f"[maintenance:{mode}] trainGamesV3 retention cleanup: "
        f"considered={tg_considered} deleted={tg_deleted} limit={train_delete_limit}"
    )



    lm_users, lm_results, lm_logs = cleanup_legacy_match_data(
        db=db,
        dry_run=bool(args.dry_run),
        user_limit=legacy_user_delete_limit,
        match_limit=legacy_match_delete_limit,
    )

    print(
        f"[maintenance:{mode}] legacy match data cleanup: "
        f"playerUsersDeleted={lm_users} matchResultsDeleted={lm_results} matchLogsDeleted={lm_logs} "
        f"userLimit={legacy_user_delete_limit} matchLimit={legacy_match_delete_limit}"
    )

    sm_considered, sm_deleted = cleanup_expired_stats_markers(
        db=db,
        now_ms=now_ms,
        delete_limit=stats_marker_delete_limit,
        dry_run=bool(args.dry_run),
    )

    print(
        f"[maintenance:{mode}] stats markers cleanup: "
        f"considered={sm_considered} deleted={sm_deleted} limit={stats_marker_delete_limit}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
