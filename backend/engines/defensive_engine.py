import numpy as np

class DefensiveEngine:
    def __init__(self, length=120.0, width=80.0):
        self.length = length
        self.width = width

    def get_defensive_action(self, state: dict) -> dict:
        """
        Evaluate the frame_state and return the primary defensive recommendation.
        Returns: {action, reason, target_area, urgency, effect}
        """
        team_poss = state.get('possession_team', 'None')
        if team_poss == 'None':
            return None
            
        ball = state['ball']
        bx, by = ball['x'], ball['y']
        
        attacking_team = state['home'] if team_poss == 'Home' else state['away']
        defending_team = state['away'] if team_poss == 'Home' else state['home']
        
        attacking_right = state.get("context", {}).get("attacking_right", True)
        
        # Identify ball carrier (closest attacker to ball)
        carrier = None
        min_c_dist = 999.0
        for a in attacking_team:
            d = np.sqrt((a['x'] - bx)**2 + (a['y'] - by)**2)
            if d < min_c_dist:
                min_c_dist = d
                carrier = a
                
        if not carrier:
            return None

        # Find closest defender
        closest_def = None
        min_d_dist = 999.0
        for d in defending_team:
            d_dist = np.sqrt((d['x'] - bx)**2 + (d['y'] - by)**2)
            if d_dist < min_d_dist:
                min_d_dist = d_dist
                closest_def = d
                
        is_wide = by < 18 or by > (self.width - 18)
        is_central = 18 <= by <= (self.width - 18)
        
        # Rule 1: Double Team (Attacker wide, isolated)
        if is_wide and min_d_dist < 5.0:
            # Check if there is another defender nearby to help
            helpers = sum(1 for d in defending_team if np.sqrt((d['x'] - bx)**2 + (d['y'] - by)**2) < 8.0)
            if helpers >= 2:
                return {
                    "action": "Double team",
                    "reason": "Attacker is wide near touchline and defensive support is close.",
                    "target_area": "Wide Channel",
                    "urgency": "High",
                    "effect": "Trap ball carrier against the touchline and force a turnover."
                }
                
        # Rule 2: Force Outside (Central corridor blocked)
        if is_central and min_d_dist < 8.0:
            central_defenders = sum(1 for d in defending_team if 18 <= d['y'] <= (self.width - 18) and (d['x'] > bx - 10 if attacking_right else d['x'] < bx + 10))
            if central_defenders >= 3:
                return {
                    "action": "Force outside",
                    "reason": "Central lane is heavily congested. Protect the middle.",
                    "target_area": "Half-spaces",
                    "urgency": "Medium",
                    "effect": "Reduce central penetration and funnel play wide."
                }
                
        # Rule 3: Drop (Opponent has clear forward lane / depth exposed)
        # Check if carrier has space and forward momentum
        progression = carrier['vx'] if attacking_right else -carrier['vx']
        if min_d_dist > 8.0 and progression > 2.0:
            return {
                "action": "Drop",
                "reason": "Opponent has a clear forward lane and forward momentum.",
                "target_area": "Defensive Third",
                "urgency": "High",
                "effect": "Protect the space behind the defensive line and absorb pressure."
            }

        # Rule 4: Press (Carrier under pressure, team compact)
        compactness = state.get("context", {}).get("compactness_index", 0)
        if min_d_dist < 3.0 and compactness > 70:
            return {
                "action": "Press",
                "reason": "Ball carrier is under immediate pressure and team is compact enough to jump.",
                "target_area": "Ball Zone",
                "urgency": "High",
                "effect": "Force a quick mistake or backwards pass."
            }
            
        # Rule 5: Contain (Attacker wide, no immediate danger)
        if is_wide:
            return {
                "action": "Contain",
                "reason": "Attacker is isolated wide without immediate penetration threat.",
                "target_area": "Wide Channel",
                "urgency": "Low",
                "effect": "Force sideways passes and prevent crosses."
            }
            
        # Rule 6: Delay (Fallback)
        return {
            "action": "Delay",
            "reason": "Opponent has space but not immediate danger.",
            "target_area": "Midfield",
            "urgency": "Medium",
            "effect": "Buy time for the defensive block to recover its shape."
        }

defensive_engine = DefensiveEngine()
