import os
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter
from kloppy import metrica

def load_match_data(data_dir, match_id=1):
    """
    Load Metrica sample data for a given match ID.
    Uses kloppy for tracking (fetching open data) and pandas for local events.
    """
    match_dir = os.path.join(data_dir, f"Sample_Game_{match_id}")
    events_file = os.path.join(match_dir, f"Sample_Game_{match_id}_RawEventsData.csv")
    
    if not os.path.exists(events_file):
        raise FileNotFoundError(f"Event file not found at {events_file}")
    
    print(f"Loading tracking data for Match {match_id} via kloppy open data...")
    dataset_tracking = metrica.load_open_data(match_id=str(match_id))
    
    print(f"Loading event data for Match {match_id} via pandas...")
    # Metrica event data is CSV
    dataset_events = pd.read_csv(events_file)
    
    return dataset_tracking, dataset_events

def smooth_tracking_data(tracking_df, window_length=11, polyorder=2):
    """
    Apply Savitzky-Golay filter to smooth tracking coordinates.
    Expects a pandas DataFrame where columns are player coordinates.
    """
    smoothed_df = tracking_df.copy()
    
    # We only apply smoothing to numeric columns that represent coordinates
    coord_cols = [c for c in smoothed_df.columns if '_x' in c or '_y' in c]
    
    for col in coord_cols:
        # Interpolate missing values (e.g., when a player is off camera)
        series = smoothed_df[col].interpolate(method='linear', limit_direction='both')
        # Apply filter
        smoothed_df[col] = savgol_filter(series, window_length, polyorder)
        
    return smoothed_df

def calculate_velocities(tracking_df, dt=0.04):
    """
    Calculate velocities from smoothed tracking coordinates.
    Metrica is 25fps -> dt = 0.04s.
    """
    velocities_df = pd.DataFrame(index=tracking_df.index)
    
    # Find all player IDs based on columns (format: {team}_{jersey}_x)
    player_cols = [c for c in tracking_df.columns if '_x' in c and 'ball' not in c.lower()]
    
    for x_col in player_cols:
        y_col = x_col.replace('_x', '_y')
        vx_col = x_col.replace('_x', '_vx')
        vy_col = y_col.replace('_y', '_vy')
        speed_col = x_col.replace('_x', '_speed')
        
        # Calculate diffs
        dx = tracking_df[x_col].diff()
        dy = tracking_df[y_col].diff()
        
        # Calculate velocity (m/s)
        # Note: Metrica data is usually normalized [0, 1]. We might need to scale to pitch dimensions (105x68).
        # Assuming normalized coordinates here; we'll convert to meters before diffing in real implementation.
        # But let's just calculate raw differences for now.
        velocities_df[vx_col] = dx / dt
        velocities_df[vy_col] = dy / dt
        velocities_df[speed_col] = np.sqrt(velocities_df[vx_col]**2 + velocities_df[vy_col]**2)
        
    return velocities_df

if __name__ == "__main__":
    # Test loading
    base_dir = r"e:\football_analytics\data\metrica_sample_data\data"
    try:
        tracking, events = load_match_data(base_dir, 1)
        print("Data loaded successfully.")
        
        # Convert to pandas for easier manipulation in Pandas
        tracking_df = tracking.to_df()
        print(f"Tracking shape: {tracking_df.shape}")
        
        smoothed_df = smooth_tracking_data(tracking_df)
        print("Data smoothed successfully.")
    except Exception as e:
        print(f"Error: {e}")
