
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import FRONTEND_ORIGIN
from .db import db
from .routes import tutor, documents, learning, auth


app = FastAPI(
    title="BACKBENCH API",
    description="BACKBENCH — Just Learn Differently.",
    version="1.0.0"
)


# -----------------------------
# CORS CONFIGURATION
# -----------------------------

allowed_origins = list({
    FRONTEND_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173"
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# -----------------------------
# API ROUTES
# -----------------------------

app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["Authentication"]
)

app.include_router(
    tutor.router,
    prefix="/api/tutor",
    tags=["AI Tutor"]
)

app.include_router(
    documents.router,
    prefix="/api/documents",
    tags=["PDF Learning"]
)

app.include_router(
    learning.router,
    prefix="/api",
    tags=["Learning Tools"]
)


# -----------------------------
# ROOT ENDPOINT
# -----------------------------

@app.get("/")
def home():
    return {
        "message": "BACKBENCH API is running",
        "version": "1.0.0"
    }


# -----------------------------
# HEALTH CHECK
# -----------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "application": "BACKBENCH"
    }


# -----------------------------
# DATABASE HEALTH
# -----------------------------

@app.get("/api/health/db")
def db_health():

    try:
        db().command("ping")

        return {
            "status": "connected",
            "database": "MongoDB Atlas"
        }

    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "status": "disconnected",
                "detail": "Unable to connect to MongoDB."
            }
        )
