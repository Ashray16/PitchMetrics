from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import json
import asyncio
import os
import functools
import logging
from fastapi import FastAPI, WebSocket, HTTPException, Path, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_client_id(request: Request):
    return request.headers.get("X-Client-ID", get_remote_address(request))

limiter = Limiter(key_func=get_client_id, default_limits=["100/minute"])

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Request size limit (10MB)
        if request.headers.get("content-length"):
            if int(request.headers["content-length"]) > 10 * 1024 * 1024:
                logger.warning(f"Payload too large from {get_client_id(request)}")
                return JSONResponse(status_code=413, content={"detail": "Payload too large"})
        
        # Logging
        logger.info(f"Request: {request.method} {request.url.path} from {get_client_id(request)}")
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Error processing request: {str(e)}")
            raise e
from backend.engines.tracking_engine import detect_possessions, get_possessions_list
from backend.engines.formation_engine import get_formation_shape
from backend.engines.decision_engine import DecisionEngine
from backend.engines.pitch_control_engine import PitchControlModel
from backend.engines.passing_engine import PassingEngine
from backend.engines.state_engine import StateEngine
from backend.engines.predictive_engine import predictive_engine
from backend.engines.defensive_engine import defensive_engine
from backend.engines.pattern_engine import pattern_engine
from backend.engines.xt_engine import xt_engine
from backend.engines.heatmap_engine import heatmap_engine
from backend.engines.physical_engine import physical_engine
from backend.engines.passing_engine import passing_engine
from backend.engines.space_engine import SpaceEngine
from backend.data_loaders.skillcorner import load_skillcorner_data

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False if "*" in origins else True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(SecurityMiddleware)

# In-memory data store
DATA = {
    "tracking": None,
    "possessions": [],
    "max_frames": 0,
    "playback_frames": [],
    "events": []
}

decision_engine = DecisionEngine(pitch_length=105.0, pitch_width=68.0)
pc_engine = PitchControlModel(pitch_length=105.0, pitch_width=68.0)
passing_engine = PassingEngine(pitch_length=105.0, pitch_width=68.0)
state_engine = StateEngine(length=105.0, width=68.0)

import os
import json
import numpy as np

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NumpyEncoder, self).default(obj)

