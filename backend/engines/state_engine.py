import numpy as np
import pandas as pd
from typing import Dict, Any, List
from .decision_engine import DecisionEngine, PhaseOfPlay, BallZone

class StateEngine:
    def __init__(self, length=120.0, width=80.0):
        self.length = length
        self.width = width
        self.decision_engine = DecisionEngine(length, width) # To reuse some heuristic methods temporarily

    def extract_state(self, df: pd.DataFrame, frame: int) -> Dict[str, Any]:
        """
        Extracts a unified, predictive state object for a given frame.
        Includes positions, velocities, accelerations, and tactical context.
        """
        row = df.iloc[frame]
        team_poss = row.get('possession_team', 'None')
        
        state = {
            "frame": frame,
            "possession_team": team_poss,
            "phase": "unknown",
            "ball": {"x": row.get("ball_x"), "y": row.get("ball_y"), "vx": 0.0, "vy": 0.0},
            "home": [],
            "away": [],
            "context": {}
        }
        
        # Calculate kinematics (velocity over 5 frames, acceleration over 10)
        dt_v = 0.5
        kinematics = {}
        past_row_v = df.iloc[frame - 5] if frame >= 5 else row
        past_row_a = df.iloc[frame - 10] if frame >= 10 else past_row_v
        
        # Ball kinematics
        if not pd.isna(row.get('ball_x')) and not pd.isna(past_row_v.get('ball_x')):
            state["ball"]["vx"] = float((row['ball_x'] - past_row_v['ball_x']) / dt_v)
            state["ball"]["vy"] = float((row['ball_y'] - past_row_v['ball_y']) / dt_v)
            state["ball"]["x"] = float(state["ball"]["x"]) if state["ball"]["x"] is not None else None
            state["ball"]["y"] = float(state["ball"]["y"]) if state["ball"]["y"] is not None else None

        active_home = []
        active_away = []
        
        for col in df.columns:
            if col.endswith('_x') and not pd.isna(row[col]):
                team_prefix = "home_" if "home_" in col else "away_"
                p_id = col.replace('_x', '').replace(team_prefix, '')
                y_col = f"{team_prefix}{p_id}_y"
                
                if not pd.isna(row.get(y_col)):
                    x, y = row[col], row[y_col]
                    
                    if team_prefix == "home_":
                        active_home.append(p_id)
                    else:
                        active_away.append(p_id)
                        
                    vx, vy, speed = 0.0, 0.0, 0.0
                    ax, ay, accel = 0.0, 0.0, 0.0
                    
                    if frame >= 5 and not pd.isna(past_row_v.get(col)):
                        vx = (x - past_row_v[col]) / dt_v
                        vy = (y - past_row_v[y_col]) / dt_v
                        speed = np.sqrt(vx**2 + vy**2)
                        
                        if frame >= 10 and not pd.isna(past_row_a.get(col)):
                            past_vx = (past_row_v[col] - past_row_a[col]) / dt_v
                            past_vy = (past_row_v[y_col] - past_row_a[y_col]) / dt_v
                            ax = (vx - past_vx) / dt_v
                            ay = (vy - past_vy) / dt_v
                            accel = np.sqrt(ax**2 + ay**2)
                    
                    player_data = {
                        "id": str(p_id),
                        "x": float(x), "y": float(y),
                        "vx": float(vx), "vy": float(vy), "speed": float(speed),
                        "ax": float(ax), "ay": float(ay), "accel": float(accel)
                    }
                    
                    if team_prefix == "home_":
                        state["home"].append(player_data)
                    else:
                        state["away"].append(player_data)
                        
                    kinematics[f"{team_prefix}{p_id}"] = player_data

        if team_poss == 'None' or pd.isna(state["ball"]["x"]):
            return state

        # Determine phase and context
        ball_x = state["ball"]["x"]
        ball_y = state["ball"]["y"]
        
        # We determine attacking direction heuristically
        attacking_right = bool(self.decision_engine._determine_attacking_direction(
            row, "home_" if team_poss == 'Home' else "away_", 
            active_home if team_poss == 'Home' else active_away,
            "away_" if team_poss == 'Home' else "home_",
            active_away if team_poss == 'Home' else active_home
        ))
        
        bx_normalized = ball_x if attacking_right else (self.length - ball_x)
        if bx_normalized < self.length / 3:
            phase = PhaseOfPlay.BUILD_UP.value
        elif bx_normalized < (self.length * 2) / 3:
            phase = PhaseOfPlay.PROGRESSION.value
        else:
            phase = PhaseOfPlay.FINAL_THIRD.value
            
        state["phase"] = phase

        # Get Tactical Context using the existing method (we will fully migrate it soon, but reuse for now to prevent breaking changes)
        match_minute = int((frame / 600.0) % 90) + 1
        match_context = {
            "minute": match_minute,
            "scoreline": "0 - 1",
            "game_state": "Trailing" if team_poss == 'Home' else "Leading"
        }
        
        tactical_context = self.decision_engine.get_tactical_context(
            "unknown", "unknown", phase, ball_y, row,
            "home_" if team_poss == 'Home' else "away_", 
            active_home if team_poss == 'Home' else active_away,
            "away_" if team_poss == 'Home' else "home_",
            active_away if team_poss == 'Home' else active_home,
            ball_x, match_context
        )
        
        state["context"] = tactical_context
        state["context"]["attacking_right"] = attacking_right
        state["context"]["match_context"] = match_context

        return state
