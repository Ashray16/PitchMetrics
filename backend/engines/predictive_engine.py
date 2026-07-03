import numpy as np
from typing import Dict, Any, List
from .xt_engine import xt_engine

class PredictiveEngine:
    def __init__(self, length=105.0, width=68.0):
        self.length = length
        self.width = width
        self.max_speed = 8.0 # m/s cap for predictions

    def _project_position(self, p: dict, t: float) -> tuple:
        """Project a player's position t seconds into the future using current velocity."""
        vx, vy = p.get('vx', 0), p.get('vy', 0)
        # Cap speed
        speed = np.sqrt(vx**2 + vy**2)
        if speed > self.max_speed:
            scale = self.max_speed / speed
            vx *= scale
            vy *= scale
            
        fut_x = p.get('x', 0) + vx * t
        fut_y = p.get('y', 0) + vy * t
        
        # Keep inside pitch boundaries
        fut_x = max(0.0, min(self.length, fut_x))
        fut_y = max(0.0, min(self.width, fut_y))
        
        return fut_x, fut_y

    def _calculate_future_pressure(self, target_x: float, target_y: float, defenders: List[dict], t: float) -> float:
        """Calculate defensive pressure at a projected location and time."""
        min_dist = 999.0
        for d in defenders:
            dx, dy = self._project_position(d, t)
            dist = np.sqrt((dx - target_x)**2 + (dy - target_y)**2)
            if dist < min_dist:
                min_dist = dist
        return min_dist

    def evaluate_actions(self, state: dict) -> List[dict]:
        actions = []
        team_poss = state.get('possession_team', 'None')
        if team_poss == 'None':
            return actions

        ball = state['ball']
        bx, by = ball['x'], ball['y']
        
        attacking_team = state['home'] if team_poss == 'Home' else state['away']
        defending_team = state['away'] if team_poss == 'Home' else state['home']
        
        attacking_right = state.get("context", {}).get("attacking_right", True)
        phase = state.get("phase", "Progression")

        # STAGE A: Candidate Generation
        candidates = []
        
        # 1. Passes
        for p in attacking_team:
            dist = np.sqrt((p['x'] - bx)**2 + (p['y'] - by)**2)
            if dist < 2.0: continue # self
            
            # Ground Pass
            candidates.append({"type": "Pass", "target_id": p['id'], "target_player": p, "speed": 15.0, "risk_base": 0.1})
            
            # Lofted Pass (if distance > 25m)
            if dist > 25.0:
                candidates.append({"type": "Lofted Pass", "target_id": p['id'], "target_player": p, "speed": 18.0, "risk_base": 0.3})
                
            # Through Ball (project pass into space ahead of player)
            progression = (p['x'] - bx) if attacking_right else (bx - p['x'])
            if progression > 5.0 and p['speed'] > 2.0:
                # Target space 1.5s ahead of runner
                tb_x, tb_y = self._project_position(p, 1.5)
                candidates.append({"type": "Through Ball", "target_id": p['id'], "target_player": p, "target_pos": (tb_x, tb_y), "speed": 12.0, "risk_base": 0.4})

        # 2. Carries (Drive into space)
        carry_dist = 5.0
        cx = bx + carry_dist if attacking_right else bx - carry_dist
        cy = by
        candidates.append({"type": "Carry", "target_id": "self", "target_pos": (cx, cy), "speed": 6.0, "risk_base": 0.05})

        # STAGE B: Outcome Scoring
        current_xt = xt_engine.get_xt(bx, by, attacking_right)
        
        for cand in candidates:
            if cand['type'] == 'Carry':
                tx, ty = cand['target_pos']
                flight_time = carry_dist / cand['speed']
            elif 'target_pos' in cand:
                tx, ty = cand['target_pos']
                dist = np.sqrt((tx - bx)**2 + (ty - by)**2)
                flight_time = dist / cand['speed']
            else:
                p = cand['target_player']
                dist = np.sqrt((p['x'] - bx)**2 + (p['y'] - by)**2)
                flight_time = dist / cand['speed']
                # Re-project target to receiver's future position
                tx, ty = self._project_position(p, flight_time)
            
            # 1. Predict Future State
            future_pressure_dist = self._calculate_future_pressure(tx, ty, defending_team, flight_time)
            
            # 2. Completion Probability
            p_success = 1.0 - cand['risk_base']
            if future_pressure_dist < 2.0:
                p_success -= 0.4
            elif future_pressure_dist < 5.0:
                p_success -= 0.2
                
            # Interception risk (very naive: is there a defender directly in the passing lane right now?)
            if cand['type'] != 'Carry':
                for d in defending_team:
                    # Point-to-line distance using cross product
                    num = abs((ty - by)*(d['x'] - bx) - (tx - bx)*(d['y'] - by))
                    den = np.sqrt((tx - bx)**2 + (ty - by)**2)
                    if den > 0:
                        lane_dist = num / den
                        d_dist_to_ball = np.sqrt((d['x'] - bx)**2 + (d['y'] - by)**2)
                        if lane_dist < 1.5 and d_dist_to_ball < den:
                            p_success -= 0.3
                            
            p_success = max(0.01, min(0.99, p_success))
            
            # 3. xT Gain
            future_xt = xt_engine.get_xt(tx, ty, attacking_right)
            xt_diff = future_xt - current_xt
            xt_gain = max(0, xt_diff)
            
            # 4. Tactical Value Scoring
            # Base score gives points for retention and finding space
            score = (p_success * 30) + (min(10.0, future_pressure_dist) * 1.5)
            
            # Heavily reward positive xT, heavily penalize negative xT (backpasses)
            if xt_diff > 0:
                score += (xt_diff * 10 * 50)
            else:
                score += (xt_diff * 10 * 100) # Negative xT pulls the score down fast
                if xt_diff < -0.01:
                    score -= 20 # Flat penalty for significant backpasses
            
            # Contextual Weights
            match_context = state.get("context", {}).get("match_context", {})
            if match_context:
                if match_context.get("game_state") == "Trailing" and match_context.get("minute", 0) > 75:
                    score += (xt_gain * 10 * 20) # Boost xT
                elif match_context.get("game_state") == "Leading" and match_context.get("minute", 0) > 75:
                    score -= ((1.0 - p_success) * 30) # Penalize risk
                
                # Fast breaks shouldn't have backpasses
                if phase in ["Counter Attack", "Fast Break"] and xt_diff <= 0:
                    score -= 30

            # Formatting Reason
            reason = f"[{match_context.get('minute', 0)}' - {match_context.get('game_state', '')}] {phase}: "
            reason += f"Projected {xt_diff:+.2f} xT. "
            reason += f"Future Space: {future_pressure_dist:.1f}m. "
            
            # Confidence (inverse of variance)
            confidence = max(0, min(100, 100 - (flight_time * 10) - ((1.0 - p_success) * 30)))

            actions.append({
                "id": cand['target_id'],
                "type": cand['type'],
                "target_x": float(tx),
                "target_y": float(ty),
                "score": float(max(0, min(100, score))),
                "xt": float(xt_gain),
                "p_success": float(p_success),
                "confidence": float(confidence),
                "reason": reason,
                "outcome": f"Future Control: {p_success*100:.0f}%"
            })
            
        # Sort and return top actions
        actions.sort(key=lambda x: x['score'], reverse=True)
        return actions

predictive_engine = PredictiveEngine()
