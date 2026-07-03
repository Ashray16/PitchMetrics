import numpy as np
import pandas as pd
from scipy.spatial import Voronoi, ConvexHull

class SpaceEngine:
    @staticmethod
    def calculate_space_metrics(frame_data, max_x=120.0, max_y=80.0):
        """
        Calculates Voronoi polygons, Team Width/Depth, and Compactness for a given frame.
        """
        home_pts = []
        home_ids = []
        away_pts = []
        away_ids = []
        
        # Extract players from the row
        for col in frame_data.index:
            if col.endswith('_x') and not pd.isna(frame_data[col]):
                y_col = col.replace('_x', '_y')
                if pd.isna(frame_data[y_col]):
                    continue
                
                x = frame_data[col]
                y = frame_data[y_col]
                
                # Exclude ball
                if 'ball' in col:
                    continue
                    
                jersey = col.split('_')[1]
                
                if 'home_' in col:
                    home_pts.append([x, y])
                    home_ids.append(jersey)
                elif 'away_' in col:
                    away_pts.append([x, y])
                    away_ids.append(jersey)
                    
        # If not enough players, return empty
        if len(home_pts) == 0 and len(away_pts) == 0:
            return {"voronoi": [], "metrics": {}}
            
        all_pts = np.array(home_pts + away_pts)
        all_teams = ["Home"] * len(home_pts) + ["Away"] * len(away_pts)
        all_ids = home_ids + away_ids
        
        # Compute bounded Voronoi by reflecting points across the 4 boundaries
        # Boundaries: x=0, x=max_x, y=0, y=max_y
        pts_r = np.vstack([
            all_pts,
            np.column_stack([-all_pts[:,0], all_pts[:,1]]),           # Left reflection
            np.column_stack([2*max_x - all_pts[:,0], all_pts[:,1]]),  # Right reflection
            np.column_stack([all_pts[:,0], -all_pts[:,1]]),           # Bottom reflection
            np.column_stack([all_pts[:,0], 2*max_y - all_pts[:,1]])   # Top reflection
        ])
        
        try:
            vor = Voronoi(pts_r)
        except Exception as e:
            return {"voronoi": [], "metrics": {}, "error": str(e)}
            
        voronoi_output = []
        for i in range(len(all_pts)):
            region_idx = vor.point_region[i]
            region_vertices_idx = vor.regions[region_idx]
            
            # If for some reason there's an unbounded region (shouldn't happen with reflection)
            if -1 in region_vertices_idx:
                continue
                
            polygon = vor.vertices[region_vertices_idx].tolist()
            voronoi_output.append({
                "team": all_teams[i],
                "player": all_ids[i],
                "polygon": polygon
            })
            
        # Calculate Team Metrics (Width, Depth, Compactness)
        metrics = {"home": {}, "away": {}}
        
        def calculate_team_metrics(pts_list, team_key):
            if len(pts_list) < 3:
                return
            arr = np.array(pts_list)
            
            # Width and Depth
            width = np.max(arr[:, 1]) - np.min(arr[:, 1])
            depth = np.max(arr[:, 0]) - np.min(arr[:, 0])
            
            # Compactness (Convex Hull Area)
            try:
                hull = ConvexHull(arr)
                # In 2D, hull.volume is actually the area of the polygon
                area = hull.volume
            except:
                area = 0
                
            metrics[team_key] = {
                "width": round(width, 1),
                "depth": round(depth, 1),
                "compactness": round(area, 1)
            }
            
        calculate_team_metrics(home_pts, "home")
        calculate_team_metrics(away_pts, "away")
        
        return {
            "voronoi": voronoi_output,
            "metrics": metrics
        }
