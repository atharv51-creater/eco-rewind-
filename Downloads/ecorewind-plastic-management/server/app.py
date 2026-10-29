"""FastAPI REST Service for EcoRewind Reverse Vending Machine Platform."""
from __future__ import annotations

import os
import glob
import base64
import hashlib
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Response, HTTPException, Header, Depends, Query, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from server.db import Database
from server.classifier import Classifier

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "scanner.db"
MODEL_PATH = BASE_DIR / "models" / "ecorewind_classifier.keras"
LABELS_PATH = BASE_DIR / "models" / "labels.json"
DATASET_DIR = BASE_DIR / "dataset" / "train"

app = FastAPI(
    title="EcoRewind API",
    description="Live AI Scanner, Wallet Ledger, and Hardware Fleet Manager",
    version="1.0.0",
)

# Enable permissive CORS for frontend dev server & local kiosk access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database and Classifier
db = Database(DB_PATH)
ML_THRESHOLD = float(os.getenv("ML_THRESHOLD", "0.75"))
classifier = Classifier(MODEL_PATH, LABELS_PATH, threshold=ML_THRESHOLD)

# The Python service is an inference microservice. Its legacy wallet/admin
# routes are disabled unless an explicit internal key is configured.
ML_INTERNAL_KEY = os.getenv("ML_INTERNAL_KEY", "")
_INFERENCE_PATHS = {
    "/health", "/api/health",
    "/model-info", "/api/model-info",
    "/rates", "/api/rates",
    "/classify", "/api/classify",
    "/sample", "/api/sample",
    "/scan", "/api/scan",
}


@app.middleware("http")
async def restrict_to_inference(request: Request, call_next):
    path = request.url.path
    if path not in _INFERENCE_PATHS and not ML_INTERNAL_KEY:
        return JSONResponse(
            status_code=404,
            content={"detail": "Inference-only service. Set ML_INTERNAL_KEY to enable legacy routes."},
        )
    if path not in _INFERENCE_PATHS and request.headers.get("x-internal-key") != ML_INTERNAL_KEY:
        return JSONResponse(status_code=401, content={"detail": "Invalid internal key"})
    return await call_next(request)


# --- REQUEST & RESPONSE SCHEMAS ---
class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: str = ""
    password: str
    upi_id: str = ""


class WithdrawalRequest(BaseModel):
    amount_paise: int = Field(gt=0)
    destination: str


class RatesUpdateRequest(BaseModel):
    rates_paise_per_gram: dict[str, int]
    accepted_classes: list[str] | None = None
    min_weight_g: float | None = 100.0
    max_weight_g: float | None = 500.0
    bonus_threshold_g: float | None = 400.0
    bonus_pct: int | None = 10


def _extract_user_from_token(authorization: str | None = Header(None)) -> dict:
    if not authorization:
        # Default fallback to demo user
        user = db.get_user("user-atharv-01")
        return user or {"id": "user-atharv-01", "name": "Atharv Ubale", "email": "user@ecorewind.com", "role": "user"}
    token = authorization.replace("Bearer ", "").strip()
    if token.startswith("user_"):
        user_id = token.replace("user_", "")
        user = db.get_user(user_id)
        if user:
            return user
    # Try finding user by token match or default user
    user = db.get_user("user-atharv-01")
    return user or {"id": "user-atharv-01", "name": "Atharv Ubale", "email": "user@ecorewind.com", "role": "user"}


# =====================================================================
# 1. HEALTH & METRICS
# =====================================================================
@app.get("/health")
@app.get("/api/health")
def get_health():
    rates = db.get_rates()
    return {
        "status": "ok" if classifier.ready else "degraded",
        "model_ready": classifier.ready,
        "model_detail": classifier.detail,
        "model_path": str(MODEL_PATH),
        "labels_path": str(LABELS_PATH),
        "threshold": classifier.threshold,
        "accepted_classes": rates.get("accepted_classes", ["aluminium_can", "plastic_bag", "plastic_bottle"]),
        "database_path": str(DB_PATH),
        "version": "1.0.0",
    }


@app.get("/model-info")
@app.get("/api/model-info")
def get_model_info():
    return {
        "model_loaded": classifier.ready,
        "labels": classifier.labels,
        "threshold": classifier.threshold,
        "detail": classifier.detail,
    }


# =====================================================================
# 2. TARIFF RATES
# =====================================================================
@app.get("/rates")
@app.get("/api/rates")
def get_rates():
    return db.get_rates()


