import numpy as np
import pandas as pd

class PhysicalEngine:
    def __init__(self, fps=10.0):
        self.fps = fps
        self.dt = 1.0 / fps
        
        # Speed thresholds (km/h)
        self.sprint_threshold = 25.2
        self.hsr_threshold = 19.8
        
        # Acceleration threshold (m/s^2)
        self.accel_threshold = 3.0

    def calculate_physical_metrics(self, df, frame, team='Home'):
        """
        Calculates physical metrics for all players on the given team up to the specified frame.
        """
        # Take all frames up to the current one
        # If frame is 0, we can't calculate much, just return empty
        if frame < 2:
            return {"players": []}
            
        hist_df = df.iloc[:frame]
        
        prefix = 'home_' if team == 'Home' else 'away_'
        
        # Find all player jerseys for this team
        player_cols = [c for c in hist_df.columns if c.startswith(prefix) and c.endswith('_x')]
        
        results = []
        
        for col in player_cols:
            jersey = col.replace(prefix, '').replace('_x', '')
            y_col = col.replace('_x', '_y')
            
            if y_col not in hist_df.columns:
                continue
                
            x = hist_df[col].values
            y = hist_df[y_col].values
            
            # Mask out NaNs to only calculate when player is on pitch
            valid_mask = ~np.isnan(x) & ~np.isnan(y)
            
            if not np.any(valid_mask):
                continue
                
            # Filter to valid frames (note: this squashes time gaps, which isn't perfect for speed, 
            # but usually NaNs are when a player is off-pitch entirely).
            # A more robust method is to use diff on the original array and mask NaNs.
            dx = np.diff(x)
            dy = np.diff(y)
            
            # Distance per frame (meters)
            dist_per_frame = np.sqrt(dx**2 + dy**2)
            
            # Handle NaNs in distance (if a frame was NaN, diff is NaN)
            dist_per_frame = np.nan_to_num(dist_per_frame, 0)
            
            # Total Distance (meters)
            total_distance = np.sum(dist_per_frame)
            
            # Speed (m/s)
            speed_ms = dist_per_frame / self.dt
            
            # Speed (km/h)
            speed_kmh = speed_ms * 3.6
            
            # Top Speed
            top_speed = np.max(speed_kmh) if len(speed_kmh) > 0 else 0
            
            # High Speed Running and Sprinting Distance
            sprint_mask = speed_kmh >= self.sprint_threshold
            hsr_mask = (speed_kmh >= self.hsr_threshold) & (speed_kmh < self.sprint_threshold)
            
            sprint_distance = np.sum(dist_per_frame[sprint_mask])
            hsr_distance = np.sum(dist_per_frame[hsr_mask])
            
            # Sprint Count (find contiguous blocks of sprinting)
            # A simple way to count events is to look at transitions from False to True
            if len(sprint_mask) > 0:
                sprint_starts = np.diff(sprint_mask.astype(int)) == 1
                sprint_count = np.sum(sprint_starts)
                # If they started sprinting on frame 0
                if sprint_mask[0]: sprint_count += 1
            else:
                sprint_count = 0
                
            # Acceleration
            accel = np.diff(speed_ms) / self.dt
            accel = np.nan_to_num(accel, 0)
            
            accel_count = np.sum(accel > self.accel_threshold)
            decel_count = np.sum(accel < -self.accel_threshold)
            
            # Approximate Player Load (simplified formula: sum of absolute accelerations)
            player_load = np.sum(np.abs(accel)) * 0.01 
            
            results.append({
                "player_id": jersey,
                "total_distance": round(total_distance, 1),
                "top_speed": round(top_speed, 1),
                "sprint_distance": round(sprint_distance, 1),
                "hsr_distance": round(hsr_distance, 1),
                "sprint_count": int(sprint_count),
                "accelerations": int(accel_count),
                "decelerations": int(decel_count),
                "player_load": round(player_load, 1)
            })
            
        # Sort by total distance descending
        results.sort(key=lambda x: x["total_distance"], reverse=True)
        
        return {"players": results, "team": team}

physical_engine = PhysicalEngine()
