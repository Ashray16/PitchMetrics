import React, { useState } from 'react';
import { ShieldAlert, Crosshair, Activity, AlertTriangle } from 'lucide-react';
import './TacticalContext.css';

interface TacticalContextProps {
    formation: string;
    oppFormation: string;
    context: {
        current_phase?: string;
        pressing_intensity?: string;
        defensive_block?: string;
        team_width?: string;
        team_depth?: string;
        compactness?: string;
        ball_zone?: string;
        dominant_half_space?: string;
        numerical_advantage?: string;
        rest_defence_status?: string;
        counterattack_risk?: string;
        dangerous_space?: string;
        tactical_recommendation?: string;
        badges?: string[];
        offside_line?: string;
        rest_defence?: string;
        compactness_index?: number;
        space_occupation?: any;
        defensive_recommendation?: {
            action: string;
            reason: string;
            target_area: string;
            urgency: string;
            effect: string;
        };
        patterns?: {
            pattern: string;
            confidence: number;
            signals: string[];
        }[];
    };
    globalFrame?: number;
    currentPossession?: any;
}

export const TacticalContext: React.FC<TacticalContextProps> = ({ formation, oppFormation, context, currentPossession }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const team = currentPossession?.team || 'Home';
    const color = team === 'Home' ? '#ef4444' : '#3b82f6';
    
    // Semantic color mapping for badges
    const getBadgeColor = (badge: string) => {
        const redBadges = ['High Press', 'Counter Opportunity', 'Transition Alert', 'Central Congestion', 'High Counter Risk', 'Stretched'];
        const greenBadges = ['Weak Side Open', 'Overload', 'Overload Right', 'Rest Defence Stable', 'Compact Defense'];
        const purpleBadges = ['Inverted Fullbacks', 'False 9 (Central Vacated)'];
        
        if (redBadges.includes(badge)) return '#ef4444'; // Red
        if (greenBadges.includes(badge)) return '#10b981'; // Green
        if (purpleBadges.includes(badge)) return '#a855f7'; // Purple for tactical roles
        return '#3b82f6'; // Blue default
    };

    return (
        <div className={`tactical-context-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <div 
                className="panel-header-clickable" 
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <h3 className="panel-title">TACTICAL INTELLIGENCE</h3>
                <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
            </div>
            
            {isExpanded && (
                <div className="panel-content">
                    <div className="formations-display">
                        <div className="team-form home">
                            <span className="label">Home</span>
                            <span className="value">{formation}</span>
                        </div>
                        <div className="vs-badge">VS</div>
                        <div className="team-form away">
                            <span className="label">Away</span>
                            <span className="value">{oppFormation}</span>
                        </div>
                    </div>

                    <div className="live-match-state">
                        <div className="insight-section-title">Live Match State</div>
                        
                        {context.badges && context.badges.length > 0 && (
                            <div className="tactical-badges">
                                {context.badges.map((badge, idx) => (
                                    <span key={idx} className="badge" style={{ borderColor: getBadgeColor(badge), color: getBadgeColor(badge) }}>
                                        {badge}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="state-grid">
                            <div className="state-item">
                                <span className="state-label">Phase of Play</span>
                                <span className="state-value" style={{color: '#f8fafc'}}>{context.current_phase || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Possession</span>
                                <span className="state-value" style={{color: color}}>{team}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Pressing</span>
                                <span className="state-value" style={{color: context.pressing_intensity === 'High' ? '#ef4444' : '#fbbf24'}}>{context.pressing_intensity || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Def Block</span>
                                <span className="state-value">{context.defensive_block || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Compactness</span>
                                <span className="state-value">
                                    {context.compactness || '-'} 
                                    {context.compactness_index !== undefined ? ` (${context.compactness_index}/100)` : ''}
                                </span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Team Width</span>
                                <span className="state-value">{context.team_width || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Ball Zone</span>
                                <span className="state-value">{context.ball_zone || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Num. Adv.</span>
                                <span className="state-value" style={{color: '#10b981'}}>{context.numerical_advantage || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Offside Line</span>
                                <span className="state-value" style={{color: '#fbbf24'}}>{context.offside_line || '-'}</span>
                            </div>
                            <div className="state-item">
                                <span className="state-label">Rest Defence</span>
                                <span className="state-value">{context.rest_defence || '-'}</span>
                            </div>
                        </div>

                        {context.defensive_recommendation && (
                            <div className="defensive-action-card">
                                <div className="card-header">
                                    <ShieldAlert size={16} className="icon" />
                                    <span>DEFENSIVE ACTION: {context.defensive_recommendation.action}</span>
                                </div>
                                <div className="card-meta">
                                    <div className="meta-pill"><AlertTriangle size={12}/> {context.defensive_recommendation.urgency}</div>
                                    <div className="meta-pill"><Crosshair size={12}/> {context.defensive_recommendation.target_area}</div>
                                </div>
                                <div className="card-body">
                                    {context.defensive_recommendation.reason} <span className="effect-text">{context.defensive_recommendation.effect}</span>
                                </div>
                            </div>
                        )}

                        {context.patterns && context.patterns.length > 0 && (
                            <div className="patterns-card">
                                <div className="card-header pattern-header">
                                    <Activity size={16} className="icon" />
                                    <span>DETECTED PATTERNS</span>
                                </div>
                                <div className="patterns-list">
                                    {context.patterns.map((p, i) => (
                                        <div key={i} className="pattern-item">
                                            <div className="pattern-item-header">
                                                <span className="pattern-name">{p.pattern}</span>
                                                <div className="confidence-wrapper">
                                                    <span className="confidence-text">{(p.confidence * 100).toFixed(0)}%</span>
                                                    <div className="confidence-bar-bg">
                                                        <div className="confidence-bar-fill" style={{width: `${p.confidence * 100}%`}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pattern-signals">
                                                {p.signals.map((sig, j) => (
                                                    <span key={j} className="signal-pill">{sig.replace(/_/g, ' ')}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
