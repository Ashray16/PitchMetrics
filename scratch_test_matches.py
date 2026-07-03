import os
import json

def get_available_matches():
    matches_dir = r"E:\football_analytics\backend\skillcorner_data\data\matches"
    available = []
    
    for folder in os.listdir(matches_dir):
        folder_path = os.path.join(matches_dir, folder)
        if os.path.isdir(folder_path):
            match_json = os.path.join(folder_path, f"{folder}_match.json")
            if os.path.exists(match_json):
                with open(match_json, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    available.append({
                        "id": folder,
                        "home_team": meta.get("home_team", {}).get("name", "Unknown Home"),
                        "away_team": meta.get("away_team", {}).get("name", "Unknown Away"),
                        "date": meta.get("date_time", "")
                    })
    return available

print(json.dumps(get_available_matches(), indent=2))
