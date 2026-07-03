import numpy as np
import pandas as pd
from scipy.spatial import ConvexHull
from sklearn.cluster import AgglomerativeClustering

def get_formation_shape(tracking_df, frame_idx, team_prefix='home', window_size=3000):
    """
    Implements the professional formation detection pipeline:
    1. Remove GK and benched players
    2. Normalize direction of play
    3. Rolling Average (already applied or applied here)
    4. Convex Hull (Team shape area/width/depth)
    5. Line detection (Hierarchical clustering instead of KMeans)
    6. Classifier (e.g. 4-3-3, 3-2-5)
    """
    
    # 1. Isolate outfield players and mask out benched
    player_cols_x = [c for c in tracking_df.columns if c.startswith(f"{team_prefix}_") and c.endswith('_x') and 'gk' not in c.lower()]
    player_cols_y = [c for c in tracking_df.columns if c.startswith(f"{team_prefix}_") and c.endswith('_y') and 'gk' not in c.lower()]
    
    # Get the 2-minute slice up to this frame
    start_frame = max(0, frame_idx - window_size)
    slice_df = tracking_df.loc[start_frame:frame_idx].copy()
    
    # Pre-scale coordinates if needed (assuming they are already [0,120] and [0,80])
    for px, py in zip(player_cols_x, player_cols_y):
        mask = (slice_df[px] <= 0.0) | (slice_df[px] >= 120.0) | (slice_df[py] <= 3.2) | (slice_df[py] >= 76.8)
        slice_df.loc[mask, px] = np.nan
        slice_df.loc[mask, py] = np.nan
        
    # 2. Normalize direction. Find where they are attacking.
    com_x_raw = slice_df[player_cols_x].mean().mean()
    
    # Simple assumption for 1st half Metrica data: Home attacks right, Away attacks left.
    # To be robust, check the deepest player.
    mean_x_pos = slice_df[player_cols_x].mean()
    # Team with lower X mean is generally defending left, attacking right
    attacking_right = mean_x_pos.mean() < 60.0
    
    # Identify the GK (deepest player on average) and exclude them
    if not attacking_right:
        # If attacking left, deepest player has the highest X
        gk_col = mean_x_pos.idxmax()
    else:
        gk_col = mean_x_pos.idxmin()
        
    if gk_col in player_cols_x:
        player_cols_x.remove(gk_col)
        player_cols_y.remove(gk_col.replace('_x', '_y'))
    
    # 3. Calculate relative smoothed positions for the active players
    com_x_series = slice_df[player_cols_x].mean(axis=1)
    com_y_series = slice_df[player_cols_y].mean(axis=1)
    
    smoothed_coords = []
    
    for px, py in zip(player_cols_x, player_cols_y):
        rel_x = slice_df[px] - com_x_series
        rel_y = slice_df[py] - com_y_series
        
        avg_x = rel_x.mean()
        avg_y = rel_y.mean()
        
        if not np.isnan(avg_x) and not np.isnan(avg_y):
            # Normalize direction so Attack is always +X
            if not attacking_right:
                avg_x = -avg_x
                avg_y = -avg_y
            smoothed_coords.append([avg_x, avg_y])
            
    if len(smoothed_coords) < 9:
        return {"shape": "Unknown", "confidence": 0, "area": 0, "attacking_right": True}
        
    coords_arr = np.array(smoothed_coords)
    
    # 4. Convex Hull (Team footprint area)
    hull = ConvexHull(coords_arr)
    area = hull.volume # 2D volume is area
    
    # 5. Line Detection via Agglomerative Clustering (distance threshold)
    # Professional models cluster strictly by depth (X-axis)
    X_depth = coords_arr[:, 0].reshape(-1, 1)
    
    # Try 3 lines and 4 lines
    cluster_3 = AgglomerativeClustering(n_clusters=3, linkage='ward').fit(X_depth)
    cluster_4 = AgglomerativeClustering(n_clusters=4, linkage='ward').fit(X_depth)
    
    # Evaluate which split makes more sense (using silhouette score or simple variance)
    # We will use 4 lines if the standard deviation within clusters drops significantly
    def calc_variance(labels, X):
        var = 0
        for i in set(labels):
            var += np.var(X[labels == i])
        return var
        
    var_3 = calc_variance(cluster_3.labels_, X_depth)
    var_4 = calc_variance(cluster_4.labels_, X_depth)
    
    if var_4 < var_3 * 0.6: # 40% improvement in variance
        best_labels = cluster_4.labels_
    else:
        best_labels = cluster_3.labels_
        
    # Sort clusters from lowest X (defense) to highest X (attack)
    cluster_centers = []
    for i in set(best_labels):
        cluster_centers.append((i, np.mean(X_depth[best_labels == i])))
        
    cluster_centers.sort(key=lambda x: x[1])
    
    # 6. Classifier
    formation_counts = []
    for cluster_id, center in cluster_centers:
        count = np.sum(best_labels == cluster_id)
        formation_counts.append(str(count))
        
    if formation_counts and formation_counts[0] == '1':
        formation_counts = formation_counts[1:]
        
    formation_str = "-".join(formation_counts)
    
    # Calculate confidence based on standard deviation of lines
    avg_std = np.mean([np.std(X_depth[best_labels == i]) for i in set(best_labels)])
    confidence = max(0, min(100, int(100 - (avg_std * 2.5))))
    
    return {
        "shape": formation_str,
        "confidence": confidence,
        "area": float(round(area, 1)),
        "attacking_right": bool(attacking_right)
    }
