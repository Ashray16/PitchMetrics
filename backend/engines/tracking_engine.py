import pandas as pd
import numpy as np

def detect_possessions(tracking_df, fps=25):
    """
    Groups raw tracking frames into defined Possession Sequences.
    Adds a 'possession_id' and 'possession_team' column to the dataframe.
    """
    df = tracking_df.copy()
    
    # 1. Identify active players (exclude GK for possession usually, but GK can have possession, so include all)
    home_cols_x = [c for c in df.columns if c.startswith('home_') and c.endswith('_x')]
    away_cols_x = [c for c in df.columns if c.startswith('away_') and c.endswith('_x')]
    
    # Pre-scale coordinates if they are normalized [0,1]
    # Assuming Metrica data where 0,0 is top left and 1,1 is bottom right
    # Pitch is 120x80
    ball_x = df.get('ball_x', pd.Series(np.nan, index=df.index)) * 120.0
    ball_y = df.get('ball_y', pd.Series(np.nan, index=df.index)) * 80.0
    
    df['ball_x_m'] = ball_x
    df['ball_y_m'] = ball_y
    
    # Vectorized distance calculation to all players
    home_dists = {}
    for cx in home_cols_x:
        cy = cx.replace('_x', '_y')
        dist = np.sqrt((df[cx]*120.0 - ball_x)**2 + (df[cy]*80.0 - ball_y)**2)
        home_dists[cx.replace('_x', '')] = dist
        
    away_dists = {}
    for cx in away_cols_x:
        cy = cx.replace('_x', '_y')
        dist = np.sqrt((df[cx]*120.0 - ball_x)**2 + (df[cy]*80.0 - ball_y)**2)
        away_dists[cx.replace('_x', '')] = dist
        
    home_dist_df = pd.DataFrame(home_dists)
    away_dist_df = pd.DataFrame(away_dists)
    
    min_home_dist = home_dist_df.min(axis=1)
    min_away_dist = away_dist_df.min(axis=1)
    
    # Interpolate ball positions for up to 10 frames (1 sec) to fix missing ball detections
    ball_x_filled = ball_x.interpolate(limit=10, limit_direction='both')
    ball_y_filled = ball_y.interpolate(limit=10, limit_direction='both')

    # Ball velocity
    ball_vx = ball_x_filled.diff() * fps
    ball_vy = ball_y_filled.diff() * fps
    ball_speed = np.sqrt(ball_vx**2 + ball_vy**2).fillna(0)
    
    # Define possession threshold: player within 2.5m, ball not flying > 15m/s
    POSS_DIST = 2.5
    MAX_BALL_SPEED = 15.0
    
    home_has_ball = (min_home_dist < POSS_DIST) & (ball_speed < MAX_BALL_SPEED)
    away_has_ball = (min_away_dist < POSS_DIST) & (ball_speed < MAX_BALL_SPEED)
    
    # Resolve ties by checking who is closer
    home_closer = min_home_dist < min_away_dist
    
    final_home_poss = home_has_ball & (~away_has_ball | home_closer)
    final_away_poss = away_has_ball & (~home_has_ball | ~home_closer)
    
    # State machine mapping: 1 for Home, -1 for Away, 0 for Neither
    raw_state = np.zeros(len(df))
    raw_state[final_home_poss] = 1
    raw_state[final_away_poss] = -1
    
    # Mark out of bounds explicitly to prevent forward-filling through a dead ball
    ball_out_of_bounds = (ball_x_filled < 0.0) | (ball_x_filled > 120.0) | (ball_y_filled < 0.0) | (ball_y_filled > 80.0)
    raw_state[ball_out_of_bounds] = -99
    
    # Forward fill state up to 2 seconds (50 frames) to cover loose passes
    state_s = pd.Series(raw_state).replace(0, np.nan)
    state_filled = state_s.ffill(limit=50).replace(-99, 0).fillna(0).astype(int)
    
    # Use median filter to remove sub-second blips (e.g. 1-frame tackles or deflections)
    import scipy.signal
    k = max(3, int(fps) | 1) # Make it odd, roughly 1 second
    state_filtered = scipy.signal.medfilt(state_filled, kernel_size=k)
    
    # Identify sequence boundaries
    state_changes = state_filtered != np.roll(state_filtered, 1)
    # Create possession IDs (increment every time possession changes to a TEAM, not 0)
    # Wait, we want separate possession sequences. If it goes 1 -> 0 -> 1, is it the same attack?
    # Usually yes, unless 0 lasts > 2 seconds. Our ffill handles up to 2 seconds.
    # So 1 -> -1 is a turnover.
    possession_id = pd.Series(state_changes).cumsum()
    
    df['possession_team'] = pd.Series(state_filtered).map({1: 'Home', -1: 'Away', 0: 'None'})
    df['possession_id'] = possession_id
    
    # Filter out 'None' possessions so possession_id represents actual attacks
    active_mask = df['possession_team'] != 'None'
    df.loc[~active_mask, 'possession_id'] = -1
    
    return df

def get_possessions_list(df, fps=25):
    """
    Returns a list of possession metadata for the frontend.
    """
    poss_df = df[df['possession_id'] != -1]
    
    groups = poss_df.groupby('possession_id')
    
    possessions = []
    for pid, group in groups:
        team = group['possession_team'].iloc[0]
        start_f = int(group.index.min())
        end_f = int(group.index.max())
        duration = (end_f - start_f) / float(fps)
        
        # Only keep attacks longer than 2 seconds
        if duration > 2.0:
            possessions.append({
                "id": 0, # Will be re-indexed below
                "team": team,
                "start_frame": start_f,
                "end_frame": end_f,
                "duration_sec": round(duration, 1)
            })
            
    # Re-index to avoid gaps and inflated numbers
    for i, p in enumerate(possessions):
        p["id"] = i + 1
            
    return possessions
