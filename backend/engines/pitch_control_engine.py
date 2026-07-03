import numpy as np
import pandas as pd

class PitchControlModel:
    def __init__(self, pitch_length=105, pitch_width=68, max_speed=5.0, reaction_time=0.7):
        self.pitch_length = pitch_length
        self.pitch_width = pitch_width
        self.max_speed = max_speed
        self.reaction_time = reaction_time

    def generate_pitch_control_surface(self, tracking_row, resolution=50):
        """
        Generates a 2D grid representing pitch control based on player positions and momentum.
        Returns X grid, Y grid, and the control surface (probability of home team controlling the point).
        """
        x_grid = np.linspace(0, self.pitch_length, resolution)
        y_grid = np.linspace(0, self.pitch_width, resolution)
        X, Y = np.meshgrid(x_grid, y_grid)
        
        home_players = []
        away_players = []
        
        for col in tracking_row.index:
            if col.endswith('_x') and ('home_' in col or 'away_' in col):
                player = col.replace('_x', '')
                vx_col = col.replace('_x', '_vx')
                vy_col = col.replace('_x', '_vy')
                
                # Fetch positions
                px = tracking_row[col]
                py = tracking_row[f"{player}_y"]
                
                if pd.isna(px) or pd.isna(py):
                    continue
                    
                # The data is already scaled to [0, 120] and [0, 80] in main.py!
                # Wait, if main.py scales the whole df during startup, then px and py ARE ALREADY 120 and 80!
                # Let me make sure PitchControlModel is initialized with 120 and 80 instead of 105 and 68.
                # Actually, in main.py it IS initialized with 120 and 80.
                
                # Fetch velocities (default 0 if not calculated)
                pvx = tracking_row.get(vx_col, 0)
                pvy = tracking_row.get(vy_col, 0)
                if pd.isna(pvx): pvx = 0
                if pd.isna(pvy): pvy = 0
                
                if 'home_' in col:
                    home_players.append((px, py, pvx, pvy))
                elif 'away_' in col:
                    away_players.append((px, py, pvx, pvy))
                    
        # Vectorized grid calculation
        def min_tti(players, tx, ty):
            min_t = np.full_like(tx, 999.0, dtype=float)
            for (px, py, pvx, pvy) in players:
                dx = tx - px
                dy = ty - py
                dist = np.sqrt(dx**2 + dy**2)
                
                speed = np.sqrt(pvx**2 + pvy**2)
                if speed > 0.5:
                    nx, ny = pvx / speed, pvy / speed
                    # Handle dist=0 safely
                    safe_dist = np.where(dist==0, 0.001, dist)
                    ndx, ndy = dx/safe_dist, dy/safe_dist
                    alignment = nx * ndx + ny * ndy
                    turn_penalty = (1 - alignment) * 1.5
                else:
                    turn_penalty = 0
                    
                tti = self.reaction_time + turn_penalty + (dist / self.max_speed)
                min_t = np.minimum(min_t, tti)
            return min_t
            
        tti_home = min_tti(home_players, X, Y)
        tti_away = min_tti(away_players, X, Y)
        
        # Logistic probability of home team controlling the space
        diff = tti_home - tti_away
        sigma = np.pi / np.sqrt(3) 
        
        control_surface = 1 / (1 + np.exp(sigma * diff))
        
        return X, Y, control_surface