@app.put("/admin/rates")
@app.put("/api/admin/rates")
def update_rates(body: RatesUpdateRequest):
    rates_data = {
        "rates_paise_per_gram": body.rates_paise_per_gram,
        "accepted_classes": body.accepted_classes or list(body.rates_paise_per_gram.keys()),
        "min_weight_g": body.min_weight_g or 100.0,
        "max_weight_g": body.max_weight_g or 500.0,
        "bonus_threshold_g": body.bonus_threshold_g or 400.0,
        "bonus_pct": body.bonus_pct or 10,
    }
    return db.update_rates(rates_data)


# =====================================================================
# 3. LIVE CLASSIFIER INFERENCE
# =====================================================================
@app.post("/classify")
@app.post("/api/classify")
async def classify_frame(request: Request, image: UploadFile = File(None)):
    """Classifies an incoming frame from live camera, photo upload, or test string."""
    rates = db.get_rates()
    rates_map = rates.get("rates_paise_per_gram", {})

    img_bytes = None
    if image is not None:
        img_bytes = await image.read()
    else:
        # Check if sent as JSON with base64 dataUrl
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    # Could be { "image": "data:image/jpeg;base64,..." } or { "label": "plastic_bottle" }
                    if "image" in body:
                        img_str = body["image"]
                        if "," in img_str:
                            img_str = img_str.split(",", 1)[1]
                        img_bytes = base64.b64decode(img_str)
                    elif "label" in body or "category" in body:
                        # Synthetic test request (e.g. from TestsPage)
                        label = body.get("label") or body.get("category")
                        sample_files = glob.glob(str(DATASET_DIR / label / "*.jpg"))
                        if sample_files:
                            with open(sample_files[0], "rb") as f:
                                img_bytes = f.read()
            except Exception:
                pass

    if not img_bytes or len(img_bytes) < 50:
        return {
            "decision": "rejected",
            "reason": "Chamber empty or align item in focus",
            "label": "other_invalid",
            "display_label": "Chamber empty",
            "confidence": 0.0,
            "scores": {k: 0.0 for k in classifier.labels},
            "rate_paise_per_gram": 0,
            "key": "other_invalid",
            "valid": False,
            "model": "4-Class MobileNetV2",
        }

    result = classifier.classify_image_bytes(img_bytes, rates_map)
    print(f"[AI Scanner] {result['display_label']} ({result['confidence']:.1%}) -> {result['decision'].upper()} (payout: ₹{result['rate_paise_per_gram']/100:.2f}/g)")
    return result


# =====================================================================
# 4. DATASET TEST SAMPLE LOADER
# =====================================================================
@app.get("/sample")
@app.get("/api/sample")
def get_sample_image(class_name: str = Query("plastic_bottle", alias="class")):
    sample_files = glob.glob(str(DATASET_DIR / class_name / "*.jpg"))
    if not sample_files:
        # Fallback to any file in dataset
        sample_files = glob.glob(str(DATASET_DIR / "*" / "*.jpg"))

    if sample_files:
        with open(sample_files[0], "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        return {
            "ok": True,
            "category": class_name,
            "dataUrl": f"data:image/jpeg;base64,{b64}",
        }
    return JSONResponse(status_code=404, content={"ok": False, "error": "Sample image not found"})


# =====================================================================
# 5. SCAN INFERENCE (the Node backend owns the reward ledger)
# =====================================================================
@app.post("/scan")
@app.post("/api/scan")
async def scan_deposit(
    request: Request,
    image: UploadFile = File(None),
    user_id: str = Form("anonymous"),
    weight_grams: float = Form(0.0),
    machine_id: str = Form("RVM-01"),
):
    """Classify a deposit frame. This endpoint never credits a wallet."""
    rates = db.get_rates()
    rates_map = rates.get("rates_paise_per_gram", {})

    img_bytes = b""
    if image is not None:
        img_bytes = await image.read()
    else:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    weight_grams = float(body.get("weight_grams", weight_grams) or 0)
                    user_id = str(body.get("user_id", user_id) or user_id)
                    machine_id = str(body.get("machine_id", machine_id) or machine_id)
                    if body.get("image"):
                        img_str = body["image"]
                        if "," in img_str:
                            img_str = img_str.split(",", 1)[1]
                        img_bytes = base64.b64decode(img_str)
            except Exception:
                pass

    if not img_bytes:
        raise HTTPException(status_code=400, detail="image is required")

    img_sha = hashlib.sha256(img_bytes).hexdigest()
    prediction = classifier.classify_image_bytes(img_bytes, rates_map)

    return {
        **prediction,
        "weight_grams": weight_grams,
        "user_id": user_id,
        "machine_id": machine_id,
        "image_sha256": img_sha,
        "model": "4-Class MobileNetV2",
    }


