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
    matches: Match[];
    currentMatchId: string;
    onMatchChange: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ globalFrame, homeFormation = '4-2-3-1', awayFormation = '4-3-3', matches, currentMatchId, onMatchChange }) => {
    // 25 FPS.
    const totalSeconds = Math.floor(globalFrame / 25);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const currentMatch = matches.find(m => m.id === currentMatchId);

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
                    <span className="score">0 - 0</span>
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
