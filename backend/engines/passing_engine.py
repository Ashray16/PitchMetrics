import pandas as pd
import numpy as np

class PassingEngine:
    def __init__(self, pitch_length=120.0, pitch_width=80.0):
        self.length = pitch_length
        self.width = pitch_width

    def generate_passing_data(self, df, frame, team='Home'):
        """
        Generates nodes and edges for passing visualizations using tracking data.
        Since we lack event data, this uses a spatial proximity and forward-bias heuristic.
        """
        row = df.iloc[frame]
        
        prefix = team.lower() + "_"
        active_players = [c.replace('_x', '').replace(prefix, '') for c in df.columns if c.startswith(prefix) and c.endswith('_x') and not pd.isna(row[c])]
        
        nodes = []
        for p in active_players:
            x = row.get(f"{prefix}{p}_x")
            y = row.get(f"{prefix}{p}_y")
            
            # Determine cluster based on pitch thirds
            if x < self.length * 0.33:
                cluster = "Defense"
            elif x < self.length * 0.66:
                cluster = "Midfield"
            else:
                cluster = "Attack"
                
            nodes.append({
                "id": p,
                "x": float(x),
                "y": float(y),
                "cluster": cluster
            })
            
        edges = []
        for i, source in enumerate(nodes):
            for j, target in enumerate(nodes):
                if i >= j: continue
                
                dist = np.sqrt((source["x"] - target["x"])**2 + (source["y"] - target["y"])**2)
                
                if dist < 45.0: # Only link players within a reasonable passing distance
                    # Base weight: closer = more passes
                    weight = max(1, 20 - (dist * 0.4))
                    
                    # Progression: how far forward does the pass go?
                    forward_dist = target["x"] - source["x"]
                    progression = max(0, forward_dist)
                    
                    # xT proxy: target x position squared
                    xt = (target["x"] / self.length) ** 2 * 0.1
                    
                    edges.append({
                        "source": source["id"],
                        "target": target["id"],
                        "weight": float(round(weight, 1)),
                        "progression": float(round(progression, 1)),
                        "xt_added": float(round(xt, 3))
                    })
                    
        return {
            "nodes": nodes,
            "edges": edges
        }

passing_engine = PassingEngine()