# =====================================================================
# 6. AUTHENTICATION & PROFILE
# =====================================================================
@app.post("/auth/login")
@app.post("/api/auth/login")
def login(payload: LoginRequest):
    user = db.authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"})
    token = f"jwt_{user['id']}_{os.urandom(8).hex()}"
    return {
        "token": token,
        "user": user,
        "role": user["role"],
    }


@app.post("/auth/register")
@app.post("/api/auth/register")
def register(payload: RegisterRequest):
    try:
        user = db.register_user(
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            password=payload.password,
            upi_id=payload.upi_id,
        )
        token = f"jwt_{user['id']}_{os.urandom(8).hex()}"
        return {
            "token": token,
            "user": user,
            "role": user["role"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "REGISTRATION_ERROR", "message": str(e)})


@app.get("/users/me")
@app.get("/api/users/me")
def get_me(user: dict = Depends(_extract_user_from_token)):
    wallet = db.get_wallet(user["id"])
    return {
        "user": user,
        "wallet": wallet,
    }


# =====================================================================
# 7. WALLET & TRANSACTIONS
# =====================================================================
@app.get("/users/{user_id}/wallet")
@app.get("/api/users/{user_id}/wallet")
def get_user_wallet(user_id: str):
    return db.get_wallet(user_id)


@app.get("/users/{user_id}/transactions")
@app.get("/api/users/{user_id}/transactions")
def get_user_transactions(
    user_id: str,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    filter: str = Query("all"),
):
    items, total = db.list_transactions(user_id=user_id, limit=limit, offset=offset, status=filter)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/transactions")
@app.get("/api/transactions")
def get_all_transactions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    filter: str = Query("all"),
):
    items, total = db.list_transactions(user_id="all", limit=limit, offset=offset, status=filter)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# =====================================================================
# 8. UPI WITHDRAWALS
# =====================================================================
@app.post("/users/{user_id}/withdrawals", status_code=201)
@app.post("/api/users/{user_id}/withdrawals", status_code=201)
def create_withdrawal(
    user_id: str,
    body: WithdrawalRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    if not idempotency_key:
        idempotency_key = f"wd-{os.urandom(8).hex()}"
    destination = body.destination.strip()
    request_hash = hashlib.sha256(f"{user_id}:{body.amount_paise}:{destination}".encode()).hexdigest()
    try:
        withdrawal, wallet, duplicate = db.create_withdrawal(
            user_id=user_id,
            amount_paise=body.amount_paise,
            destination=destination,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        return {
            "duplicate": duplicate,
            "withdrawal": withdrawal,
            "wallet": wallet,
        }
    except ValueError as e:
        raise HTTPException(status_code=409, detail={"code": "INSUFFICIENT_FUNDS", "message": str(e)})


@app.get("/users/{user_id}/withdrawals")
@app.get("/api/users/{user_id}/withdrawals")
def get_user_withdrawals(
    user_id: str,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    items, total = db.list_withdrawals(user_id=user_id, limit=limit, offset=offset)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# =====================================================================
# 9. ADMIN CONSOLE APIS
# =====================================================================
@app.get("/admin/stats")
@app.get("/api/admin/stats")
def get_admin_stats():
    return db.get_admin_stats()


@app.get("/admin/users")
@app.get("/api/admin/users")
def get_admin_users():
    return db.list_users()


@app.get("/admin/machines")
@app.get("/api/admin/machines")
def get_admin_machines():
    return db.list_machines()


@app.get("/admin/transactions")
@app.get("/api/admin/transactions")
def get_admin_transactions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    items, total = db.list_transactions(user_id="all", limit=limit, offset=offset)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.post("/admin/withdrawals/{withdrawal_id}/complete")
@app.post("/api/admin/withdrawals/{withdrawal_id}/complete")
def complete_withdrawal(withdrawal_id: str):
    try:
        withdrawal, wallet = db.update_withdrawal(withdrawal_id, "paid")
        return {
            "duplicate": False,
            "withdrawal": withdrawal,
            "wallet": wallet,
        }
    except LookupError as e:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": str(e)})


@app.post("/admin/withdrawals/{withdrawal_id}/cancel")
@app.post("/api/admin/withdrawals/{withdrawal_id}/cancel")
def cancel_withdrawal(withdrawal_id: str):
    try:
        withdrawal, wallet = db.update_withdrawal(withdrawal_id, "cancelled")
        return {
            "duplicate": False,
            "withdrawal": withdrawal,
            "wallet": wallet,
        }
    except LookupError as e:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": str(e)})
