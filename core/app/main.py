from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import cv, matching, analytics
from app.config import settings

app = FastAPI(title="Ostia Core", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(cv.router, prefix="/cv", tags=["cv"])
app.include_router(matching.router, prefix="/matching", tags=["matching"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])


@app.get("/health")
def health():
    return {"status": "ok"}
