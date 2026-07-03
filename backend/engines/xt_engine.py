import numpy as np
import pandas as pd
from scipy.interpolate import RectBivariateSpline

class XTEngine:
    def __init__(self, pitch_length=120.0, pitch_width=80.0):
        self.length = pitch_length
        self.width = pitch_width
        
        # Karun Singh's generic 12x8 xT matrix (mirrored half-pitch values adapted)
        self.xt_matrix = np.array([
            [0.006, 0.006, 0.007, 0.008, 0.01,  0.011, 0.012, 0.013, 0.015, 0.02,  0.03,  0.04],
            [0.006, 0.006, 0.007, 0.008, 0.01,  0.011, 0.013, 0.015, 0.017, 0.025, 0.04,  0.06],
            [0.006, 0.006, 0.007, 0.009, 0.011, 0.013, 0.015, 0.018, 0.02,  0.035, 0.1,   0.2],
            [0.006, 0.007, 0.008, 0.01,  0.012, 0.014, 0.017, 0.02,  0.025, 0.05,  0.15,  0.35],
            [0.006, 0.007, 0.008, 0.01,  0.012, 0.014, 0.017, 0.02,  0.025, 0.05,  0.15,  0.35],
            [0.006, 0.006, 0.007, 0.009, 0.011, 0.013, 0.015, 0.018, 0.02,  0.035, 0.1,   0.2],
            [0.006, 0.006, 0.007, 0.008, 0.01,  0.011, 0.013, 0.015, 0.017, 0.025, 0.04,  0.06],
            [0.006, 0.006, 0.007, 0.008, 0.01,  0.011, 0.012, 0.013, 0.015, 0.02,  0.03,  0.04]
        ])
        
        # We define the centers of the 12x8 grid
        x_centers = np.linspace(self.length / 24, self.length - self.length / 24, 12)
        y_centers = np.linspace(self.width / 16, self.width - self.width / 16, 8)
        self.interp_spline = RectBivariateSpline(y_centers, x_centers, self.xt_matrix, kx=1, ky=1)

    def get_xt(self, x, y, attacking_right=True):
        # Mirror xT if the team is playing right to left
        eval_x = x if attacking_right else (self.length - x)
        return float(self.interp_spline(y, eval_x, grid=False))

    def calculate_xt_metrics(self, frame_data, team_poss):
        """
        Calculates expected threat metrics for the current frame
        """
        # If no possession, return basic grid
        if team_poss == 'None':
            return {
                "xt_grid": self.xt_matrix.tolist(),
                "current_xt": 0.0,
                "best_action": "None",
                "potential_xt": 0.0,
                "passing_lanes": [],
                "teammates": [],
                "opponents": []
            }

        ball_x = frame_data.get('ball_x')
        ball_y = frame_data.get('ball_y')
        
        if pd.isna(ball_x) or pd.isna(ball_y):
            return {
                "xt_grid": self.xt_matrix.tolist(),
                "current_xt": 0.0,
                "best_action": "None",
                "potential_xt": 0.0,
                "passing_lanes": [],
                "teammates": [],
                "opponents": []
            }
            
        prefix = 'home_' if team_poss == 'Home' else 'away_'
        opp_prefix = 'away_' if team_poss == 'Home' else 'home_'
        
        teammates = []
        opponents = []
        
        for col in frame_data.index:
            if col.endswith('_x') and not pd.isna(frame_data[col]):
                y_col = col.replace('_x', '_y')
                if pd.isna(frame_data[y_col]): continue
                
                if col.startswith(prefix):
                    jersey = col.replace(prefix, '').replace('_x', '')
                    teammates.append({"id": jersey, "x": frame_data[col], "y": frame_data[y_col]})
                elif col.startswith(opp_prefix):
                    jersey = col.replace(opp_prefix, '').replace('_x', '')
                    opponents.append({"id": jersey, "x": frame_data[col], "y": frame_data[y_col]})

        # Determine attacking direction
        # By comparing the average X of both teams, we robustly identify which team is defending which half.
        # The team with the lower average X is defending the left side, thus attacking right.
        avg_tm_x = np.mean([tm['x'] for tm in teammates]) if teammates else 60.0
        avg_opp_x = np.mean([opp['x'] for opp in opponents]) if opponents else 60.0
        
        attacking_right = avg_tm_x < avg_opp_x
        
        current_xt = max(0.0, self.get_xt(ball_x, ball_y, attacking_right))
                    
        passing_lanes = []
        
        for tm in teammates:
            # Skip the player closest to the ball (assume ball carrier)
            dist_to_ball = np.sqrt((tm['x'] - ball_x)**2 + (tm['y'] - ball_y)**2)
            if dist_to_ball < 2.0:
                continue
                
            target_xt = max(0.0, self.get_xt(tm['x'], tm['y'], attacking_right))
            xt_added = target_xt - current_xt
            
            # Simple lane obstruction check
            blocked = False
            for opp in opponents:
                L2 = dist_to_ball**2
                if L2 > 0:
                    t = max(0, min(1, ((opp['x'] - ball_x) * (tm['x'] - ball_x) + (opp['y'] - ball_y) * (tm['y'] - ball_y)) / L2))
                    proj_x = ball_x + t * (tm['x'] - ball_x)
                    proj_y = ball_y + t * (tm['y'] - ball_y)
                    dist_to_lane = np.sqrt((opp['x'] - proj_x)**2 + (opp['y'] - proj_y)**2)
                    
                    if dist_to_lane < 1.5:
                        blocked = True
                        break
                        
            if not blocked:
                passing_lanes.append({
                    "target_player": tm['id'],
                    "start": [float(ball_x), float(ball_y)],
                    "end": [float(tm['x']), float(tm['y'])],
                    "xt_added": round(xt_added, 3),
                    "is_progressive": xt_added > 0.015
                })
                
        # Sort lanes by highest xT added
        passing_lanes.sort(key=lambda x: x["xt_added"], reverse=True)
        passing_lanes = passing_lanes[:3] # Keep top 3 to avoid clutter
        
        best_action = "Carry Ball"
        potential_xt = current_xt + 0.015 # default carry assumption
        
        if passing_lanes:
            best_pass = passing_lanes[0]
            if best_pass["xt_added"] >= 0.005:
                best_action = f"Pass to {best_pass['target_player']}"
                potential_xt = current_xt + best_pass["xt_added"]
            elif best_pass["xt_added"] > -0.01:
                best_action = f"Retention Pass to {best_pass['target_player']}"
                potential_xt = current_xt + best_pass["xt_added"]
                
        # Prepare 120x80 interpolation grid for the frontend heatmap overlay
        # To reduce payload size, we'll send a 30x20 grid and the frontend can smooth it via CSS/SVG
        X_grid = np.linspace(0, self.length, 30)
        Y_grid = np.linspace(0, self.width, 20)
        
        # We need a 2D array [y_index][x_index]
        xt_heatmap = np.zeros((20, 30))
        for i, y in enumerate(Y_grid):
            for j, x in enumerate(X_grid):
                xt_heatmap[i, j] = max(0.0, self.get_xt(x, y, attacking_right))
                
        return {
            "xt_grid": np.round(xt_heatmap, 4).tolist(),
            "current_xt": round(current_xt, 3),
            "best_action": best_action,
            "potential_xt": round(potential_xt, 3),
            "passing_lanes": passing_lanes,
            "teammates": teammates,
            "opponents": opponents
        }

xt_engine = XTEngine(pitch_length=120.0, pitch_width=80.0)