def load_match_into_memory(match_id: str):
    print(f"Loading Tracking Data for match {match_id}...", flush=True)
    try:
        # Load SkillCorner instead of Metrica
        df = load_skillcorner_data(match_id=match_id)
        if df is None:
            print("Failed to load SkillCorner dataset. Using fallback?", flush=True)
            return
            
        print("Data loaded. Computing possessions...", flush=True)
        
        # SkillCorner data is typically 10 FPS extrapolated
        df = df.copy()
        df = detect_possessions(df, fps=10)
        # Scale entire dataframe to [0, 120] and [0, 80]
        for c in df.columns:
            if c.startswith('home_') or c.startswith('away_'):
                if c.endswith('_x'):
                    df[c] = df[c] * 120.0
                elif c.endswith('_y'):
                    df[c] = df[c] * 80.0
                    
        if 'ball_x' in df.columns:
            df['ball_x'] = df['ball_x'] * 120.0
        if 'ball_y' in df.columns:
            df['ball_y'] = df['ball_y'] * 80.0
            
        # Detect Goalkeepers
        df_early = df.head(5000)
        home_cols = [c for c in df_early.columns if c.startswith('home_') and c.endswith('_x')]
        away_cols = [c for c in df_early.columns if c.startswith('away_') and c.endswith('_x')]
        
        home_means = {c: df_early[c].mean() for c in home_cols if not pd.isna(df_early[c].mean())}
        if home_means:
            home_gk_col = min(home_means, key=lambda c: min(home_means[c], 120.0 - home_means[c]))
            DATA["home_gk"] = home_gk_col.split('_')[1]
            
        away_means = {c: df_early[c].mean() for c in away_cols if not pd.isna(df_early[c].mean())}
        if away_means:
            away_gk_col = min(away_means, key=lambda c: min(away_means[c], 120.0 - away_means[c]))
            DATA["away_gk"] = away_gk_col.split('_')[1]
            
        print(f"Detected GKs - Home: {DATA.get('home_gk', '11')}, Away: {DATA.get('away_gk', '25')}", flush=True)
                    
        DATA["tracking"] = df
        DATA["possessions"] = get_possessions_list(df, fps=10)
        DATA["max_frames"] = len(df)
        print(f"Computed {len(DATA['possessions'])} possession sequences.", flush=True)
        
        print("Precomputing velocities...", flush=True)
        df_shifted = df.shift(5)
        dt = 0.5
        home_cols = [c for c in df.columns if c.startswith('home_') and c.endswith('_x')]
        away_cols = [c for c in df.columns if c.startswith('away_') and c.endswith('_x')]
        
        for c in home_cols + away_cols:
            vx_col = c.replace('_x', '_vx')
            vy_col = c.replace('_x', '_vy')
            df[vx_col] = (df[c] - df_shifted[c]) / dt
            df[vy_col] = (df[c.replace('_x', '_y')] - df_shifted[c.replace('_x', '_y')]) / dt
            
        print("Skipping pre-packaging to save 700MB of RAM!", flush=True)
        
        # Load match events (Goals, Cards)
        base_dir = os.path.join(os.path.dirname(__file__), "skillcorner_data", "data", "matches", str(match_id))
        match_json = os.path.join(base_dir, f"{match_id}_match.json")
        if os.path.exists(match_json):
            with open(match_json, 'r') as f:
                mData = json.load(f)
                
            dynamic_csv = os.path.join(base_dir, f"{match_id}_dynamic_events.csv")
            goals_frames = []
            if os.path.exists(dynamic_csv):
                dyn_df = pd.read_csv(dynamic_csv)
                if 'lead_to_goal' in dyn_df.columns:
                    goals_df = dyn_df[dyn_df['lead_to_goal'] == True]
                    # Simple heuristic: cluster close frames for same goal
                    for frame in goals_df['frame_start']:
                        if not goals_frames or frame - goals_frames[-1] > 1000:
                            goals_frames.append(frame)
            
            goal_idx = 0
            card_frame_counter = 40000 # mock frames for cards in 2nd half since no timestamp data exists
            for p in m_data.get('players', []):
                name = p.get('short_name')
                team = 'Home' if p.get('team_id') == m_data.get('home_team', {}).get('id') else 'Away'
                
                # Goals
                for _ in range(p.get('goal', 0)):
                    frame = goals_frames[goal_idx] if goal_idx < len(goals_frames) else 30000
                    events.append({'player': name, 'team': team, 'type': 'goal', 'frame': int(frame)})
                    goal_idx += 1
                
                # Yellow Cards
                for _ in range(p.get('yellow_card', 0)):
                    events.append({'player': name, 'team': team, 'type': 'yellow_card', 'frame': card_frame_counter})
                    card_frame_counter += 3000
                    
                # Red Cards
                for _ in range(p.get('red_card', 0)):
                    events.append({'player': name, 'team': team, 'type': 'red_card', 'frame': card_frame_counter})
                    card_frame_counter += 3000
                    
        DATA["events"] = events
        
    except Exception as e:
        print(f"Error loading data: {e}", flush=True)

@app.on_event("startup")
async def startup_event():
    load_match_into_memory("1886347")

