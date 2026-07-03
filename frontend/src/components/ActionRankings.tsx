import React from 'react';
import './ActionRankings.css';

export interface Action {
    action: string;
    target: [number, number];
    prob: number;
    score: number;
    xt: number;
    risk?: string;
    confidence?: string;
    reason?: string;
    outcome?: string;
}

interface ActionRankingsProps {
    actions: Action[];
    selectedAction: Action | null;
    onActionSelect: (action: Action | null) => void;
}

export const ActionRankings: React.FC<ActionRankingsProps> = ({ actions, selectedAction, onActionSelect }) => {
    const [isExpanded, setIsExpanded] = React.useState(true);

    if (!actions || actions.length === 0) return null;

    const getSemanticColor = (val: number, isProb = false) => {
        if (isProb) {
            if (val >= 80) return '#10b981'; // Green
            if (val >= 60) return '#fbbf24'; // Amber
            return '#ef4444'; // Red
        }
        if (val >= 70) return '#10b981';
        if (val >= 45) return '#fbbf24';
        return '#ef4444';
    };

    const getRiskColor = (risk?: string) => {
        if (risk === 'Low') return '#10b981';
        if (risk === 'Medium') return '#fbbf24';
        if (risk === 'High') return '#ef4444';
        return '#9ca3af';
    };
    
    const getConfidenceColor = (conf?: string) => {
        if (conf === 'Very High' || conf === 'High') return '#10b981';
        if (conf === 'Medium') return '#fbbf24';
        if (conf === 'Low') return '#ef4444';
        return '#9ca3af';
    };

    return (
        <div className={`action-rankings-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <div 
                className="iq-header panel-header-clickable"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                    <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                    <h3 className="panel-title">RECOMMENDED ACTIONS</h3>
                </div>
            </div>
            
            {isExpanded && (
                <div className="scorecard-list">
                    {actions.map((act, idx) => {
                        const isSelected = selectedAction?.action === act.action && selectedAction?.score === act.score;
                        return (
                            <div 
                                key={idx} 
                                className={`scorecard-row ${isSelected ? 'selected' : ''}`}
                                onClick={() => onActionSelect(isSelected ? null : act)}
                            >
                                <div className="scorecard-header">
                                    <div className="scorecard-rank">{idx + 1}</div>
                                    <div className="scorecard-name">{act.action}</div>
                                </div>
                                
                                <div className="scorecard-metrics">
                                    <div className="metric-box">
                                        <span className="metric-label">xT Gain</span>
                                        <span className="metric-val" style={{color: act.xt > 0.05 ? '#10b981' : '#f8fafc'}}>+{act.xt.toFixed(3)}</span>
                                    </div>
                                    <div className="metric-box">
                                        <span className="metric-label">Success</span>
                                        <span className="metric-val" style={{color: getSemanticColor(act.prob, true)}}>{Math.round(act.prob)}%</span>
                                    </div>
                                    <div className="metric-box">
                                        <span className="metric-label">Risk</span>
                                        <span className="metric-val" style={{color: getRiskColor(act.risk)}}>{act.risk || '-'}</span>
                                    </div>
                                </div>

                                <div className="scorecard-details">
                                    <div className="detail-line">
                                        <span className="detail-label">Reason:</span> {act.reason || 'Optimal play progression.'}
                                    </div>
                                    <div className="detail-line">
                                        <span className="detail-label">Outcome:</span> {act.outcome || 'Maintains possession.'}
                                    </div>
                                    <div className="detail-line" style={{marginTop: '4px'}}>
                                        <span className="detail-label">Confidence:</span> <span style={{color: getConfidenceColor(act.confidence), fontWeight: 'bold'}}>{act.confidence || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
