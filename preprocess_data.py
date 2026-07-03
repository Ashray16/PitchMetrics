import pandas as pd
from kloppy import metrica
import os
from data_loader import smooth_tracking_data, calculate_velocities

def prepare_parquet(match_id):
    print(f"Loading Match {match_id} data from Kloppy...")
    dataset_tracking = metrica.load_open_data(match_id=str(match_id))
    df = dataset_tracking.to_df()
    
    print("Downsampling to 5 fps (every 5th frame)...")
    df = df.iloc[::5].reset_index(drop=True)
    
    print("Smoothing data...")
    df = smooth_tracking_data(df)
    
    print("Calculating velocities (dt = 0.2s for 5fps)...")
    vels = calculate_velocities(df, dt=0.2)
    df = pd.concat([df, vels], axis=1)
    
    parquet_path = f"e:/football_analytics/metrica_tracking_match{match_id}.parquet"
    print(f"Saving to {parquet_path}...")
    df.to_parquet(parquet_path)
    print("Done!")

if __name__ == "__main__":
    prepare_parquet(1)
    prepare_parquet(2)
