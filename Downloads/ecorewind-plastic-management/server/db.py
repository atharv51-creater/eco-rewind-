"""SQLite Database Ledger and User Store for EcoRewind."""
from __future__ import annotations

import json
import os
import hashlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance_paise INTEGER NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
    total_grams REAL NOT NULL DEFAULT 0 CHECK (total_grams >= 0),
    confirmed_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_count >= 0),
    rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
    total_paid_paise INTEGER NOT NULL DEFAULT 0 CHECK (total_paid_paise >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deposit')),
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
    label TEXT,
    display_label TEXT,
    confidence REAL,
    weight_grams REAL NOT NULL,
    rate_paise_per_gram INTEGER NOT NULL DEFAULT 0,
    payout_paise INTEGER NOT NULL DEFAULT 0 CHECK (payout_paise >= 0),
    bonus_paise INTEGER NOT NULL DEFAULT 0 CHECK (bonus_paise >= 0),
    reason TEXT,
    machine_id TEXT,
    image_sha256 TEXT,
    scores_json TEXT NOT NULL DEFAULT '{}',
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON transactions (user_id, id DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    destination TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
    ON withdrawals (user_id, id DESC);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    upi_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'online',
    bin_pet_pct INTEGER NOT NULL DEFAULT 42,
    bin_cans_pct INTEGER NOT NULL DEFAULT 28,
    bin_bags_pct INTEGER NOT NULL DEFAULT 15,
    total_bottles_collected INTEGER NOT NULL DEFAULT 0,
    last_maintenance TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rates_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rates_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

DEFAULT_RATES = {
    "rates_paise_per_gram": {
        "plastic_bottle": 2,
        "aluminium_can": 4,
        "plastic_bag": 1,
        "other_invalid": 0
    },
    "accepted_classes": ["aluminium_can", "plastic_bag", "plastic_bottle"],
    "min_weight_g": 100.0,
    "max_weight_g": 500.0,
    "bonus_threshold_g": 400.0,
    "bonus_pct": 10
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _wallet_dict(row: sqlite3.Row | None, user_id: str) -> dict:
    if row is None:
        now = _now()
        return {
            "user_id": user_id,
            "balance_paise": 0,
            "total_grams": 0.0,
            "confirmed_count": 0,
            "rejected_count": 0,
            "total_paid_paise": 0,
            "created_at": now,
            "updated_at": now,
        }
    return {
        "user_id": row["user_id"],
        "balance_paise": row["balance_paise"],
        "total_grams": float(row["total_grams"]),
        "confirmed_count": row["confirmed_count"],
        "rejected_count": row["rejected_count"],
        "total_paid_paise": row["total_paid_paise"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _txn_dict(row: sqlite3.Row) -> dict:
    return {
        "id": str(row["id"]),
        "kind": row["kind"],
        "status": row["status"],
        "label": row["label"] or "other_invalid",
        "display_label": row["display_label"] or "Invalid item",
        "confidence": row["confidence"] or 0.0,
        "weight_grams": float(row["weight_grams"]),
        "rate_paise_per_gram": row["rate_paise_per_gram"],
        "payout_paise": row["payout_paise"],
        "bonus_paise": row["bonus_paise"],
        "reason": row["reason"] or "",
        "machine_id": row["machine_id"] or "RVM-01",
        "scores": json.loads(row["scores_json"] or "{}"),
        "user_id": row["user_id"],
        "created_at": row["created_at"],
    }


def _withdrawal_dict(row: sqlite3.Row) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "amount_paise": row["amount_paise"],
        "destination": row["destination"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class Database:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.init()

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    def init(self) -> None:
        conn = self._connect()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.executescript(SCHEMA)

            now = _now()
            # Seed default users
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM users")
            if cur.fetchone()[0] == 0:
                conn.execute(
                    """INSERT OR IGNORE INTO users (id, name, email, phone, upi_id, role, password_hash, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    ("user-admin-01", "EcoRewind Administrator", "admin@ecorewind.com", "9811122233", "", "admin", "admin123", now)
                )
                conn.execute(
                    """INSERT OR IGNORE INTO users (id, name, email, phone, upi_id, role, password_hash, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    ("user-atharv-01", "Atharv Ubale", "user@ecorewind.com", "9876543210", "atharv@okhdfcbank", "user", "user123", now)
                )
                self._ensure_wallet(conn, "user-admin-01", now)
                self._ensure_wallet(conn, "user-atharv-01", now)
                conn.execute(
                    """UPDATE wallets SET balance_paise = 1880, total_paid_paise = 3880, total_grams = 950.0,
                                         confirmed_count = 3, rejected_count = 1
                       WHERE user_id = 'user-atharv-01' AND balance_paise = 0"""
                )

            # Seed default machines
            cur.execute("SELECT COUNT(*) FROM machines")
            if cur.fetchone()[0] == 0:
                conn.executemany(
                    """INSERT OR IGNORE INTO machines (id, name, location, status, bin_pet_pct, bin_cans_pct, bin_bags_pct, total_bottles_collected, last_maintenance)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    [
                        ("RVM-01", "Central Station Kiosk 1", "Platform 1 South", "online", 42, 28, 15, 12, "2026-10-25"),
                        ("RVM-02", "Campus Green Hub", "Student Union East", "online", 65, 40, 35, 28, "2026-10-26"),
                        ("RVM-03", "Metro Interchange", "Concourse B Gates", "online", 20, 15, 10, 8, "2026-10-27"),
                    ]
                )

            # Seed default rates
            cur.execute("SELECT COUNT(*) FROM rates_config")
            if cur.fetchone()[0] == 0:
                conn.execute(
                    "INSERT OR IGNORE INTO rates_config (id, rates_json, updated_at) VALUES (1, ?, ?)",
                    (json.dumps(DEFAULT_RATES), now)
                )

            conn.commit()
        finally:
            conn.close()

    def _ensure_wallet(self, conn: sqlite3.Connection, user_id: str, now: str) -> None:
        conn.execute(
            "INSERT OR IGNORE INTO wallets (user_id, created_at, updated_at) VALUES (?, ?, ?)",
            (user_id, now, now)
        )

    # --- WALLET ---
    def get_wallet(self, user_id: str) -> dict:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
            if not row:
                now = _now()
                self._ensure_wallet(conn, user_id, now)
                conn.commit()
                row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
            return _wallet_dict(row, user_id)
        finally:
            conn.close()

    # --- SCAN & DEPOSIT ---
    def record_scan(
        self,
        *,
        user_id: str,
        status: str,
        label: str | None,
        display_label: str | None,
        confidence: float | None,
        weight_grams: float,
        rate_paise_per_gram: int,
        payout_paise: int,
        bonus_paise: int,
        reason: str,
        machine_id: str | None,
        image_sha256: str,
        scores: dict[str, float],
        idempotency_key: str,
        request_hash: str,
    ) -> tuple[dict, dict, bool]:
        now = _now()
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            existing = conn.execute(
                "SELECT * FROM transactions WHERE user_id = ? AND idempotency_key = ?",
                (user_id, idempotency_key),
            ).fetchone()
            if existing:
                wallet_row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
                wallet = _wallet_dict(wallet_row, user_id)
                conn.commit()
                return _txn_dict(existing), wallet, True

            self._ensure_wallet(conn, user_id, now)
            cursor = conn.execute(
                """
                INSERT INTO transactions (
                    user_id, kind, status, label, display_label, confidence,
                    weight_grams, rate_paise_per_gram, payout_paise, bonus_paise,
                    reason, machine_id, image_sha256, scores_json, idempotency_key,
                    request_hash, created_at
                ) VALUES (?, 'deposit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    status,
                    label,
                    display_label,
                    confidence,
                    weight_grams,
                    rate_paise_per_gram,
                    payout_paise,
                    bonus_paise,
                    reason,
                    machine_id or "RVM-01",
                    image_sha256,
                    json.dumps(scores, sort_keys=True),
                    idempotency_key,
                    request_hash,
                    now,
                ),
            )
            if status == "accepted":
                conn.execute(
                    """
                    UPDATE wallets SET
                        balance_paise = balance_paise + ?,
                        total_grams = total_grams + ?,
                        confirmed_count = confirmed_count + 1,
                        total_paid_paise = total_paid_paise + ?,
                        updated_at = ?
                    WHERE user_id = ?
                    """,
                    (payout_paise, weight_grams, payout_paise, now, user_id),
                )
                if machine_id:
                    conn.execute(
                        "UPDATE machines SET total_bottles_collected = total_bottles_collected + 1 WHERE id = ?",
                        (machine_id,)
                    )
            else:
                conn.execute(
                    """
                    UPDATE wallets SET
                        rejected_count = rejected_count + 1,
                        updated_at = ?
                    WHERE user_id = ?
                    """,
                    (now, user_id),
                )

            transaction = conn.execute(
                "SELECT * FROM transactions WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
            wallet_row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
            wallet = _wallet_dict(wallet_row, user_id)
            conn.commit()
            return _txn_dict(transaction), wallet, False
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # --- TRANSACTIONS ---
    def list_transactions(
        self, user_id: str | None = None, limit: int = 50, offset: int = 0, status: str | None = None
    ) -> tuple[list[dict], int]:
        where = []
        params: list[object] = []
        if user_id and user_id != "all":
            where.append("user_id = ?")
            params.append(user_id)
        if status and status != "all":
            where.append("status = ?")
            params.append(status)
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        conn = self._connect()
        try:
            total = conn.execute(
                f"SELECT COUNT(*) FROM transactions {clause}", params
            ).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM transactions {clause} ORDER BY id DESC LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
            return [_txn_dict(row) for row in rows], int(total)
        finally:
            conn.close()

    # --- WITHDRAWALS ---
    def create_withdrawal(
        self,
        *,
        user_id: str,
        amount_paise: int,
        destination: str,
        idempotency_key: str,
        request_hash: str,
    ) -> tuple[dict, dict, bool]:
        now = _now()
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            existing = conn.execute(
                "SELECT * FROM withdrawals WHERE user_id = ? AND idempotency_key = ?",
                (user_id, idempotency_key),
            ).fetchone()
            if existing:
                wallet_row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
                conn.commit()
                return _withdrawal_dict(existing), _wallet_dict(wallet_row, user_id), True

            self._ensure_wallet(conn, user_id, now)
            wallet_row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
            wallet = _wallet_dict(wallet_row, user_id)
            if wallet["balance_paise"] < amount_paise:
                raise ValueError(f"Insufficient funds: available balance is {wallet['balance_paise']} paise")

            cursor = conn.execute(
                """
                INSERT INTO withdrawals (
                    user_id, amount_paise, destination, status, idempotency_key,
                    request_hash, created_at, updated_at
                ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
                """,
                (user_id, amount_paise, destination, idempotency_key, request_hash, now, now),
            )
            conn.execute(
                "UPDATE wallets SET balance_paise = balance_paise - ?, updated_at = ? WHERE user_id = ?",
                (amount_paise, now, user_id),
            )
            withdrawal = conn.execute(
                "SELECT * FROM withdrawals WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
            wallet_row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
            conn.commit()
            return _withdrawal_dict(withdrawal), _wallet_dict(wallet_row, user_id), False
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_withdrawals(
        self, user_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> tuple[list[dict], int]:
        conn = self._connect()
        try:
            if user_id and user_id != "all":
                total = conn.execute(
                    "SELECT COUNT(*) FROM withdrawals WHERE user_id = ?", (user_id,)
                ).fetchone()[0]
                rows = conn.execute(
                    "SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                    (user_id, limit, offset),
                ).fetchall()
            else:
                total = conn.execute("SELECT COUNT(*) FROM withdrawals").fetchone()[0]
                rows = conn.execute(
                    "SELECT * FROM withdrawals ORDER BY id DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                ).fetchall()
            return [_withdrawal_dict(row) for row in rows], int(total)
        finally:
            conn.close()

    def update_withdrawal(self, withdrawal_id: int | str, status: str) -> tuple[dict, dict]:
        now = _now()
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT * FROM withdrawals WHERE id = ?", (withdrawal_id,)).fetchone()
            if not row:
                raise LookupError("Withdrawal not found")
            user_id = row["user_id"]
            if row["status"] != status:
                conn.execute("UPDATE withdrawals SET status = ?, updated_at = ? WHERE id = ?", (status, now, withdrawal_id))
                if status == "cancelled" and row["status"] != "cancelled":
                    conn.execute(
                        "UPDATE wallets SET balance_paise = balance_paise + ?, updated_at = ? WHERE user_id = ?",
                        (row["amount_paise"], now, user_id)
                    )
            updated = conn.execute("SELECT * FROM withdrawals WHERE id = ?", (withdrawal_id,)).fetchone()
            wallet_row = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user_id,)).fetchone()
            conn.commit()
            return _withdrawal_dict(updated), _wallet_dict(wallet_row, user_id)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # --- USERS & AUTH ---
    def authenticate_user(self, email: str, password: str) -> dict | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),)
            ).fetchone()
            if row and row["password_hash"] == password:
                return {
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "phone": row["phone"],
                    "upi_id": row["upi_id"],
                    "role": row["role"],
                    "created_at": row["created_at"],
                }
            return None
        finally:
            conn.close()

    def register_user(self, *, name: str, email: str, phone: str, password: str, upi_id: str = "") -> dict:
        now = _now()
        user_id = f"user-{hashlib.sha256(email.lower().encode()).hexdigest()[:8]}"
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            existing = conn.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),)).fetchone()
            if existing:
                raise ValueError("An account with this email already exists")
            conn.execute(
                """INSERT INTO users (id, name, email, phone, upi_id, role, password_hash, created_at)
                   VALUES (?, ?, ?, ?, ?, 'user', ?, ?)""",
                (user_id, name.strip(), email.strip(), phone.strip(), upi_id.strip(), password, now)
            )
            self._ensure_wallet(conn, user_id, now)
            conn.commit()
            return {
                "id": user_id,
                "name": name.strip(),
                "email": email.strip(),
                "phone": phone.strip(),
                "upi_id": upi_id.strip(),
                "role": "user",
                "created_at": now,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def get_user(self, user_id: str) -> dict | None:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                row = conn.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (user_id,)).fetchone()
            if row:
                return {
                    "id": row["id"],
                    "name": row["name"],
                    "email": row["email"],
                    "phone": row["phone"],
                    "upi_id": row["upi_id"],
                    "role": row["role"],
                    "created_at": row["created_at"],
                }
            return None
        finally:
            conn.close()

    def list_users(self) -> list[dict]:
        conn = self._connect()
        try:
            rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
            out = []
            for r in rows:
                w = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (r["id"],)).fetchone()
                bal = w["balance_paise"] if w else 0
                cnt = w["confirmed_count"] if w else 0
                out.append({
                    "id": r["id"],
                    "name": r["name"],
                    "email": r["email"],
                    "phone": r["phone"],
                    "role": r["role"],
                    "balance_paise": bal,
                    "bottles_recycled": cnt,
                    "upi_id": r["upi_id"],
                    "joined_date": r["created_at"].split("T")[0] if "T" in r["created_at"] else r["created_at"],
                })
            return out
        finally:
            conn.close()

    # --- FLEET MACHINES ---
    def list_machines(self) -> list[dict]:
        conn = self._connect()
        try:
            rows = conn.execute("SELECT * FROM machines").fetchall()
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "location": r["location"],
                    "status": r["status"],
                    "bin_pet_pct": r["bin_pet_pct"],
                    "bin_cans_pct": r["bin_cans_pct"],
                    "bin_bags_pct": r["bin_bags_pct"],
                    "total_bottles_collected": r["total_bottles_collected"],
                    "last_maintenance": r["last_maintenance"],
                }
                for r in rows
            ]
        finally:
            conn.close()

    # --- ADMIN STATS ---
    def get_admin_stats(self) -> dict:
        conn = self._connect()
        try:
            total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            tot_bottles = conn.execute("SELECT COUNT(*) FROM transactions WHERE status = 'accepted'").fetchone()[0]
            tot_money = conn.execute("SELECT COALESCE(SUM(payout_paise), 0) FROM transactions WHERE status = 'accepted'").fetchone()[0]
            active_m = conn.execute("SELECT COUNT(*) FROM machines WHERE status = 'online'").fetchone()[0]
            tot_weight_g = conn.execute("SELECT COALESCE(SUM(weight_grams), 0) FROM transactions WHERE status = 'accepted'").fetchone()[0]
            return {
                "total_users": int(total_users),
                "total_bottles_collected": int(tot_bottles),
                "total_money_paid_paise": int(tot_money),
                "active_machines": int(active_m),
                "total_weight_kg": round(float(tot_weight_g) / 1000.0, 2),
            }
        finally:
            conn.close()

    # --- TARIFF RATES ---
    def get_rates(self) -> dict:
        conn = self._connect()
        try:
            row = conn.execute("SELECT rates_json FROM rates_config WHERE id = 1").fetchone()
            if row:
                return json.loads(row["rates_json"])
            return DEFAULT_RATES
        finally:
            conn.close()

    def update_rates(self, rates_dict: dict) -> dict:
        now = _now()
        conn = self._connect()
        try:
            conn.execute(
                """INSERT INTO rates_config (id, rates_json, updated_at) VALUES (1, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET rates_json = excluded.rates_json, updated_at = excluded.updated_at""",
                (json.dumps(rates_dict), now)
            )
            conn.commit()
            return rates_dict
        finally:
            conn.close()
