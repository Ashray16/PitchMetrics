import React from 'react';
import './StatisticsRibbon.css';

interface StatisticsRibbonProps {
    isPlaying: boolean;
    isAnalyzing: boolean;
    currentPossession: any;
    analyticsData: any;
}

export const StatisticsRibbon: React.FC<StatisticsRibbonProps> = ({ 
    isPlaying, 
    isAnalyzing, 
    currentPossession, 
    analyticsData 
}) => {
    
    // Default Live Match Statistics (mocked for now, in a real app this updates with the clock)
    const renderLiveStats = () => (
        <div className="statistics-ribbon playing-mode">
            <div className="stat-mode-badge live-badge">LIVE MATCH</div>
            <div className="stat-item">
                <span className="stat-label">Possession</span>
                <span className="stat-value"><span className="home-val">61%</span> - <span className="away-val">39%</span></span>
            </div>
            <div className="stat-divider">|</div>
            <div className="stat-item">
                <span className="stat-label">xG</span>
                <span className="stat-value"><span className="home-val">0.84</span> - <span className="away-val">1.12</span></span>
            </div>
            <div className="stat-divider">|</div>
            <div className="stat-item">
                <span className="stat-label">Pass Acc</span>
                <span className="stat-value"><span className="home-val">89%</span> - <span className="away-val">82%</span></span>
            </div>
        </div>
    );

    // Current Possession Statistics (when paused)
    const renderPossessionStats = () => {
        if (!currentPossession) return renderLiveStats();
        
        const duration = (Number((currentPossession.end_frame - currentPossession.start_frame) || 0) / 10).toFixed(1);
        const team = currentPossession.team === 'Home' ? 'home-val' : 'away-val';
        
        return (
            <div className="statistics-ribbon possession-mode">
                <div className="stat-mode-badge poss-badge">POSSESSION</div>
                <div className="stat-item">
                    <span className="stat-label">Team</span>
                    <span className={`stat-value ${team}`}>{currentPossession.team}</span>
                </div>
                <div className="stat-divider">|</div>
                <div className="stat-item">
                    <span className="stat-label">Duration</span>
                    <span className="stat-value">{duration}s</span>
                </div>
                <div className="stat-divider">|</div>
                <div className="stat-item">
                    <span className="stat-label">Passes</span>
                    <span className="stat-value">{currentPossession.passes || 0}</span>
                </div>
                <div className="stat-divider">|</div>
                <div className="stat-item">
                    <span className="stat-label">Sequence</span>
                    <span className="stat-value">Build-up</span>
                </div>
            </div>
        );
    };

    // Frame Analytics (when Analyze Frame is clicked)
    const renderFrameStats = () => {
        if (!analyticsData) return renderPossessionStats();
        
        const homeControl = analyticsData.home_control !== undefined ? analyticsData.home_control : 51.2;
        const awayControl = analyticsData.away_control !== undefined ? analyticsData.away_control : 48.8;
        
        return (
            <div className="statistics-ribbon analyze-mode">
                <div className="stat-mode-badge analyze-badge">FRAME ANALYSIS</div>
                <div className="stat-item">
                    <span className="stat-label">Pitch Control</span>
                    <span className="stat-value">
                        <span className="home-val">{Number(homeControl || 0).toFixed(1)}%</span> - <span className="away-val">{Number(awayControl || 0).toFixed(1)}%</span>
                    </span>
                </div>
                <div className="stat-divider">|</div>
                <div className="stat-item">
                    <span className="stat-label">Def Pressure</span>
                    <span className="stat-value">High</span>
                </div>
                <div className="stat-divider">|</div>
                <div className="stat-item">
                    <span className="stat-label">Space Control</span>
                    <span className="stat-value">Compact</span>
                </div>
            </div>
        );
    };

    let content;
    if (isPlaying) {
        content = renderLiveStats();
    } else if (isAnalyzing) {
        content = renderFrameStats();
    } else {
        content = renderPossessionStats();
    }

    return (
        <div className="statistics-ribbon-container">
            {content}
        </div>
    );
};
