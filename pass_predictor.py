import pandas as pd
import numpy as np
import xgboost as xgb

class PassPredictor:
    def __init__(self, pitch_length=105, pitch_width=68):
        self.pitch_length = pitch_length
        self.pitch_width = pitch_width
        # Default hyperparams for a fast model
        self.model = xgb.XGBClassifier(use_label_encoder=False, eval_metric='logloss', n_estimators=50, max_depth=3)
        self.is_trained = False
        
    def get_xt_value(self, x, y):
        """
        Basic heuristic xT (Expected Threat) value.
        Higher value closer to the opponent's goal (105, 34).
        """
        dist_to_goal = np.sqrt((x - self.pitch_length)**2 + (y - self.pitch_width/2)**2)
        # Scaled to be between ~0.01 and 1.0
        xt = np.exp(-dist_to_goal / 25.0)
        return xt
        
    def generate_xt_grid(self, resolution=50):
        """
        Creates a basic xT (Expected Threat) grid for visualization.
        """
        x_grid = np.linspace(0, self.pitch_length, resolution)
        y_grid = np.linspace(0, self.pitch_width, resolution)
        X, Y = np.meshgrid(x_grid, y_grid)
        
        dist_to_goal = np.sqrt((X - self.pitch_length)**2 + (Y - self.pitch_width/2)**2)
        xt_grid = np.exp(-dist_to_goal / 25.0)
        
        return X, Y, xt_grid

    def _get_defender_density(self, start_x, start_y, end_x, end_y, tracking_row, team_prefix='away'):
        """
        Calculates how many defenders are near the passing lane.
        """
        density = 0
        # Passing vector
        px = end_x - start_x
        py = end_y - start_y
        pass_len = np.sqrt(px**2 + py**2)
        if pass_len == 0:
            return 0
            
        px, py = px / pass_len, py / pass_len # Normalize
        
        for col in tracking_row.index:
            if team_prefix in col.lower() and '_x' in col.lower():
                player = col.replace('_x', '')
                def_x = tracking_row[col]
                def_y = tracking_row[f"{player}_y"]
                
                if pd.isna(def_x) or pd.isna(def_y):
                    continue
                
                # Distance from defender to pass start
                dx = def_x - start_x
                dy = def_y - start_y
                
                # Project defender onto passing vector
                projection = dx * px + dy * py
                
                if 0 <= projection <= pass_len:
                    # Defender is alongside the passing lane
                    # Calculate perpendicular distance
                    perp_dist = np.abs(dx * py - dy * px)
                    if perp_dist < 3.0: # within 3 meters of passing lane
                        density += 1
                        
        return density

    def extract_pass_features(self, start_x, start_y, end_x, end_y, tracking_row):
        """
        Extract features for the Pass Success Probability model.
        """
        pass_dist = np.sqrt((end_x - start_x)**2 + (end_y - start_y)**2)
        density = self._get_defender_density(start_x, start_y, end_x, end_y, tracking_row, 'away') # assuming home is passing
        
        return np.array([pass_dist, density])

    def calculate_pass_success(self, start_x, start_y, end_x, end_y, tracking_row):
        """
        Returns just the P(Success) of a pass.
        """
        features = self.extract_pass_features(start_x, start_y, end_x, end_y, tracking_row).reshape(1, -1)
        if not self.is_trained:
            # Fallback heuristic if model isn't trained
            pass_dist = features[0][0]
            density = features[0][1]
            prob = max(0.01, min(1.0, 1.0 - (pass_dist / 100.0) - (density * 0.2)))
        else:
            prob = self.model.predict_proba(features)[0][1] # Probability of class 1 (Success)
            
        return prob
        
    def predict_pass_value(self, start_x, start_y, end_x, end_y, tracking_row):
        """
        Value = P(Success) * xT(Target Zone)
        """
        prob = self.calculate_pass_success(start_x, start_y, end_x, end_y, tracking_row)
        xt = self.get_xt_value(end_x, end_y)
        return prob * xt
