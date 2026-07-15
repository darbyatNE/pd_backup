"""
Power Dime - Python Microservice (ML/Analytics)
FastAPI-based microservice for machine learning and analytics
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from typing import Optional

# Initialize FastAPI app
app = FastAPI(
    title="Power Dime ML Service",
    description="Machine Learning and Analytics Microservice",
    version="1.0.0"
)

# CORS configuration: restrict to an explicit allowlist via ALLOWED_ORIGINS
# (comma-separated). Falls back to local dev origins when unset. Never combine
# a wildcard origin with credentials.
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8000))


# ============================================
# Models
# ============================================

class HealthResponse(BaseModel):
    status: str
    message: str
    environment: str


class PredictionRequest(BaseModel):
    feature1: float
    feature2: float
    feature3: Optional[float] = None


class PredictionResponse(BaseModel):
    prediction: float
    confidence: float


# ============================================
# Routes
# ============================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for ALB"""
    return {
        "status": "ok",
        "message": "Python ML service is running",
        "environment": ENVIRONMENT
    }


@app.get("/ml/")
async def root():
    """Root endpoint"""
    return {
        "service": "Power Dime ML Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "predict": "/ml/predict",
            "analytics": "/ml/analytics"
        }
    }


@app.post("/ml/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Placeholder prediction endpoint
    Replace with actual ML model inference
    """
    # TODO: Implement actual ML model
    # For now, return dummy prediction
    prediction = (request.feature1 + request.feature2) / 2
    confidence = 0.85

    return {
        "prediction": prediction,
        "confidence": confidence
    }


@app.get("/ml/analytics/{project_id}")
async def get_analytics(project_id: str):
    """
    Placeholder analytics endpoint
    Get analytics for a specific project
    """
    # TODO: Implement actual analytics logic
    return {
        "project_id": project_id,
        "metrics": {
            "total_energy": 1000,
            "efficiency_score": 0.85,
            "cost_savings": 5000
        }
    }


# ============================================
# Startup/Shutdown Events
# ============================================

@app.on_event("startup")
async def startup_event():
    """Run on service startup"""
    print(f"🚀 Python ML Service starting in {ENVIRONMENT} mode on port {PORT}")
    # TODO: Load ML models here


@app.on_event("shutdown")
async def shutdown_event():
    """Run on service shutdown"""
    print("👋 Python ML Service shutting down")
    # TODO: Cleanup resources


# ============================================
# Main
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        reload=ENVIRONMENT == "development"
    )