@app.get("/matches")
def get_matches():
    import pathlib
    data_dir = os.getenv("DATA_DIR", str(pathlib.Path(__file__).parent / "skillcorner_data" / "data"))
    matches_dir = pathlib.Path(data_dir) / "matches"
    available = []
    
    if not matches_dir.exists():
        return {"matches": []}
        
    for folder in os.listdir(matches_dir):
        folder_path = matches_dir / folder
        if folder_path.is_dir():
            match_json = folder_path / f"{folder}_match.json"
            if match_json.exists():
                with open(match_json, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    available.append({
                        "id": folder,
                        "home_team": meta.get("home_team", {}).get("name", "Unknown Home"),
                        "away_team": meta.get("away_team", {}).get("name", "Unknown Away"),
                        "home_score": meta.get("home_team_score", 0),
                        "away_score": meta.get("away_team_score", 0),
                        "date": meta.get("date_time", "")
                    })
    return {"matches": available}

@app.post("/matches/load/{match_id}")
@limiter.limit("10/minute")
def load_match(request: Request, match_id: int = Path(..., ge=0)):
    load_match_into_memory(match_id)
    return {"status": "success", "match_id": match_id}

@app.get("/possessions")
def get_possessions():
    return {
        "possessions": DATA["possessions"],
        "max_frames": DATA["max_frames"]
    }

@app.get("/events")
def get_events():
    return {"events": DATA.get("events", [])}

@app.get("/roster")
def get_roster():
    df = DATA.get("tracking")
    if df is None:
        return {"home": [], "away": []}
    
    home_players = []
    away_players = []
    
    for c in df.columns:
        if c.startswith('home_') and c.endswith('_x'):
            pid = c.split('_')[1]
            if pid not in home_players:
                home_players.append(pid)
        elif c.startswith('away_') and c.endswith('_x'):
            pid = c.split('_')[1]
            if pid not in away_players:
                away_players.append(pid)
                
    # Sort them numerically if possible
    home_players.sort(key=lambda x: int(x) if x.isdigit() else x)
    away_players.sort(key=lambda x: int(x) if x.isdigit() else x)
    
    return {
        "home": [{"id": pid, "label": f"{pid}"} for pid in home_players],
        "away": [{"id": pid, "label": f"{pid}"} for pid in away_players]
    }

@app.get("/gks")
def get_gks():
    return {
        "home_gk": DATA.get("home_gk", "11"),
        "away_gk": DATA.get("away_gk", "25")
    }

@app.get("/possessions/{possession_id}/frames")
@limiter.limit("50/minute")
def get_possession_frames(request: Request, possession_id: int = Path(..., ge=0)):
    # Find the possession index
    poss_idx = next((i for i, p in enumerate(DATA["possessions"]) if p["id"] == possession_id), None)
    if poss_idx is None:
        raise HTTPException(status_code=404, detail="Possession not found")
        
    poss = DATA["possessions"][poss_idx]
    start_idx = poss["start_frame"]
    end_idx = poss["end_frame"]
    
    # Extend end_idx up to 80 frames (8 seconds) to view goal aftermath, bounded by next possession
    if poss_idx + 1 < len(DATA["possessions"]):
        next_start = DATA["possessions"][poss_idx + 1]["start_frame"]
        max_allowed_end = max(end_idx, next_start - 1)
        end_idx = min(end_idx + 80, max_allowed_end)
    else:
        end_idx = min(end_idx + 80, DATA["max_frames"] - 1)
    
    # Package frames on the fly to save RAM
    df_slice = DATA["tracking"].iloc[start_idx:end_idx+1]
    
    home_cols = [c for c in df_slice.columns if c.startswith('home_') and c.endswith('_x')]
    away_cols = [c for c in df_slice.columns if c.startswith('away_') and c.endswith('_x')]
    
    frames = []
    for i in range(len(df_slice)):
        row = df_slice.iloc[i]
        
        home_pts = []
        for c in home_cols:
            if not pd.isna(row[c]):
                y = row[c.replace('_x', '_y')]
                vx = row.get(c.replace('_x', '_vx'), 0)
                vy = row.get(c.replace('_x', '_vy'), 0)
                if not pd.isna(y):
                    home_pts.append({"id": c.split('_')[1], "x": round(row[c], 2), "y": round(y, 2), "vx": round(vx, 2) if not pd.isna(vx) else 0, "vy": round(vy, 2) if not pd.isna(vy) else 0})
        
        away_pts = []
        for c in away_cols:
            if not pd.isna(row[c]):
                y = row[c.replace('_x', '_y')]
                vx = row.get(c.replace('_x', '_vx'), 0)
                vy = row.get(c.replace('_x', '_vy'), 0)
                if not pd.isna(y):
                    away_pts.append({"id": c.split('_')[1], "x": round(row[c], 2), "y": round(y, 2), "vx": round(vx, 2) if not pd.isna(vx) else 0, "vy": round(vy, 2) if not pd.isna(vy) else 0})
                    
        bx = row.get('ball_x', np.nan)
        by = row.get('ball_y', np.nan)
        ball = {"x": round(bx, 2), "y": round(by, 2)} if not pd.isna(bx) else None
        
        frames.append({
            "f": int(start_idx + i),
            "h": home_pts,
            "a": away_pts,
            "b": ball,
            "team_poss": row.get('possession_team', 'None')
        })
        
    return {"frames": frames}

SPACE_CACHE = {}
@app.get("/analysis/space/{frame}")
@limiter.limit("30/minute")
def get_space_analysis(request: Request, frame: int = Path(..., ge=0)):
    if frame in SPACE_CACHE:
        return SPACE_CACHE[frame]
    df = DATA.get("tracking")
    if df is None:
        raise HTTPException(status_code=400, detail="Data not loaded")
        
    try:
        # Get frame data
        if frame >= len(df):
            raise HTTPException(status_code=404, detail="Frame not found")
            
        row = df.iloc[frame]
        space_data = SpaceEngine.calculate_space_metrics(row)
        res = json.loads(json.dumps(space_data, cls=NumpyEncoder))
        SPACE_CACHE[frame] = res
        return res
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

XT_CACHE = {}
@app.get("/analysis/xt/{frame}")
@limiter.limit("30/minute")
def get_xt_analysis(request: Request, frame: int = Path(..., ge=0)):
    if frame in XT_CACHE:
        return XT_CACHE[frame]
    df = DATA.get("tracking")
    if df is None:
        raise HTTPException(status_code=400, detail="Data not loaded")
        
    try:
        if frame >= len(df):
            raise HTTPException(status_code=404, detail="Frame not found")
            
        row = df.iloc[frame]
        team_poss = row.get('possession_team', 'None')
        xt_data = xt_engine.calculate_xt_metrics(row, team_poss)
        res = json.loads(json.dumps(xt_data, cls=NumpyEncoder))
        XT_CACHE[frame] = res
        return res
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis/heatmap/{frame}")
def get_heatmap_analysis(frame: int, type: str = 'team', player: str = None, team: str = 'Home'):
    df = DATA.get("tracking")
    if df is None:
        raise HTTPException(status_code=400, detail="Data not loaded")
        
    try:
        if frame >= len(df):
            raise HTTPException(status_code=404, detail="Frame not found")
            
        heatmap_grid = heatmap_engine.generate_heatmap(df, frame, type, player, team)
        
        return json.loads(json.dumps({
            "heatmap_grid": heatmap_grid,
            "type": type,
            "player": player,
            "team": team
        }, cls=NumpyEncoder))
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis/physical/{frame}")
def get_physical_analysis(frame: int, team: str = 'Home'):
    df = DATA.get("tracking")
    if df is None:
        raise HTTPException(status_code=400, detail="Data not loaded")
        
    try:
        if frame >= len(df):
            raise HTTPException(status_code=404, detail="Frame not found")
            
        physical_data = physical_engine.calculate_physical_metrics(df, frame, team)
        return json.loads(json.dumps(physical_data, cls=NumpyEncoder))
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis/passing/{frame}")
def get_passing_analysis(frame: int, team: str = 'Home'):
    df = DATA.get("tracking")
    if df is None:
        raise HTTPException(status_code=400, detail="Data not loaded")
        
    try:
        if frame >= len(df):
            raise HTTPException(status_code=404, detail="Frame not found")
            
        passing_data = passing_engine.generate_passing_data(df, frame, team)
        return json.loads(json.dumps(passing_data, cls=NumpyEncoder))
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

ANALYZE_CACHE = {}
@app.get("/analyze/{frame}")
@limiter.limit("15/minute")
async def analyze_frame(request: Request, frame: int = Path(..., ge=0)):
    if frame in ANALYZE_CACHE:
        return ANALYZE_CACHE[frame]
    if DATA["tracking"] is None or frame >= DATA["max_frames"]:
        raise HTTPException(status_code=404, detail="Frame not found")
        
    def _compute():
        
        df = DATA["tracking"]
        row = df.iloc[frame]
        # 1. Extract Master State Object
        frame_state = state_engine.extract_state(df, frame)
        team_poss = frame_state.get('possession_team', 'None')
        
        actions = []
        tactical_context = frame_state.get("context", {})
        
        # 2. Extract components for backward compatibility with DecisionEngine (before refactoring)
        row = df.iloc[frame]
        active_home = [p["id"] for p in frame_state.get("home", [])]
        active_away = [p["id"] for p in frame_state.get("away", [])]
        
        velocities = {}
        for p in frame_state.get("home", []) + frame_state.get("away", []):
            velocities[p["id"]] = {"vx": p["vx"], "vy": p["vy"], "speed": p["speed"]}
            
        ball_x = frame_state["ball"]["x"]
        ball_y = frame_state["ball"]["y"]
        match_context = tactical_context.get("match_context", None)
        
        home_shape = get_formation_shape(df, frame, 'home')
        away_shape = get_formation_shape(df, frame, 'away')
        
        if team_poss != 'None' and ball_x is not None:
            raw_actions = predictive_engine.evaluate_actions(frame_state)
            defensive_recommendation = defensive_engine.get_defensive_action(frame_state)
            if defensive_recommendation:
                tactical_context["defensive_recommendation"] = defensive_recommendation
                
            detected_patterns = pattern_engine.detect_patterns(frame_state)
            tactical_context["patterns"] = detected_patterns

            # Map to ActionRankings format
            for act in raw_actions:
                actions.append({
                    "action": f"{act['type']} to #{act['id']}" if act['id'] != "self" else act['type'],
                    "target": [act['target_x'], act['target_y']],
                    "prob": act['p_success'] * 100,
                    "score": act['score'],
                    "xt": act['xt'],
                    "risk": "High" if act['p_success'] < 0.5 else "Medium" if act['p_success'] < 0.75 else "Low",
                    "confidence": f"{act.get('confidence', 75):.1f}%",
                    "reason": act['reason'],
                    "outcome": act['outcome']
                })

            # For Pitch control, returning the grid directly would be heavy, but we can return a downsampled JSON
            X, Y, pc_surf = pc_engine.generate_pitch_control_surface(row, resolution=30)
            pc_data = np.round(pc_surf, 2).tolist()

            return {
                "frame": frame,
                "team_possession": team_poss,
                "home_formation": home_shape,
                "away_formation": away_shape,
                "tactical_context": tactical_context,
                "top_actions": actions[:5],
                "pitch_control_grid": pc_data
            }
            
        return {
            "frame": frame,
            "team_possession": team_poss,
            "home_formation": home_shape,
            "away_formation": away_shape,
            "tactical_context": tactical_context,
            "top_actions": [],
            "pitch_control_grid": []
        }
    try:
        response_data = await asyncio.wait_for(asyncio.to_thread(_compute), timeout=8.0)
        res = json.loads(json.dumps(response_data, cls=NumpyEncoder))
        ANALYZE_CACHE[frame] = res
        return res
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis timed out")
