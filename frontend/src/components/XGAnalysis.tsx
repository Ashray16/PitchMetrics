import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts';
import './XGAnalysis.css';

// Mock xG data for demonstration
const generateMockShots = () => {
    const shots = [];
    let homeXG = 0;
    let awayXG = 0;
    
    for (let i = 0; i < 20; i++) {
        const team = Math.random() > 0.5 ? 'Home' : 'Away';
        const minute = Math.floor(Math.random() * 90);
        const xg = Math.random() * 0.3 + 0.02; // 0.02 to 0.32
        const isGoal = Math.random() < xg;
        
        // Random field position in the attacking third
        // x: 0-1 (0 is left goal, 1 is right goal)
        // y: 0-1 (0 is top sideline, 1 is bottom sideline)
        const x = team === 'Home' ? 0.7 + Math.random() * 0.3 : 0.0 + Math.random() * 0.3;
        const y = 0.2 + Math.random() * 0.6; // mostly central
        
        const type = isGoal ? 'Goal' : (Math.random() > 0.5 ? 'Saved' : (Math.random() > 0.5 ? 'Miss' : 'Blocked'));
        
        if (team === 'Home') homeXG += xg;
        else awayXG += xg;
        
        shots.push({
            id: i,
            minute,
            team,
            xg,
            isGoal,
            type,
            player: `Player ${Math.floor(Math.random() * 11) + 1}`,
            x,
            y
        });
    }
    
    return shots.sort((a, b) => a.minute - b.minute);
};

const mockShots = generateMockShots();

// Process into cumulative data for the race chart
const generateRaceData = () => {
    const data: any[] = [{ minute: 0, homeXG: 0, awayXG: 0 }];
    let curHome = 0;
    let curAway = 0;
    
    for (let min = 1; min <= 90; min++) {
        const shotsInMin = mockShots.filter(s => s.minute === min);
        shotsInMin.forEach(s => {
            if (s.team === 'Home') curHome += s.xg;
            else curAway += s.xg;
        });
        
        if (shotsInMin.length > 0 || min % 5 === 0 || min === 90) {
            data.push({ minute: min, homeXG: curHome, awayXG: curAway, shots: shotsInMin });
        }
    }
    return data;
};

const raceData = generateRaceData();

export const XGAnalysis: React.FC = () => {
    const [hoveredShot, setHoveredShot] = useState<any>(null);

    const totalHomeXG = mockShots.filter(s => s.team === 'Home').reduce((sum, s) => sum + s.xg, 0).toFixed(2);
    const totalAwayXG = mockShots.filter(s => s.team === 'Away').reduce((sum, s) => sum + s.xg, 0).toFixed(2);
    
    const maxHomeXG = Math.max(...mockShots.filter(s => s.team === 'Home').map(s => s.xg)).toFixed(2);
    const maxAwayXG = Math.max(...mockShots.filter(s => s.team === 'Away').map(s => s.xg)).toFixed(2);

    return (
        <div className="xg-analysis-container">
            {/* Metrics Ribbon */}
            <div className="xg-metrics-bar">
                <div className="xg-metric-card">
                    <span className="metric-label">Total xG (Home - Away)</span>
                    <span className="metric-value">{totalHomeXG} - {totalAwayXG}</span>
                </div>
                <div className="xg-metric-card">
                    <span className="metric-label">Shots</span>
                    <span className="metric-value">{mockShots.filter(s => s.team === 'Home').length} - {mockShots.filter(s => s.team === 'Away').length}</span>
                </div>
                <div className="xg-metric-card">
                    <span className="metric-label">xG per Shot</span>
                    <span className="metric-value">
                        {mockShots.filter(s => s.team === 'Home').length > 0 ? (Number(totalHomeXG) / mockShots.filter(s => s.team === 'Home').length).toFixed(2) : 0} - 
                        {mockShots.filter(s => s.team === 'Away').length > 0 ? (Number(totalAwayXG) / mockShots.filter(s => s.team === 'Away').length).toFixed(2) : 0}
                    </span>
                </div>
                <div className="xg-metric-card">
                    <span className="metric-label">Highest xG Chance</span>
                    <span className="metric-value">{maxHomeXG} - {maxAwayXG}</span>
                </div>
            </div>

            <div className="xg-charts-row">
                {/* Race Chart */}
                <div className="xg-race-chart">
                    <h3>xG Race Chart</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={raceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="minute" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px', boxShadow: '0px 10px 25px rgba(0,0,0,0.25)' }} 
                                />
                                <Legend />
                                <Line type="stepAfter" dataKey="homeXG" name="Home xG" stroke="#DC2626" strokeWidth={3} dot={false} />
                                <Line type="stepAfter" dataKey="awayXG" name="Away xG" stroke="#2563EB" strokeWidth={3} dot={false} />
                                
                                {/* Overlay Goals */}
                                {mockShots.filter(s => s.isGoal).map((goal, idx) => (
                                    <ReferenceDot 
                                        key={idx} 
                                        x={goal.minute} 
                                        y={raceData.find(d => d.minute >= goal.minute) ? 
                                            (goal.team === 'Home' ? raceData.find(d => d.minute >= goal.minute)!.homeXG : raceData.find(d => d.minute >= goal.minute)!.awayXG) 
                                            : 0} 
                                        r={6} 
                                        fill="#FFD700" 
                                        stroke={goal.team === 'Home' ? '#DC2626' : '#2563EB'} 
                                        strokeWidth={2}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Shot Map */}
                <div className="xg-shot-map">
                    <h3>Shot Map</h3>
                    <div className="chart-wrapper">
                        <div className="shot-map-pitch">
                            {mockShots.map(shot => {
                                // Calculate size based on xG (base size + extra based on probability)
                                const size = 6 + (shot.xg * 20);
                                const left = shot.x * 100;
                                const top = shot.y * 100;
                                
                                let bgColor = shot.team === 'Home' ? '#DC2626' : '#2563EB';
                                if (shot.type === 'Miss') bgColor = 'transparent';
                                
                                return (
                                    <div 
                                        key={shot.id}
                                        className={`shot-marker ${shot.type.toLowerCase()}`}
                                        style={{
                                            left: `${left}%`,
                                            top: `${top}%`,
                                            width: `${size}px`,
                                            height: `${size}px`,
                                            backgroundColor: bgColor,
                                            borderColor: shot.team === 'Home' ? '#FF6B6B' : '#60A5FA'
                                        }}
                                        onMouseEnter={() => setHoveredShot({ ...shot, left, top })}
                                        onMouseLeave={() => setHoveredShot(null)}
                                    />
                                );
                            })}
                        </div>
                        
                        {hoveredShot && (
                            <div 
                                className="shot-tooltip" 
                                style={{ 
                                    left: `calc(${hoveredShot.left}% + 15px)`, 
                                    top: `calc(${hoveredShot.top}% - 15px)` 
                                }}
                            >
                                <strong>{hoveredShot.player} ({hoveredShot.minute}')</strong><br/>
                                xG: {hoveredShot.xg.toFixed(2)}<br/>
                                Result: {hoveredShot.type}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
