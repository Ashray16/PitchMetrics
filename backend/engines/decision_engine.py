import numpy as np
import pandas as pd
import json
import os
from enum import Enum
from scipy.spatial import ConvexHull
from .xt_engine import XTEngine

class PhaseOfPlay(Enum):
    BUILD_UP = "Build-up"
    PROGRESSION = "Progression"
    FINAL_THIRD = "Final Third"

class PressingIntensity(Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    NONE = "-"

class DefensiveBlock(Enum):
    HIGH = "High Block"
    MID = "Mid Block"
    LOW = "Low Block"
    NONE = "-"

class BallZone(Enum):
    LEFT_WING = "Left Wing"
    LEFT_HALF_SPACE = "Left Half-Space"
    CENTER = "Center"
    RIGHT_HALF_SPACE = "Right Half-Space"
    RIGHT_WING = "Right Wing"
    ZONE_14 = "Zone 14"
    PENALTY_BOX = "Penalty Box"
    NONE = "-"

class TacticalConstants:
    PRESS_RADIUS = 10.0
    LOCAL_AREA = 20.0
    LOW_BLOCK_MAX = 35.0
    MID_BLOCK_MAX = 60.0
    ZONE14_Y_MIN = 30.0
    ZONE14_Y_MAX = 50.0
    ZONE14_X_MIN = 80.0
    ZONE14_X_MAX = 100.0
    PENALTY_BOX_X_MIN = 103.5
    PENALTY_BOX_Y_MIN = 21.0
    PENALTY_BOX_Y_MAX = 59.0


class DecisionEngine:
    def __init__(self, pitch_length=120.0, pitch_width=80.0):
        self.length = pitch_length
        self.width = pitch_width
        self.xt_engine = XTEngine(pitch_length, pitch_width)
        
        # Load weights config
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'iq_weights.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                self.config = json.load(f)
        else:
            # Fallback
            self.config = {
                "phases": {"Build-up": {"success_probability": 0.40, "xt_gain": 0.15, "space_created": 0.15, "progression_value": 0.10, "tactical_fit": 0.10, "risk": 0.10}},
                "modifiers": {"under_pressure": -0.15, "blind_side": -0.10, "running_onto_ball": 0.10, "off_balance": -0.12, "good_body_orientation": 0.15},
                "physics": {"defender_sprint_speed": 7.5, "defender_reaction_time": 0.3, "ball_speed_ground": 15.0, "ball_speed_driven": 22.0, "ball_speed_lofted": 12.0, "ball_speed_chipped": 9.0, "ball_speed_cross": 18.0}
            }

    def _determine_attacking_direction(self, tracking_row, team_prefix, active_players, opp_prefix, opp_players):
        team_xs = [tracking_row.get(f"{team_prefix}{t}_x") for t in active_players if not pd.isna(tracking_row.get(f"{team_prefix}{t}_x"))]
        opp_xs = [tracking_row.get(f"{opp_prefix}{t}_x") for t in opp_players if not pd.isna(tracking_row.get(f"{opp_prefix}{t}_x"))]
        
        avg_tm_x = np.mean(team_xs) if team_xs else 60.0
        avg_opp_x = np.mean(opp_xs) if opp_xs else 60.0
        
        return avg_tm_x < avg_opp_x

    def _physics_model(self, start_x, start_y, end_x, end_y, ball_speed, is_aerial=False):
        dist = np.sqrt((end_x - start_x)**2 + (end_y - start_y)**2)
        flight_time = dist / ball_speed
        if is_aerial:
            flight_time += (dist * 0.02) # Extra hang time based on distance
        return dist, flight_time

    def _defender_model(self, target_x, target_y, ball_flight_time, opp_prefix, opp_players, tracking_row, velocities=None):
        # Calculate interception cones and arrival times
        defenders = []
        physics = self.config['physics']
        sprint_speed = physics['defender_sprint_speed']
        reaction_time = physics['defender_reaction_time']
        
        for opp in opp_players:
            ox = tracking_row.get(f"{opp_prefix}{opp}_x")
            oy = tracking_row.get(f"{opp_prefix}{opp}_y")
            if not pd.isna(ox) and not pd.isna(oy):
                dist = np.sqrt((ox - target_x)**2 + (oy - target_y)**2)
                
                # Check closing speed using velocity vector towards target
                vx = 0; vy = 0; speed = 0
                if velocities and f"{opp_prefix}{opp}" in velocities:
                    v_data = velocities[f"{opp_prefix}{opp}"]
                    vx, vy, speed = v_data['vx'], v_data['vy'], v_data['speed']
                
                # Dot product of velocity vector and target vector
                closing_speed = 0
                if speed > 0 and dist > 0:
                    dot_product = (vx * (target_x - ox)) + (vy * (target_y - oy))
                    closing_speed = dot_product / dist
                
                # Dynamic reaction time (faster if moving towards, slower if retreating)
                eff_reaction = reaction_time
                if closing_speed < -1.0: # retreating from target
                    eff_reaction += 0.2
                elif closing_speed > 2.0: # sprinting towards target
                    eff_reaction -= 0.1
                
                # Effective sprint speed
                eff_sprint = sprint_speed
                if closing_speed > 0:
                    eff_sprint = min(sprint_speed, sprint_speed * 0.5 + closing_speed * 0.5)
                
                arrival_time = eff_reaction + (dist / eff_sprint)
                
                # Pressure Score based on distance, closing speed, and reaction time
                pressure_score = (10.0 / max(1.0, dist)) + (closing_speed * 0.5) - eff_reaction
                
                defenders.append({
                    "id": opp,
                    "x": ox, "y": oy,
                    "dist": dist,
                    "vx": vx, "vy": vy,
                    "closing_speed": closing_speed,
                    "arrival_time": arrival_time,
                    "pressure_score": max(0, pressure_score),
                    "can_intercept": arrival_time < ball_flight_time
                })
        return defenders

    def _receiver_model(self, target_x, target_y, rx, ry, ball_flight_time, is_aerial):
        # Receiver arrival time and xControl
        dist = np.sqrt((rx - target_x)**2 + (ry - target_y)**2)
        sprint_speed = 8.0 # attackers are typically sprinting into space
        arrival_time = dist / sprint_speed
        
        # xControl
        x_control = 0.95
        if is_aerial:
            x_control -= 0.15
        
        return arrival_time, x_control

    def _evaluate_action(self, action_type, passer_x, passer_y, target_x, target_y, rx, ry, attacking_right, opp_prefix, opp_players, tracking_row, velocities=None, opp_lines=None):
        physics = self.config['physics']
        
        if action_type == 'Ground Pass':
            speed = physics['ball_speed_ground']
            is_aerial = False
        elif action_type == 'Driven Pass':
            speed = physics['ball_speed_driven']
            is_aerial = False
        elif action_type in ['Lofted Pass', 'Cross', 'Switch of Play']:
            speed = physics['ball_speed_lofted']
            if action_type == 'Cross': speed = physics['ball_speed_cross']
            is_aerial = True
        elif action_type == 'Through Ball':
            speed = physics['ball_speed_ground']
            is_aerial = False
        else:
            speed = physics['ball_speed_ground']
            is_aerial = False

        dist, flight_time = self.physics_model(passer_x, passer_y, target_x, target_y, speed, is_aerial)
        defenders = self._defender_model(target_x, target_y, flight_time, opp_prefix, opp_players, tracking_row, velocities)
        rec_arr_time, x_control = self._receiver_model(target_x, target_y, rx, ry, flight_time, is_aerial)
        
        # Calculate passing corridor density (simple version for now: count defenders near the vector)
        corridor_density = 0
        min_def_arrival = 99.0
        nearest_def_dist = 99.0
        
        for d in defenders:
            if d['arrival_time'] < min_def_arrival:
                min_def_arrival = d['arrival_time']
            if d['dist'] < nearest_def_dist:
                nearest_def_dist = d['dist']
                
            # Vector projection to find dist to passing lane
            L2 = dist**2
            if L2 > 0:
                t = max(0, min(1, ((d['x'] - passer_x) * (target_x - passer_x) + (d['y'] - passer_y) * (target_y - passer_y)) / L2))
                proj_x = passer_x + t * (target_x - passer_x)
                proj_y = passer_y + t * (target_y - passer_y)
                dist_to_lane = np.sqrt((d['x'] - proj_x)**2 + (d['y'] - proj_y)**2)
                
                if dist_to_lane < 4.0: # Potential corridor
                    # Dynamic corridor width based on defensive shadow (momentum)
                    lane_closing_speed = 0
                    if d['vx'] != 0 or d['vy'] != 0:
                        lane_vec_x = target_x - passer_x
                        lane_vec_y = target_y - passer_y
                        l_len = np.sqrt(lane_vec_x**2 + lane_vec_y**2)
                        if l_len > 0:
                            perp_x = -lane_vec_y / l_len
                            perp_y = lane_vec_x / l_len
                            # Direction towards the defender
                            if (perp_x * (d['x'] - proj_x) + perp_y * (d['y'] - proj_y)) < 0:
                                perp_x, perp_y = -perp_x, -perp_y
                            lane_closing_speed = (d['vx'] * -perp_x) + (d['vy'] * -perp_y)
                            
                    corridor_width = 2.1 # Minimum safe corridor
                    if lane_closing_speed > 1.0:
                        corridor_width += lane_closing_speed * 0.4 # Shadow extends based on momentum
                        
                    if dist_to_lane < corridor_width:
                        corridor_density += 1
                        if not is_aerial:
                            ball_time_to_intercept = t * flight_time
                            def_time_to_intercept = self.config['physics']['defender_reaction_time'] + (dist_to_lane / self.config['physics']['defender_sprint_speed'])
                            
                            if def_time_to_intercept < ball_time_to_intercept + 0.1: # 0.1s tolerance
                                x_control *= 0.1 # Intercepted
                            elif dist_to_lane < 0.4:
                                x_control *= 0.2 # Dangerous 0.4m margin
                        
        if is_aerial:
            # Aerial duels
            if nearest_def_dist < 2.0 and min_def_arrival <= flight_time:
                x_control *= 0.4 # contested header

        # Receiver pressure modifier
        if nearest_def_dist < 2.0:
            x_control += self.config['modifiers']['under_pressure']
            
        p_success = max(0.01, min(0.99, x_control))
        
        # xT and Progression
        curr_xt = self.xt_engine.get_xt(passer_x, passer_y, attacking_right)
        target_xt = self.xt_engine.get_xt(target_x, target_y, attacking_right)
        xt_gain = max(0, target_xt - curr_xt)
        
        progression = (target_x - passer_x) if attacking_right else (passer_x - target_x)
        progression_value = max(0, progression) / self.length
        
        space_created = min(1.0, nearest_def_dist / 10.0) # Normalize 10m as max space score, cap at 1.0
        
        risk = 1.0 - p_success
        
        # Lines Broken & Between the Lines
        lines_broken = 0
        between_lines = False
        if opp_lines:
            fwd_x, mid_x, def_x = opp_lines
            for line_x in opp_lines:
                if attacking_right:
                    if passer_x < line_x and target_x > line_x: lines_broken += 1
                else:
                    if passer_x > line_x and target_x < line_x: lines_broken += 1
                    
            if len(opp_lines) >= 3:
                if attacking_right:
                    if mid_x < target_x < def_x: between_lines = True
                else:
                    if mid_x > target_x > def_x: between_lines = True

        # Passing Lane Density
        passing_lane_density = (corridor_density / max(1, len(defenders))) * 100

        # Receiver Freedom (Open Angle)
        open_angle = 360
        if nearest_def_dist < 10.0:
            nearest_def = min(defenders, key=lambda d: d['dist'])
            vec_passer = np.array([passer_x - rx, passer_y - ry])
            vec_def = np.array([nearest_def['x'] - rx, nearest_def['y'] - ry])
            norm_p = np.linalg.norm(vec_passer)
            norm_d = np.linalg.norm(vec_def)
            if norm_p > 0 and norm_d > 0:
                cos_theta = np.dot(vec_passer, vec_def) / (norm_p * norm_d)
                open_angle = np.degrees(np.arccos(np.clip(cos_theta, -1.0, 1.0)))

        return {
            "p_success": p_success,
            "xt_gain": xt_gain,
            "progression_value": progression_value,
            "progression_raw": progression,
            "space_created": space_created,
            "risk": risk,
            "flight_time": flight_time,
            "nearest_def_dist": nearest_def_dist,
            "lines_broken": lines_broken,
            "between_lines": between_lines,
            "passing_lane_density": passing_lane_density,
            "open_angle": open_angle
        }

    def evaluate_actions(self, tracking_row, team_prefix, active_players, opp_prefix, opp_players, ball_x, ball_y, velocities=None, match_context=None):
        attacking_right = self._determine_attacking_direction(tracking_row, team_prefix, active_players, opp_prefix, opp_players)
        
        # Compute opposition lines for line-breaking passes
        opp_xs = [tracking_row.get(f"{opp_prefix}{p}_x") for p in opp_players if not pd.isna(tracking_row.get(f"{opp_prefix}{p}_x"))]
        opp_lines = []
        if opp_xs:
            sorted_opp_xs = sorted(opp_xs) if not attacking_right else sorted(opp_xs, reverse=True)
            # deepest 4
            def_line = np.mean(sorted_opp_xs[:4]) if len(sorted_opp_xs) >= 4 else np.mean(sorted_opp_xs)
            mid_line = np.mean(sorted_opp_xs[4:8]) if len(sorted_opp_xs) >= 8 else np.mean(sorted_opp_xs[4:]) if len(sorted_opp_xs) > 4 else def_line
            fwd_line = np.mean(sorted_opp_xs[8:]) if len(sorted_opp_xs) > 8 else mid_line
            opp_lines = [fwd_line, mid_line, def_line] # from highest to deepest
        
        # Determine Phase (simple heuristic based on ball_x)
        bx_normalized = ball_x if attacking_right else (self.length - ball_x)
        if bx_normalized < self.length / 3:
            phase = "Build-up"
        elif bx_normalized < (self.length * 2) / 3:
            phase = "Progression"
        else:
            phase = "Final Third"
            
        weights = self.config['phases'].get(phase, self.config['phases']['Progression'])
        
        # Generate Actions
        actions = []
        
        # 1. Passes to all teammates
        for p in active_players:
            tx = tracking_row.get(f"{team_prefix}{p}_x")
            ty = tracking_row.get(f"{team_prefix}{p}_y")
            if pd.isna(tx) or pd.isna(ty): continue
            
            dist = np.sqrt((tx - ball_x)**2 + (ty - ball_y)**2)
            if dist < 2.0: continue
            
            candidate_types = ['Ground Pass', 'Driven Pass', 'Lofted Pass']
            
            # Contextual triggers
            is_switch = abs(ty - ball_y) > 35.0
            if is_switch:
                # Check weak side density
                def_on_side = sum(1 for ox in opp_players if not pd.isna(tracking_row.get(f"{opp_prefix}{ox}_y")) and abs(tracking_row.get(f"{opp_prefix}{ox}_y") - ty) < 20)
                if def_on_side <= 2: # Weak side is open
                    candidate_types.append('Switch of Play')
            
            is_wide_passer = ball_y < 18 or ball_y > (self.width - 18)
            is_box_receiver = tx > (self.length - 18) if attacking_right else tx < 18
            if is_wide_passer and is_box_receiver:
                candidate_types.append('Cross')
                
            progression = (tx - ball_x) if attacking_right else (ball_x - tx)
            if progression > 10:
                candidate_types.append('Through Ball')
                
            for pass_type in candidate_types:
                target_x, target_y = tx, ty
                
                # Through balls target space ahead of receiver
                if pass_type == 'Through Ball':
                    target_x = tx + 8.0 if attacking_right else tx - 8.0
                    
                eval_metrics = self._evaluate_action(
                    pass_type, ball_x, ball_y, target_x, target_y, tx, ty, 
                    attacking_right, opp_prefix, opp_players, tracking_row, velocities, opp_lines
                )
                
                # Third Man Run Detection
                third_man_runner = None
                if velocities and pass_type in ['Ground Pass', 'Through Ball']:
                    for p3 in active_players:
                        if p3 != p and p3 != "self":
                            p3x = tracking_row.get(f"{team_prefix}{p3}_x")
                            if pd.isna(p3x): continue
                            v_data = velocities.get(f"{team_prefix}{p3}")
                            if v_data and v_data['speed'] > 4.0: # sprinting
                                # is running forward
                                if (attacking_right and v_data['vx'] > 2.0) or (not attacking_right and v_data['vx'] < -2.0):
                                    # is ahead of receiver
                                    if (attacking_right and p3x > tx) or (not attacking_right and p3x < tx):
                                        third_man_runner = p3
                                        break
                
                # Score Calculation
                risk_weight = weights['risk']
                xt_multiplier = 10
                if match_context and match_context.get("game_state") == "Trailing" and match_context.get("minute", 0) > 75:
                    risk_weight *= 0.4 # Higher risk tolerance late game
                    xt_multiplier = 15 # Value xT more
                elif match_context and match_context.get("game_state") == "Leading" and match_context.get("minute", 0) > 75:
                    risk_weight *= 1.5 # Lower risk tolerance late game
                
                iq_score = (
                    (eval_metrics['p_success'] * weights['success_probability']) +
                    (eval_metrics['xt_gain'] * weights['xt_gain'] * xt_multiplier) +
                    (eval_metrics['space_created'] * weights['space_created']) +
                    (eval_metrics['progression_value'] * weights['progression_value']) -
                    (eval_metrics['risk'] * risk_weight)
                ) * 100
                
                # Tactical fit bonus/penalty
                tactical_fit = 0
                if pass_type == 'Switch of Play': tactical_fit += 0.1
                if pass_type == 'Cross':
                    if eval_metrics['nearest_def_dist'] < 2.0: 
                        tactical_fit -= 0.1 # bad cross
                    else:
                        tactical_fit += 0.2 # prioritize crosses when open
                if eval_metrics['progression_raw'] < -15.0 and phase == "Final Third":
                    tactical_fit -= 0.2 # heavy penalty for retreating out of the final third
                    
                iq_score += (tactical_fit * weights['tactical_fit'] * 100)
                
                # Compose Reason
                reason = ""
                if match_context:
                    reason += f"[{match_context['minute']}' - {match_context['game_state']}] "
                reason += f"{phase}: "
                if eval_metrics['xt_gain'] > 0.01:
                    reason += f"Adds +{eval_metrics['xt_gain']:.2f} xT. "
                if eval_metrics.get('lines_broken', 0) > 0:
                    reason += f"Breaks {eval_metrics['lines_broken']} line(s). "
                if eval_metrics.get('between_lines', False):
                    reason += f"Receives between the lines. "
                if pass_type == 'Switch of Play':
                    reason += "Weak side is open. "
                if third_man_runner:
                    reason += f"Sets up Third-Man Run for #{third_man_runner}. "
                
                reason += f"Receiver Freedom: {eval_metrics['nearest_def_dist']:.1f}m. Open Angle: {eval_metrics.get('open_angle', 0):.0f}°. "
                reason += f"Success Prob: {eval_metrics['p_success']*100:.0f}%."

                # Confidence Score Calculation
                base_conf = 100
                if pass_type == 'Through Ball': base_conf -= 10
                if pass_type in ['Lofted Pass', 'Cross', 'Switch of Play']: base_conf -= 20
                base_conf -= (eval_metrics['flight_time'] * 5)
                base_conf -= (eval_metrics.get('passing_lane_density', 0) * 0.3)
                confidence_score = max(0, min(100, base_conf))

                actions.append({
                    "id": p,
                    "type": pass_type,
                    "target_x": target_x,
                    "target_y": target_y,
                    "score": max(0, min(100, iq_score)),
                    "xt": eval_metrics['xt_gain'],
                    "p_success": eval_metrics['p_success'],
                    "confidence": confidence_score,
                    "reason": reason,
                    "outcome": f"Lane Density: {eval_metrics.get('passing_lane_density', 0):.0f}%"
                })
                
        # 2. Carries (simplified: carry forward 10m)
        target_cx = ball_x + 10.0 if attacking_right else ball_x - 10.0
        carry_metrics = self._evaluate_action('Carry', ball_x, ball_y, target_cx, ball_y, target_cx, ball_y, attacking_right, opp_prefix, opp_players, tracking_row, velocities, opp_lines)
        if carry_metrics['nearest_def_dist'] > 4.0:
            iq_score = (
                (0.90 * weights['success_probability']) +
                (carry_metrics['xt_gain'] * weights['xt_gain'] * 10) +
                (carry_metrics['progression_value'] * weights['progression_value'])
            ) * 100
            
            actions.append({
                "id": "self",
                "type": "Carry Ball",
                "target_x": target_cx,
                "target_y": ball_y,
                "score": max(0, min(100, iq_score)),
                "xt": carry_metrics['xt_gain'],
                "p_success": 0.90,
                "confidence": 95.0, # Carries are very high confidence
                "reason": f"{phase}: Drives into open space ahead.",
                "outcome": "Advances the ball safely."
            })
            
        actions.sort(key=lambda x: x["score"], reverse=True)
        return actions

    def _get_ball_zone(self, ball_x, ball_y, attacking_right, phase):
        bx_norm = ball_x if attacking_right else (self.length - ball_x)
        if ball_y < 16: zone = BallZone.RIGHT_WING if attacking_right else BallZone.LEFT_WING
        elif ball_y < 32: zone = BallZone.RIGHT_HALF_SPACE if attacking_right else BallZone.LEFT_HALF_SPACE
        elif ball_y < 48: zone = BallZone.CENTER
        elif ball_y < 64: zone = BallZone.LEFT_HALF_SPACE if attacking_right else BallZone.RIGHT_HALF_SPACE
        else: zone = BallZone.LEFT_WING if attacking_right else BallZone.RIGHT_WING
        
        if phase == PhaseOfPlay.FINAL_THIRD.value and TacticalConstants.ZONE14_Y_MIN < ball_y < TacticalConstants.ZONE14_Y_MAX and TacticalConstants.ZONE14_X_MIN < bx_norm < TacticalConstants.ZONE14_X_MAX:
            return BallZone.ZONE_14.value
            
        return zone.value

    def _get_defensive_block(self, opp_xs_norm):
        if not opp_xs_norm: return DefensiveBlock.NONE.value, 0
        sorted_xs = sorted(opp_xs_norm)
        deepest_4 = sorted_xs[:min(4, len(sorted_xs))]
        avg_line_height = np.mean(deepest_4)
        if avg_line_height < TacticalConstants.LOW_BLOCK_MAX: return DefensiveBlock.LOW.value, avg_line_height
        if avg_line_height < TacticalConstants.MID_BLOCK_MAX: return DefensiveBlock.MID.value, avg_line_height
        return DefensiveBlock.HIGH.value, avg_line_height

    def _get_compactness(self, opp_xs, opp_ys):
        if len(opp_xs) < 3: return "N/A", "N/A", 0
        pts = np.column_stack((opp_xs, opp_ys))
        try:
            hull = ConvexHull(pts)
            area = hull.volume # In 2D, volume is area
        except:
            area = 0
        
        sorted_xs = sorted(opp_xs)
        depth = sorted_xs[-1] - sorted_xs[0]
        
        return f"{depth:.1f}m Depth", f"{area:.0f}m² Hull", area

    def _get_pressing_intensity(self, ball_x, ball_y, opp_xs, opp_ys, attacking_right):
        active_pressers = 0
        for ox, oy in zip(opp_xs, opp_ys):
            dist = np.sqrt((ox - ball_x)**2 + (oy - ball_y)**2)
            if dist < TacticalConstants.PRESS_RADIUS:
                # Goal side check
                is_goal_side = ox > ball_x if attacking_right else ox < ball_x
                if is_goal_side:
                    active_pressers += 1
        
        if active_pressers >= 3: return PressingIntensity.HIGH.value
        if active_pressers >= 1: return PressingIntensity.MEDIUM.value
        return PressingIntensity.LOW.value

    def _get_numerical_advantage(self, ball_x, ball_y, team_xs, team_ys, opp_xs, opp_ys):
        atk = sum(1 for tx, ty in zip(team_xs, team_ys) if np.sqrt((tx-ball_x)**2 + (ty-ball_y)**2) < TacticalConstants.LOCAL_AREA)
        dfd = sum(1 for ox, oy in zip(opp_xs, opp_ys) if np.sqrt((ox-ball_x)**2 + (oy-ball_y)**2) < TacticalConstants.LOCAL_AREA)
        diff = atk - dfd
        if diff > 1: return f"+{diff} Overload", diff
        if diff < -1: return f"{diff} Underload", diff
        return "Equal", diff

    def _generate_tactical_recommendation(self, phase, block, intensity, area, overload, zone):
        if phase == PhaseOfPlay.FINAL_THIRD.value:
            if area > 0 and area < 400:
                return f"The defense is highly compact centrally. Switch play quickly to exploit the weak side."
            return f"Break down the {block} via the {zone}. Look for line-breaking passes or crosses."
        elif phase == PhaseOfPlay.BUILD_UP.value:
            if intensity == PressingIntensity.HIGH.value:
                return "High pressure detected. Play direct or quickly switch play to bypass the press."
            return "Secure possession. Patiently draw out the defensive block."
        else:
            if overload > 1:
                return f"Exploit the {zone} overload. Progress quickly before the defense shifts."
            return f"Progress through {zone}. Maintain width to stretch the opponent's block."

    def get_tactical_context(self, own_shape, opp_shape, phase, ball_y, row=None, team_prefix=None, active_players=None, opp_prefix=None, opp_players=None, ball_x=None, match_context=None):
        context = {
            "current_phase": phase,
            "pressing_intensity": PressingIntensity.NONE.value,
            "defensive_block": DefensiveBlock.NONE.value,
            "compactness": "-",
            "compactness_index": 0,
            "team_width": "-",
            "ball_zone": "-",
            "numerical_advantage": "-",
            "offside_line": "-",
            "rest_defence": "-",
            "space_occupation": {},
            "tactical_recommendation": f"In {phase}, playing {own_shape} against {opp_shape}.",
            "badges": []
        }
        
        if row is not None and ball_x is not None:
            attacking_right = self._determine_attacking_direction(row, team_prefix, active_players, opp_prefix, opp_players)
            
            zone = self._get_ball_zone(ball_x, ball_y, attacking_right, phase)
            context["ball_zone"] = zone
            if zone == BallZone.ZONE_14.value:
                context["badges"].append("Central Congestion")
                
            opp_xs = [row.get(f"{opp_prefix}{p}_x") for p in opp_players if not pd.isna(row.get(f"{opp_prefix}{p}_x"))]
            opp_ys = [row.get(f"{opp_prefix}{p}_y") for p in opp_players if not pd.isna(row.get(f"{opp_prefix}{p}_y"))]
            
            area = 0
            block = DefensiveBlock.NONE.value
            intensity = PressingIntensity.NONE.value
            
            if opp_xs and opp_ys:
                opp_xs_norm = [(self.length - ox) if attacking_right else ox for ox in opp_xs]
                block, line_height = self._get_defensive_block(opp_xs_norm)
                context["defensive_block"] = block
                
                depth_str, hull_str, area = self._get_compactness(opp_xs, opp_ys)
                context["compactness"] = depth_str
                context["team_width"] = hull_str
                
                if area > 0:
                    context["compactness_index"] = max(0, min(100, int(100 - (area / 3000.0) * 100)))
                    if area < 500: context["badges"].append("Compact Defense")
                elif area > 1000: context["badges"].append("Stretched")
                
                # Offside Line (2nd deepest defender, index 1 after sorting distance from goal)
                if len(opp_xs_norm) > 1:
                    sorted_opp_xs_norm = sorted(opp_xs_norm)
                    context["offside_line"] = f"{sorted_opp_xs_norm[1]:.1f}m"
                
                intensity = self._get_pressing_intensity(ball_x, ball_y, opp_xs, opp_ys, attacking_right)
                context["pressing_intensity"] = intensity
                if intensity == PressingIntensity.HIGH.value: context["badges"].append("High Press")
                
            team_xs = [row.get(f"{team_prefix}{p}_x") for p in active_players if not pd.isna(row.get(f"{team_prefix}{p}_x"))]
            team_ys = [row.get(f"{team_prefix}{p}_y") for p in active_players if not pd.isna(row.get(f"{team_prefix}{p}_y"))]
            
            # Rest Defence
            if team_xs:
                team_xs_norm = [tx if attacking_right else (self.length - tx) for tx in team_xs]
                bx_norm = ball_x if attacking_right else (self.length - ball_x)
                players_behind_ball = sum(1 for tx_n in team_xs_norm if tx_n < bx_norm)
                context["rest_defence"] = f"{players_behind_ball} Players Behind Ball"
                if players_behind_ball < 3 and phase == PhaseOfPlay.FINAL_THIRD.value:
                    context["badges"].append("High Counter Risk")
                    
            # Space Occupation
            if team_ys:
                if attacking_right:
                    rw = sum(1 for ty in team_ys if ty < 16)
                    rhs = sum(1 for ty in team_ys if 16 <= ty < 32)
                    c = sum(1 for ty in team_ys if 32 <= ty <= 48)
                    lhs = sum(1 for ty in team_ys if 48 < ty <= 64)
                    lw = sum(1 for ty in team_ys if ty > 64)
                else:
                    lw = sum(1 for ty in team_ys if ty < 16)
                    lhs = sum(1 for ty in team_ys if 16 <= ty < 32)
                    c = sum(1 for ty in team_ys if 32 <= ty <= 48)
                    rhs = sum(1 for ty in team_ys if 48 < ty <= 64)
                    rw = sum(1 for ty in team_ys if ty > 64)
                    
                context["space_occupation"] = {
                    "Left Wing": lw,
                    "Left Half Space": lhs,
                    "Center": c,
                    "Right Half Space": rhs,
                    "Right Wing": rw
                }
                
                # Dynamic Roles (Very basic approximation based on spatial occupation vs typical shape)
                # E.g., if there's heavy central occupation in buildup, might be an Inverted FB
                if phase == PhaseOfPlay.BUILD_UP.value and c >= 4:
                    context["badges"].append("Inverted Fullbacks")
                if phase == PhaseOfPlay.FINAL_THIRD.value and c <= 1 and (lhs > 0 or rhs > 0):
                    context["badges"].append("False 9 (Central Vacated)")

            adv_str, diff = self._get_numerical_advantage(ball_x, ball_y, team_xs, team_ys, opp_xs, opp_ys)
            context["numerical_advantage"] = adv_str
            if diff > 1: context["badges"].append("Overload")
            
            context["tactical_recommendation"] = self._generate_tactical_recommendation(phase, block, intensity, area, diff, zone)

        return context

    # alias for backward compatibility
    def physics_model(self, *args, **kwargs):
        return self._physics_model(*args, **kwargs)
