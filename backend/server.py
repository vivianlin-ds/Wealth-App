from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "local-data"
DB_PATH = DATA_DIR / "wealth.db"
INSTITUTION_CATEGORIES = {
    "Wealthfront": {"High yield saving"},
    "Charles Schwab": {"Cash", "ETF", "Mutual Fund", "CD", "Equities"},
    "Fidelity": {"401k", "Roth", "Roth Investment"},
    "Alight": {"HSA", "HSA Investment"},
}
CATEGORIES = {category for categories in INSTITUTION_CATEGORIES.values() for category in categories}
ACCOUNT_STYLE_CATEGORIES = {"High yield saving", "Cash", "401k", "Roth", "HSA"}
NO_COST_BASIS_CATEGORIES: set[str] = set()


class AppError(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def init_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS holdings (
                id TEXT PRIMARY KEY,
                month TEXT NOT NULL,
                institution TEXT NOT NULL,
                asset TEXT NOT NULL,
                category TEXT NOT NULL,
                ticker TEXT NOT NULL DEFAULT '',
                current_value REAL NOT NULL,
                current_value_is_unrealized_gain INTEGER NOT NULL DEFAULT 0,
                sold INTEGER NOT NULL DEFAULT 0,
                cost_basis REAL NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        ensure_column(
            conn,
            "holdings",
            "current_value_is_unrealized_gain",
            "INTEGER NOT NULL DEFAULT 0",
        )
        ensure_column(conn, "holdings", "sold", "INTEGER NOT NULL DEFAULT 0")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                month TEXT NOT NULL,
                action TEXT NOT NULL,
                institution TEXT NOT NULL,
                category TEXT NOT NULL,
                ticker TEXT NOT NULL DEFAULT '',
                amount REAL NOT NULL DEFAULT 0,
                cash_delta REAL NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                holding_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        normalize_schwab_cash_rows(conn)
        backfill_records(conn)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_holding(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "month": row["month"],
        "institution": row["institution"],
        "asset": row["asset"],
        "category": row["category"],
        "ticker": row["ticker"],
        "currentValue": row["current_value"],
        "currentValueIsUnrealizedGain": bool(row["current_value_is_unrealized_gain"]),
        "sold": bool(row["sold"]),
        "costBasis": row["cost_basis"],
        "notes": row["notes"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def row_to_record(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "month": row["month"],
        "action": row["action"],
        "institution": row["institution"],
        "category": row["category"],
        "ticker": row["ticker"],
        "amount": row["amount"],
        "cashDelta": row["cash_delta"],
        "notes": row["notes"],
        "holdingId": row["holding_id"],
        "createdAt": row["created_at"],
    }


def validate_payload(payload: dict[str, Any], existing_id: str | None = None) -> dict[str, Any]:
    month = str(payload.get("month", "")).strip()
    institution = str(payload.get("institution", "")).strip()
    category = str(payload.get("category", "")).strip()
    ticker = str(payload.get("ticker", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    current_value_is_unrealized_gain = bool(payload.get("currentValueIsUnrealizedGain", False))
    sold = bool(payload.get("sold", False))

    if len(month) != 7 or month[4] != "-":
        raise AppError(HTTPStatus.BAD_REQUEST, "Month must use YYYY-MM format.")
    if institution not in INSTITUTION_CATEGORIES:
        raise AppError(HTTPStatus.BAD_REQUEST, "Institution is not supported.")
    if category not in CATEGORIES:
        raise AppError(HTTPStatus.BAD_REQUEST, "Category is not supported.")
    if category not in INSTITUTION_CATEGORIES[institution]:
        raise AppError(HTTPStatus.BAD_REQUEST, "Category is not supported for this institution.")
    if is_plain_cash_asset(institution, category):
        ticker = ""

    try:
      current_value = float(payload.get("currentValue", 0))
      cost_basis = float(payload.get("costBasis", 0) or 0)
    except (TypeError, ValueError):
        raise AppError(HTTPStatus.BAD_REQUEST, "Current value and cost basis must be numbers.")

    if current_value < 0 and not current_value_is_unrealized_gain and not is_plain_cash_asset(institution, category):
        raise AppError(HTTPStatus.BAD_REQUEST, "Current value cannot be negative.")
    if cost_basis < 0:
        raise AppError(HTTPStatus.BAD_REQUEST, "Cost basis cannot be negative.")
    asset = generate_asset_key(institution, category, ticker, cost_basis)
    timestamp = now_iso()
    return {
        "id": existing_id or str(uuid.uuid4()),
        "month": month,
        "institution": institution,
        "asset": asset,
        "category": category,
        "ticker": ticker,
        "current_value": current_value,
        "current_value_is_unrealized_gain": int(current_value_is_unrealized_gain),
        "sold": int(sold),
        "cost_basis": cost_basis,
        "notes": notes,
        "updated_at": timestamp,
    }


def generate_asset_key(institution: str, category: str, ticker: str, cost_basis: float) -> str:
    if is_plain_cash_asset(institution, category):
        ticker = ""
    if category in ACCOUNT_STYLE_CATEGORIES:
        parts = [institution, category, ticker or "No ticker"]
    else:
        parts = [institution, category, ticker or "No ticker", f"{cost_basis:.2f}"]
    return "_".join(key_part(part) for part in parts)


def key_part(value: str) -> str:
    normalized = "-".join(value.strip().split()).replace("_", "-")
    return normalized or "None"


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    existing_columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing_columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def is_plain_cash_asset(institution: str, category: str) -> bool:
    return institution == "Charles Schwab" and category == "Cash"


def normalize_schwab_cash_rows(conn: sqlite3.Connection) -> None:
    cash_asset = generate_asset_key("Charles Schwab", "Cash", "", 0)
    timestamp = now_iso()
    conn.execute(
        """
        UPDATE holdings
        SET asset = ?,
            ticker = '',
            updated_at = ?
        WHERE institution = 'Charles Schwab'
          AND category = 'Cash'
          AND (asset != ? OR ticker != '')
        """,
        (cash_asset, timestamp, cash_asset),
    )
    duplicate_months = conn.execute(
        """
        SELECT month
        FROM holdings
        WHERE institution = 'Charles Schwab'
          AND category = 'Cash'
        GROUP BY month
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for duplicate_month in duplicate_months:
        rows = conn.execute(
            """
            SELECT *
            FROM holdings
            WHERE institution = 'Charles Schwab'
              AND category = 'Cash'
              AND month = ?
            ORDER BY created_at ASC, id ASC
            """,
            (duplicate_month["month"],),
        ).fetchall()
        keeper = rows[0]
        duplicate_ids = [row["id"] for row in rows[1:]]
        notes = [row["notes"] for row in rows if row["notes"]]
        conn.execute(
            """
            UPDATE holdings
            SET current_value = ?,
                cost_basis = 0,
                ticker = '',
                asset = ?,
                notes = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                sum(float(row["current_value"] or 0) for row in rows),
                cash_asset,
                " ".join(notes),
                timestamp,
                keeper["id"],
            ),
        )
        placeholders = ",".join("?" for _ in duplicate_ids)
        conn.execute(f"DELETE FROM holdings WHERE id IN ({placeholders})", duplicate_ids)


def list_holdings() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM holdings
            ORDER BY month DESC, institution ASC, asset ASC
            """
        ).fetchall()
    return [row_to_holding(row) for row in rows]


def list_records() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM records
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
    return [row_to_record(row) for row in rows]


def create_record(payload: dict[str, Any]) -> dict[str, Any]:
    month = str(payload.get("month", "")).strip()
    action = str(payload.get("action", "")).strip()
    institution = str(payload.get("institution", "")).strip()
    category = str(payload.get("category", "")).strip()
    ticker = str(payload.get("ticker", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    holding_id = str(payload.get("holdingId", "")).strip()

    if len(month) != 7 or month[4] != "-":
        raise AppError(HTTPStatus.BAD_REQUEST, "Month must use YYYY-MM format.")
    if not action:
        raise AppError(HTTPStatus.BAD_REQUEST, "Record action is required.")
    if institution not in INSTITUTION_CATEGORIES:
        raise AppError(HTTPStatus.BAD_REQUEST, "Institution is not supported.")
    if category not in CATEGORIES:
        raise AppError(HTTPStatus.BAD_REQUEST, "Category is not supported.")
    if category not in INSTITUTION_CATEGORIES[institution]:
        raise AppError(HTTPStatus.BAD_REQUEST, "Category is not supported for this institution.")

    try:
        amount = float(payload.get("amount", 0) or 0)
        cash_delta = float(payload.get("cashDelta", 0) or 0)
    except (TypeError, ValueError):
        raise AppError(HTTPStatus.BAD_REQUEST, "Record amount and cash delta must be numbers.")

    record_id = str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO records (
                id, month, action, institution, category, ticker,
                amount, cash_delta, notes, holding_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (record_id, month, action, institution, category, ticker, amount, cash_delta, notes, holding_id, now_iso()),
        )
    return get_record(record_id)


def get_record(record_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
    if row is None:
        raise AppError(HTTPStatus.NOT_FOUND, "Record not found.")
    return row_to_record(row)


def backfill_records(conn: sqlite3.Connection) -> None:
    existing = conn.execute("SELECT COUNT(*) AS count FROM records").fetchone()["count"]
    if existing:
        return
    rows = conn.execute("SELECT * FROM holdings ORDER BY created_at ASC, id ASC").fetchall()
    for row in rows:
        action = "Cash balance" if is_plain_cash_asset(row["institution"], row["category"]) else "Holding entry"
        cash_delta = float(row["current_value"] or 0) if is_plain_cash_asset(row["institution"], row["category"]) else 0
        conn.execute(
            """
            INSERT INTO records (
                id, month, action, institution, category, ticker,
                amount, cash_delta, notes, holding_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                row["month"],
                action,
                row["institution"],
                row["category"],
                row["ticker"],
                float(row["current_value"] or 0),
                cash_delta,
                row["notes"],
                row["id"],
                row["created_at"],
            ),
        )


def create_holding(payload: dict[str, Any]) -> dict[str, Any]:
    data = validate_payload(payload)
    created_at = data["updated_at"]
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO holdings (
                id, month, institution, asset, category, ticker,
                current_value, current_value_is_unrealized_gain, sold, cost_basis, notes, created_at, updated_at
            )
            VALUES (
                :id, :month, :institution, :asset, :category, :ticker,
                :current_value, :current_value_is_unrealized_gain, :sold, :cost_basis, :notes, :created_at, :updated_at
            )
            """,
            {**data, "created_at": created_at},
        )
    return get_holding(data["id"])


def update_holding(holding_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = validate_payload(payload, holding_id)
    with connect() as conn:
        result = conn.execute(
            """
            UPDATE holdings
            SET month = :month,
                institution = :institution,
                asset = :asset,
                category = :category,
                ticker = :ticker,
                current_value = :current_value,
                current_value_is_unrealized_gain = :current_value_is_unrealized_gain,
                sold = :sold,
                cost_basis = :cost_basis,
                notes = :notes,
                updated_at = :updated_at
            WHERE id = :id
            """,
            data,
        )
    if result.rowcount == 0:
        raise AppError(HTTPStatus.NOT_FOUND, "Holding not found.")
    return get_holding(holding_id)


def get_holding(holding_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,)).fetchone()
    if row is None:
        raise AppError(HTTPStatus.NOT_FOUND, "Holding not found.")
    return row_to_holding(row)


def delete_holding(holding_id: str) -> None:
    with connect() as conn:
        result = conn.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
    if result.rowcount == 0:
        raise AppError(HTTPStatus.NOT_FOUND, "Holding not found.")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/holdings":
            self.send_json({"holdings": list_holdings()})
            return
        if parsed.path == "/api/records":
            self.send_json({"records": list_records()})
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/holdings":
                self.send_json(create_holding(self.read_json()), HTTPStatus.CREATED)
                return
            if parsed.path == "/api/records":
                self.send_json(create_record(self.read_json()), HTTPStatus.CREATED)
                return
            raise AppError(HTTPStatus.NOT_FOUND, "Route not found.")
        except AppError as error:
            self.send_error_json(error.status, error.message)
        except json.JSONDecodeError:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON.")

    def do_PUT(self) -> None:
        try:
            parsed = urlparse(self.path)
            parts = parsed.path.strip("/").split("/")
            if len(parts) == 3 and parts[:2] == ["api", "holdings"]:
                self.send_json(update_holding(parts[2], self.read_json()))
                return
            raise AppError(HTTPStatus.NOT_FOUND, "Route not found.")
        except AppError as error:
            self.send_error_json(error.status, error.message)
        except json.JSONDecodeError:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON.")

    def do_DELETE(self) -> None:
        try:
            parsed = urlparse(self.path)
            parts = parsed.path.strip("/").split("/")
            if len(parts) == 3 and parts[:2] == ["api", "holdings"]:
                delete_holding(parts[2])
                self.send_json({"ok": True})
                return
            raise AppError(HTTPStatus.NOT_FOUND, "Route not found.")
        except AppError as error:
            self.send_error_json(error.status, error.message)

    def read_json(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: HTTPStatus, message: str) -> None:
        self.send_json({"error": message}, status)

def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Wealth Allocation Tracker running at http://127.0.0.1:8000")
    print(f"Local SQLite data: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
