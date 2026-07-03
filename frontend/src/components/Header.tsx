import React from 'react';
import './Header.css';

interface Match {
    id: string;
    home_team: string;
    away_team: string;
    home_score: number;
    away_score: number;
    date: string;
}

interface HeaderProps {
    globalFrame: number;
    homeFormation?: string;
    awayFormation?: string;
    matches: any[];
    events?: any[];
    currentMatchId: string;
    onMatchChange: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ globalFrame, homeFormation = '4-2-3-1', awayFormation = '4-3-3', matches, events = [], currentMatchId, onMatchChange }) => {
    // SkillCorner tracking data is 10 FPS
    const totalSeconds = Math.floor(globalFrame / 10);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const currentMatch = matches.find(m => m.id === currentMatchId);
    
    // Calculate dynamic score based on events up to the current globalFrame
    let dynamicHomeScore = 0;
    let dynamicAwayScore = 0;
    
    events.forEach(ev => {
        if (ev.type === 'goal' && ev.frame <= globalFrame) {
            if (ev.team === 'Home') dynamicHomeScore += 1;
            else if (ev.team === 'Away') dynamicAwayScore += 1;
        }
    });

    return (
        <header className="app-header">
            <div className="match-selector-container">
                <select 
                    value={currentMatchId} 
                    onChange={(e) => onMatchChange(e.target.value)}
                    className="match-select"
                    style={{ background: '#1e293b', color: 'white', padding: '8px 12px', borderRadius: '4px', border: '1px solid #334155', fontFamily: 'Inter, sans-serif' }}
                >
                    {matches.map(m => (
                        <option key={m.id} value={m.id}>
                            {m.home_team} vs {m.away_team} ({new Date(m.date).toLocaleDateString()})
                        </option>
                    ))}
                </select>
            </div>
            <div className="broadcast-container">
                <div className="broadcast-row top">
                    <span className="team-name home">{currentMatch ? currentMatch.home_team : 'Home'}</span>
                    <span className="competition">A-League</span>
                    <span className="team-name away">{currentMatch ? currentMatch.away_team : 'Away'}</span>
                </div>
                
                <div className="broadcast-row score-row">
                    <span className="score">{dynamicHomeScore} - {dynamicAwayScore}</span>
                </div>
                
                <div className="broadcast-row bottom">
                    <span className="match-time">{timeStr}</span>
                    <span className="match-period">1st Half</span>
                </div>
                
                <div className="broadcast-row formations">
                    <span className="formation">{homeFormation}</span>
                    <span className="formation">{awayFormation}</span>
                </div>
        </div>
            <div className="header-right-spacer"></div>
        </header>
    );
};
