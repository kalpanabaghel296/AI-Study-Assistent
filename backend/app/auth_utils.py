import hashlib
import hmac
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from jose import jwt

from .config import (
    JWT_SECRET,
    JWT_ALGORITHM,
    ACCESS_TOKEN_MINUTES,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    OTP_EXPIRE_MINUTES,
)


def utcnow():
    return datetime.now(timezone.utc)


def make_aware_utc(value):
    """PyMongo returns naive datetimes by default; those represent UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
    )
    return f"{salt.hex()}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, digest_hex = stored_hash.split("$", 1)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=2**14,
            r=8,
            p=1,
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, AttributeError):
        return False


def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(email: str, otp: str) -> str:
    payload = f"{email.lower()}:{otp}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def create_access_token(user_id: str, email: str) -> str:
    if not JWT_SECRET or len(JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET is missing or too short. Set a random secret of at least 32 characters in backend/.env."
        )

    expires_at = utcnow() + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def send_verification_email(to_email: str, otp: str):
    if not all((SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL)):
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_USERNAME, SMTP_PASSWORD and SMTP_FROM_EMAIL in backend/.env."
        )

    message = EmailMessage()
    message["Subject"] = "Your BACKBENCH verification code"
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message.set_content(
        "Welcome to BACKBENCH!\n\n"
        f"Your email verification code is: {otp}\n\n"
        f"This code expires in {OTP_EXPIRE_MINUTES} minutes. "
        "If you did not request this code, you can ignore this email.\n\n"
        "Just Learn Differently.\n"
        "BACKBENCH"
    )

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(message)
