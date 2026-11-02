from datetime import timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from ..auth_utils import (
    create_access_token,
    hash_otp,
    hash_password,
    make_aware_utc,
    new_otp,
    send_verification_email,
    utcnow,
    verify_password,
)
from ..config import (
    ACCESS_TOKEN_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET,
    OTP_EXPIRE_MINUTES,
    OTP_RESEND_SECONDS,
)
from ..db import db

router = APIRouter()


# -----------------------------
# Request Models
# -----------------------------

class SignupBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class EmailBody(BaseModel):
    email: EmailStr


class VerifyBody(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\\d{6}$")


class LoginBody(BaseModel):
    email: EmailStr
    password: str


# -----------------------------
# Collections
# -----------------------------

def users():
    collection = db().users
    collection.create_index("email", unique=True)
    return collection


def pending_users():
    collection = db().pending_users
    collection.create_index("email", unique=True)
    return collection


def otp_records():
    collection = db().email_otps
    collection.create_index("email", unique=True)
    return collection


# -----------------------------
# OTP Generation and Delivery
# -----------------------------

def issue_otp(email: str):
    collection = otp_records()
    existing = collection.find_one({"email": email})
    now = utcnow()

    # MongoDB's default PyMongo client returns naive UTC datetimes.
    if existing and existing.get("last_sent_at"):
        last_sent_at = make_aware_utc(existing["last_sent_at"])
        elapsed = (now - last_sent_at).total_seconds()

        if elapsed < OTP_RESEND_SECONDS:
            remaining = int(OTP_RESEND_SECONDS - elapsed) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before requesting another code.",
            )

    otp = new_otp()

    collection.update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "otp_hash": hash_otp(email, otp),
                "expires_at": now + timedelta(minutes=OTP_EXPIRE_MINUTES),
                "last_sent_at": now,
                "attempts": 0,
            }
        },
        upsert=True,
    )

    try:
        send_verification_email(email, otp)
    except Exception:
        # Do not expose SMTP credentials or server details to the browser.
        collection.delete_one({"email": email})
        raise HTTPException(
            status_code=503,
            detail="Unable to send the verification email. Check your SMTP settings in backend/.env.",
        )

    return {"message": "Verification code sent. Check your email."}


# -----------------------------
# Signup
# -----------------------------

@router.post("/signup")
def signup(body: SignupBody):
    email = str(body.email).lower().strip()

    if users().find_one({"email": email}):
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Please sign in.",
        )

    pending_users().update_one(
        {"email": email},
        {
            "$set": {
                "name": body.name.strip(),
                "email": email,
                "password_hash": hash_password(body.password),
                "created_at": utcnow(),
            }
        },
        upsert=True,
    )

    return issue_otp(email)


# -----------------------------
# Verify Email OTP
# -----------------------------

@router.post("/verify-email")
def verify_email(body: VerifyBody):
    email = str(body.email).lower().strip()

    otp_doc = otp_records().find_one({"email": email})
    pending = pending_users().find_one({"email": email})

    if not otp_doc or not pending:
        raise HTTPException(
            status_code=400,
            detail="No pending verification found. Please sign up again.",
        )

    # Fix timezone mismatch: MongoDB returns naive datetimes by default.
    expires_at = make_aware_utc(otp_doc["expires_at"])

    if expires_at < utcnow():
        raise HTTPException(
            status_code=400,
            detail="This code has expired. Request a new one.",
        )

    if otp_doc.get("attempts", 0) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Request a new code.",
        )

    if otp_doc["otp_hash"] != hash_otp(email, body.otp):
        otp_records().update_one(
            {"email": email},
            {"$inc": {"attempts": 1}},
        )
        raise HTTPException(
            status_code=400,
            detail="Incorrect verification code.",
        )

    user_document = {
        "name": pending["name"],
        "email": email,
        "password_hash": pending["password_hash"],
        "email_verified": True,
        "created_at": pending["created_at"],
    }

    try:
        result = users().insert_one(user_document)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Please sign in.",
        )

    pending_users().delete_one({"email": email})
    otp_records().delete_one({"email": email})

    token = create_access_token(str(result.inserted_id), email)

    return {
        "message": "Email verified. Welcome to BACKBENCH!",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(result.inserted_id),
            "name": user_document["name"],
            "email": email,
        },
    }


# -----------------------------
# Resend OTP
# -----------------------------

@router.post("/resend-otp")
def resend_otp(body: EmailBody):
    email = str(body.email).lower().strip()

    if not pending_users().find_one({"email": email}):
        raise HTTPException(
            status_code=404,
            detail="No pending signup found for this email.",
        )

    return issue_otp(email)


# -----------------------------
# Login
# -----------------------------

@router.post("/login")
def login(body: LoginBody):
    email = str(body.email).lower().strip()
    user = users().find_one({"email": email})

    if not user or not verify_password(
        body.password,
        user.get("password_hash", ""),
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    if not user.get("email_verified"):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in.",
        )

    token = create_access_token(str(user["_id"]), email)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": email,
        },
    }


# -----------------------------
# Current User Dependency
# -----------------------------

def current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Please sign in to continue.",
        )

    if not JWT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET is not configured on the server.",
        )

    try:
        payload = jwt.decode(
            authorization[7:],
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid session.",
            )

        user = users().find_one(
            {
                "_id": ObjectId(user_id),
                "email_verified": True,
            }
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Your session is no longer valid. Please sign in again.",
            )

        return {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
        }

    except (JWTError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Your session has expired. Please sign in again.",
        )


# -----------------------------
# Session Check
# -----------------------------

@router.get("/me")
def me(user=Depends(current_user)):
    return {"user": user}


# -----------------------------
# Logout
# -----------------------------

@router.post("/logout")
def logout(user=Depends(current_user)):
    # JWT is stateless; the frontend removes the token on logout.
    return {"message": "Signed out successfully."}
