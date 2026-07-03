import json
import pandas as pd
import numpy as np
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def load_skillcorner_data(match_id: int = 1886347):
    """
    Loads SkillCorner open data tracking and match metadata and converts it 
    into a Metrica-style wide pandas DataFrame.
    """
    data_dir_env = os.getenv("DATA_DIR", str(Path(__file__).parent.parent / "skillcorner_data" / "data"))
    BASE_DIR = Path(data_dir_env).resolve()
    
    match_file = (BASE_DIR / "matches" / str(match_id) / f"{match_id}_match.json").resolve()
    tracking_file = (BASE_DIR / "matches" / str(match_id) / f"{match_id}_tracking_extrapolated.jsonl").resolve()
    
    if not str(match_file).startswith(str(BASE_DIR)) or not str(tracking_file).startswith(str(BASE_DIR)):
        raise ValueError("Invalid path (Path Traversal attempt)")
    
    if not match_file.exists():
        print(f"File not found: {match_file}")
        return None

    # Load match metadata
    with open(match_file, 'r') as f:
        match_meta = json.load(f)
        
    home_team_id = match_meta['home_team']['id']
    away_team_id = match_meta['away_team']['id']
    
    # Build player mapping
    player_to_team = {}
    player_to_jersey = {}
    for p in match_meta.get('players', []):
        pid = p.get('id') # The tracking data uses 'player_id' which maps to 'id'
            
        team_id = p.get('team_id')
        jersey = p.get('number', str(pid))
        
        player_to_team[pid] = team_id
        player_to_jersey[pid] = jersey

    # We will build a list of dicts, one per frame
    records = []
    
    print(f"Loading tracking data from {tracking_file}...")
    
    with open(tracking_file, 'r') as f:
        for line in f:
            if not line.strip():
                continue
                
            try:
                frame_data = json.loads(line)
            except:
                continue
                
            frame_idx = frame_data.get('frame')
            timestamp = frame_data.get('timestamp')
            
            row = {
                'frame': frame_idx,
                'timestamp': timestamp
            }
            
            # Parse ball
            ball = frame_data.get('ball_data', {})
            if ball and ball.get('x') is not None and ball.get('y') is not None:
                row['ball_x'] = (ball['x'] + 52.5) / 105.0
                row['ball_y'] = (ball['y'] + 34.0) / 68.0
                
            # Parse players
            for obj in frame_data.get('player_data', []):
                x = obj.get('x')
                y = obj.get('y')
                if x is None or y is None:
                    continue
                    
                x_norm = (x + 52.5) / 105.0
                y_norm = (y + 34.0) / 68.0
                
                pid = obj.get('trackable_object')
                if not pid:
                    pid = obj.get('player_id')
                    
                team_id = player_to_team.get(pid)
                jersey = player_to_jersey.get(pid, str(pid))
                
                if team_id == home_team_id:
                    row[f'home_{jersey}_x'] = x_norm
                    row[f'home_{jersey}_y'] = y_norm
                elif team_id == away_team_id:
                    row[f'away_{jersey}_x'] = x_norm
                    row[f'away_{jersey}_y'] = y_norm
                    
            records.append(row)
            
            if len(records) % 10000 == 0:
                print(f"Loaded {len(records)} frames...")

    print("Converting to DataFrame...")
    df = pd.DataFrame(records)
    
    # Sort by frame just in case
    df = df.sort_values('frame').reset_index(drop=True)
    return df
