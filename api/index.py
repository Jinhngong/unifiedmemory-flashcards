from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
import math

app = FastAPI()

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AMR Configuration ---
DEFAULT_STRENGTH = 1.0
RETENTION_TARGET = 0.85
MIN_INTERVAL_DAYS = 0.5
BOX_COUNT = 5
QUALITY_MULTIPLIER = {
    5: 1.30,
    4: 1.15,
    3: 1.05,
    2: 0.85,
    1: 0.6,
    0: 0.45
}

# --- Pydantic Models ---
class CardBase(BaseModel):
    front: str
    back: str

class CardCreate(CardBase):
    pass

class ReviewRequest(BaseModel):
    quality: int

class CardResponse(BaseModel):
    id: str
    front: str
    back: str
    strength: float
    box: int
    last_review: Optional[str]
    next_review: Optional[str]
    predicted_retention: float

class StatsResponse(BaseModel):
    total_cards: int
    due_today: int
    mastered: int
    learning: int

# --- AMR Logic Functions ---
def calculate_retention(strength: float, last_review: Optional[str]) -> float:
    """Calculate predicted retention based on forgetting curve."""
    if not last_review:
        return 0.0
    last_dt = datetime.fromisoformat(last_review)
    t_days = (datetime.utcnow() - last_dt).total_seconds() / 86400.0
    return math.exp(-t_days / max(1e-6, strength))

def schedule_next_review(strength: float, now: datetime) -> str:
    """Calculate next review time based on retention target."""
    t_days = -strength * math.log(RETENTION_TARGET)
    t_days = max(t_days, MIN_INTERVAL_DAYS)
    next_dt = now + timedelta(days=t_days)
    return next_dt.isoformat()

def update_card_on_review(card_data: dict, quality: int) -> dict:
    """Update card strength and schedule based on review quality."""
    if quality < 0 or quality > 5:
        raise ValueError("Quality must be 0-5")
    
    now = datetime.utcnow()
    
    # Update strength
    mult = QUALITY_MULTIPLIER.get(quality, 1.0)
    new_strength = max(0.1, card_data["strength"] * mult)
    
    # Bonus for perfect recall
    if quality == 5:
        new_strength += 0.2
    
    # Update Leitner box
    if quality >= 4:
        new_box = min(BOX_COUNT, card_data["box"] + 1)
    elif quality <= 2:
        new_box = 1
    else:
        new_box = card_data["box"]
    
    # Create history entry
    history_entry = {
        "time": now.isoformat(),
        "quality": quality,
        "old_strength": card_data["strength"],
        "old_box": card_data["box"],
        "new_strength": new_strength,
        "new_box": new_box
    }
    
    # Update card
    card_data["strength"] = new_strength
    card_data["box"] = new_box
    card_data["last_review"] = now.isoformat()
    card_data["next_review"] = schedule_next_review(new_strength, now)
    
    if "history" not in card_data:
        card_data["history"] = []
    card_data["history"].append(history_entry)
    
    return card_data

# --- API Endpoints ---
@app.get("/")
def read_root():
    return {"message": "AMR Flashcard API", "version": "1.0"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.post("/api/cards/calculate-retention")
def calculate_card_retention(strength: float, last_review: Optional[str] = None):
    """Calculate predicted retention for given parameters."""
    retention = calculate_retention(strength, last_review)
    return {"retention": retention}

@app.post("/api/cards/schedule")
def calculate_schedule(strength: float):
    """Calculate next review time for given strength."""
    next_review = schedule_next_review(strength, datetime.utcnow())
    return {"next_review": next_review}

# Health check for Vercel
@app.get("/api/ping")
def ping():
    return {"ping": "pong"}
