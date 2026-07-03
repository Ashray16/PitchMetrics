import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

def calculate_relative_positions(tracking_df, team_prefix='home', window_size=3000):
    """
    Calculate player average positions relative to the team's outfield center of mass over a rolling window.
    tracking_df is expected to be smoothed and contain player coordinates.
    team_prefix is either 'home' or 'away'.
    window_size in frames (3000 frames = 120s at 25fps).
    """
    player_cols_x = [c for c in tracking_df.columns if c.startswith(f"{team_prefix}_") and c.endswith('_x') and 'gk' not in c.lower()]
    player_cols_y = [c for c in tracking_df.columns if c.startswith(f"{team_prefix}_") and c.endswith('_y') and 'gk' not in c.lower()]
    
    mask_df = tracking_df.copy()
    for px, py in zip(player_cols_x, player_cols_y):
        # Mask out players on the bench / touchline
        mask = (mask_df[px] <= 0.0) | (mask_df[px] >= 120.0) | (mask_df[py] <= 3.2) | (mask_df[py] >= 76.8)
        mask_df.loc[mask, px] = np.nan
        mask_df.loc[mask, py] = np.nan
    
    # Calculate Center of Mass (COM) per frame using strictly active outfield players
    com_x = mask_df[player_cols_x].mean(axis=1)
    com_y = mask_df[player_cols_y].mean(axis=1)
    
    relative_df = mask_df.copy()
    
    for px, py in zip(player_cols_x, player_cols_y):
        relative_df[px] = mask_df[px] - com_x
        relative_df[py] = mask_df[py] - com_y
        
    cols_to_roll = player_cols_x + player_cols_y
    
    # Apply rolling mean to get average relative positions (smoothed over the window)
    relative_rolling = relative_df[cols_to_roll].rolling(window=window_size, min_periods=1).mean()
    
    return relative_rolling

def get_active_players_count(tracking_df, frame_idx, team_prefix='home'):
    player_cols_x = [c for c in tracking_df.columns if c.startswith(f"{team_prefix}_") and c.endswith('_x') and 'gk' not in c.lower()]
    row = tracking_df.loc[frame_idx, player_cols_x]
    active = sum(pd.notna(val) and val != 0.0 for val in row)
    return int(active)

def detect_formation(relative_positions, frame_idx, team_prefix='home'):
    """
    Apply K-Means to find formation shape.
    It groups players into horizontal bands (Lines) based on their smoothed relative X-coordinates.
    We test k=3 and k=4 and choose based on the score (or we can just default to k=3 or k=4 depending on inertia).
    Returns a string like '4-3-3', and the cluster centers.
    """
    row = relative_positions.loc[frame_idx]
    
    # Extract active player coordinates
    coords = []
    player_ids = []
    
    x_cols = [c for c in row.index if c.startswith(f"{team_prefix}_") and c.endswith('_x') and 'gk' not in c.lower()]
    
    for x_col in x_cols:
        y_col = x_col.replace('_x', '_y')
        x = row[x_col]
        y = row[y_col]
        
        # Make sure they are not NaN and not strictly parked at relative 0.0 (if raw was 0.0)
        # Assuming relative coordinates of a benched player might be static, but let's just check NaN
        if not np.isnan(x) and not np.isnan(y):
            pid = x_col.replace(f"{team_prefix}_", "").replace("_x", "")
            coords.append([x, y])
            player_ids.append(pid)
                
    coords = np.array(coords)
    
    if len(coords) < 10: 
        return "Unknown Formation", {}, {}
        
    # We want to cluster based purely on the X-coordinate to find "Lines" (Defense, Midfield, Attack)
    X = coords[:, 0].reshape(-1, 1)
    
    # Fit KMeans for k=3 and k=4 lines
    kmeans_3 = KMeans(n_clusters=3, random_state=42, n_init=10).fit(X)
    kmeans_4 = KMeans(n_clusters=4, random_state=42, n_init=10).fit(X)
    
    # Calculate inertia. A simpler heuristic: if k=4 significantly improves inertia, it's 4 lines.
    score_3 = kmeans_3.inertia_
    score_4 = kmeans_4.inertia_
    
    if score_3 == 0: 
        best_kmeans = kmeans_3
    else:
        improvement = (score_3 - score_4) / score_3
        # If adding a 4th line improves the variance by more than 40%, use 4 lines (e.g. 4-2-3-1)
        best_kmeans = kmeans_4 if improvement > 0.40 else kmeans_3
        
    labels = best_kmeans.labels_
    centers = best_kmeans.cluster_centers_
    
    # Sort clusters from lowest X (Defenders) to highest X (Attackers)
    # Assuming team attacks right (so lowest X is defense). If attacking left, it's reversed.
    # We will assume they attack right for relative coordinates if relative X > 0 means forward.
    # Actually, if we just sort the centers, we get the lines.
    sorted_idx = np.argsort(centers.flatten())
    
    # But wait, does the team attack right or left? We can determine this by checking if the Goalkeeper's X is lower or higher than the Center of Mass.
    # But for a robust formation string, we just sort by X. If we always assume left-to-right sorting gives us back-to-front.
    # If the GK is on the right, the lowest X would be the attackers.
    # For now, let's just count them. 
    # To determine direction, we need the raw GK position relative to COM, but since we didn't pass it, we can look at the spread.
    # Let's assume absolute distance sorting, or just return the counts sorted by relative depth.
    
    formation_counts = []
    for idx in sorted_idx:
        count = np.sum(labels == idx)
        formation_counts.append(str(count))
        
    # If attacking left, sorted_idx from lowest to highest X gives Attackers -> Defenders.
    # We should return a dictionary of player_id -> line_index so we can color code them if we want.
    player_to_line = {}
    for i, pid in enumerate(player_ids):
        # map label to sorted position
        line_num = np.where(sorted_idx == labels[i])[0][0]
        player_to_line[pid] = line_num
        
    formation_str = "-".join(formation_counts)
    
    return formation_str, player_to_line, coords
