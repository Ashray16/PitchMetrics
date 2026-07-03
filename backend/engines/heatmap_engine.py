import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter

class HeatmapEngine:
    def __init__(self, pitch_length=120.0, pitch_width=80.0):
        self.length = pitch_length
        self.width = pitch_width
        self.grid_x = 30
        self.grid_y = 20

    def generate_heatmap(self, df, frame, heatmap_type, player_id=None, team='Home'):
        """
        Generates a 2D smoothed histogram (heatmap) from frame 0 to current frame.
        """
        # Sample every 5th frame to keep computation fast
        hist_df = df.iloc[:frame:5]
        
        x_points = []
        y_points = []
        
        if heatmap_type == 'team':
            prefix = 'home_' if team == 'Home' else 'away_'
            for col in hist_df.columns:
                if col.startswith(prefix) and col.endswith('_x'):
                    y_col = col.replace('_x', '_y')
                    if y_col in hist_df.columns:
                        x_points.extend(hist_df[col].dropna().values)
                        y_points.extend(hist_df[y_col].dropna().values)
                        
        elif heatmap_type == 'player' and player_id:
            x_col = f"{player_id}_x"
            y_col = f"{player_id}_y"
            if x_col in hist_df.columns and y_col in hist_df.columns:
                x_points = hist_df[x_col].dropna().values
                y_points = hist_df[y_col].dropna().values
                
        elif heatmap_type == 'ball' or heatmap_type == 'ball_touches':
            if 'ball_x' in hist_df.columns and 'ball_y' in hist_df.columns:
                team_hist_df = hist_df[hist_df['possession_team'] == team]
                x_points = team_hist_df['ball_x'].dropna().values
                y_points = team_hist_df['ball_y'].dropna().values
                
        elif heatmap_type == 'pressure':
            # Approximate pressure: Where the defending team is when the attacking team has the ball
            opp_prefix = 'away_' if team == 'Home' else 'home_'
            # Filter frames where the opposing team has possession
            poss_frames = hist_df[hist_df['possession_team'] == (team)]
            
            for col in poss_frames.columns:
                if col.startswith(opp_prefix) and col.endswith('_x'):
                    y_col = col.replace('_x', '_y')
                    if y_col in poss_frames.columns:
                        x_points.extend(poss_frames[col].dropna().values)
                        y_points.extend(poss_frames[y_col].dropna().values)
                        
        elif heatmap_type in ['pass_origin', 'pass_dest']:
            # Proxy: High velocity ball movements
            # We just use ball positions to mock this for the visualizer as we don't have parsed events yet
            if 'ball_x' in hist_df.columns:
                b_df = hist_df[['ball_x', 'ball_y', 'possession_team']].dropna(subset=['ball_x', 'ball_y'])
                if len(b_df) > 1:
                    # Calculate speed
                    dx = b_df['ball_x'].diff()
                    dy = b_df['ball_y'].diff()
                    speed = np.sqrt(dx**2 + dy**2)
                    
                    if heatmap_type == 'pass_origin':
                        # High speed acceleration frames (start of pass)
                        idx = speed[speed > 1.5].index - 1
                    else:
                        # High speed deceleration frames (end of pass)
                        idx = speed[speed > 1.5].index + 1
                        
                    idx = [i for i in idx if i in b_df.index]
                    
                    # Filter for only passes made by the selected team
                    team_idx = [i for i in idx if b_df.loc[i, 'possession_team'] == team]
                    
                    x_points = b_df.loc[team_idx, 'ball_x'].values
                    y_points = b_df.loc[team_idx, 'ball_y'].values
        else:
            x_points = []
            y_points = []
            
        if len(x_points) == 0:
            return np.zeros((self.grid_y, self.grid_x)).tolist()
            
        # 2D Histogram
        H, xedges, yedges = np.histogram2d(
            x_points, y_points, 
            bins=[self.grid_x, self.grid_y],
            range=[[0, self.length], [0, self.width]]
        )
        
        # H is (grid_x, grid_y). We transpose to get (grid_y, grid_x)
        H = H.T
        
        # Smooth with Gaussian filter
        H_smoothed = gaussian_filter(H, sigma=1.5)
        
        # Normalize between 0 and 1
        max_val = H_smoothed.max()
        if max_val > 0:
            H_smoothed = H_smoothed / max_val
            
        return np.round(H_smoothed, 3).tolist()

heatmap_engine = HeatmapEngine()
