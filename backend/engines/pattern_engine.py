class PatternEngine:
    def __init__(self):
        # The library of pattern rules
        self.patterns = [
            {
                "name": "Overlap",
                "phase": ["Progression", "Final Third"],
                "signals": ["wide_lane_open", "fullback_acceleration", "winger_inside"],
                "confidence_threshold": 0.7
            },
            {
                "name": "Underlap",
                "phase": ["Progression", "Final Third"],
                "signals": ["winger_wide", "interior_runner_inside"],
                "confidence_threshold": 0.7
            },
            {
                "name": "Switch play",
                "phase": ["Build-up", "Progression"],
                "signals": ["high_ball_side_density", "weak_side_open"],
                "confidence_threshold": 0.8
            },
            {
                "name": "Box midfield",
                "phase": ["Build-up", "Progression"],
                "signals": ["central_compact_support", "two_pivots", "two_interiors"],
                "confidence_threshold": 0.75
            },
            {
                "name": "Inverted fullback",
                "phase": ["Build-up"],
                "signals": ["fullback_central", "central_overload"],
                "confidence_threshold": 0.7
            },
            {
                "name": "False 9 movement",
                "phase": ["Progression", "Final Third"],
                "signals": ["striker_deep", "central_lane_baited"],
                "confidence_threshold": 0.8
            }
        ]

    def _check_overlap(self, state: dict) -> float:
        # Simplified heuristic: is there a wide player accelerating past the ball carrier?
        attacking_right = state.get("context", {}).get("attacking_right", True)
        ball = state['ball']
        bx, by = ball['x'], ball['y']
        team_poss = state.get('possession_team', 'None')
        if team_poss == 'None': return 0.0
        
        team = state['home'] if team_poss == 'Home' else state['away']
        
        is_wide = by < 18 or by > (68 - 18)
        if not is_wide: return 0.0
        
        # Look for a player behind the ball with high speed moving forward
        for p in team:
            prog = (p['x'] - bx) if attacking_right else (bx - p['x'])
            if -10 < prog < 5 and p['speed'] > 4.0:
                # Is it an overlapping run?
                if (by < 34 and p['y'] < by) or (by > 34 and p['y'] > by):
                    return 0.85
        return 0.0

    def _check_switch_play(self, state: dict) -> float:
        ball = state['ball']
        bx, by = ball['x'], ball['y']
        
        # Is the ball on one side?
        if 18 <= by <= 50: return 0.0 # Ball is central
        
        defending_team = state['away'] if state.get('possession_team') == 'Home' else state['home']
        # Count defenders on ball side vs weak side
        ball_side_defs = sum(1 for d in defending_team if abs(d['y'] - by) < 30)
        weak_side_defs = len(defending_team) - ball_side_defs
        
        if ball_side_defs >= 7 and weak_side_defs <= 2:
            return 0.9
        return 0.0

    def _check_inverted_fullback(self, state: dict) -> float:
        # Check if wide players are congregating centrally during build-up
        if state.get("phase") != "Build-up": return 0.0
        team = state['home'] if state.get('possession_team') == 'Home' else state['away']
        
        central_players = sum(1 for p in team if 18 <= p['y'] <= 50)
        if central_players >= 6:
            return 0.8
        return 0.0

    def detect_patterns(self, state: dict) -> list:
        detected = []
        phase = state.get("phase", "Progression")
        
        for rule in self.patterns:
            if phase not in rule["phase"]: continue
            
            conf = 0.0
            if rule["name"] == "Overlap": conf = self._check_overlap(state)
            elif rule["name"] == "Switch play": conf = self._check_switch_play(state)
            elif rule["name"] == "Inverted fullback": conf = self._check_inverted_fullback(state)
            
            if conf >= rule["confidence_threshold"]:
                detected.append({
                    "pattern": rule["name"],
                    "confidence": conf,
                    "signals": rule["signals"]
                })
                
        return detected

pattern_engine = PatternEngine()
