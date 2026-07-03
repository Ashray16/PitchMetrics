import React from 'react';
import { BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import './DefensiveAnalysis.css';
import './PossessionAnalysis.css'; // Reuse chart panel styles

const mockDefensiveActions = [
    { name: 'Tackles', home: 22, away: 18 },
    { name: 'Interceptions', home: 14, away: 25 },
    { name: 'Clearances', home: 18, away: 32 },
    { name: 'Blocks', home: 5, away: 8 },
    { name: 'Fouls', home: 12, away: 10 },
];

const mockPPDA = Array.from({ length: 9 }, (_, i) => ({
    period: `${i * 10}-${(i + 1) * 10}'`,
    home: Math.random() * 5 + 8, // 8-13
    away: Math.random() * 8 + 12 // 12-20
}));

const mockDefensiveShape = [
    { subject: 'High Press', home: 120, away: 80, fullMark: 150 },
    { subject: 'Mid Block', home: 98, away: 130, fullMark: 150 },
    { subject: 'Low Block', home: 65, away: 140, fullMark: 150 },
    { subject: 'Compactness', home: 110, away: 90, fullMark: 150 },
    { subject: 'Line Height', home: 130, away: 70, fullMark: 150 },
];

export const DefensiveAnalysis: React.FC = () => {
    return (
        <div className="defensive-analysis-container">
            {/* Metrics Ribbon */}
            <div className="defensive-metrics-bar">
                <div className="defensive-metric-card">
                    <span className="metric-label">PPDA (Overall)</span>
                    <span className="metric-value">9.4 - 15.2</span>
                </div>
                <div className="defensive-metric-card">
                    <span className="metric-label">Avg Line Height</span>
                    <span className="metric-value">48m - 35m</span>
                </div>
                <div className="defensive-metric-card">
                    <span className="metric-label">High Turnovers</span>
                    <span className="metric-value">12 - 4</span>
                </div>
                <div className="defensive-metric-card">
                    <span className="metric-label">Duels Won %</span>
                    <span className="metric-value">54% - 46%</span>
                </div>
            </div>

            <div className="defensive-charts-row">
                <div className="chart-panel">
                    <h3>PPDA Timeline (Pressing Intensity)</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mockPPDA}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="period" stroke="#9ca3af" fontSize={12} />
                                <YAxis stroke="#9ca3af" reversed={true} domain={[5, 25]} label={{ value: 'Lower = Higher Pressing', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 12 }} />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend />
                                <Bar dataKey="home" name="Home PPDA" fill="var(--color-home)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="away" name="Away PPDA" fill="var(--color-away)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-panel">
                    <h3>Defensive Actions</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mockDefensiveActions} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={false} />
                                <XAxis type="number" stroke="#9ca3af" />
                                <YAxis dataKey="name" type="category" stroke="#9ca3af" />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend />
                                <Bar dataKey="home" name="Home" fill="var(--color-home)" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="away" name="Away" fill="var(--color-away)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-panel">
                    <h3>Defensive Profile</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={mockDefensiveShape}>
                                <PolarGrid stroke="#374151" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} />
                                <Radar name="Home" dataKey="home" stroke="var(--color-home)" fill="var(--color-home)" fillOpacity={0.4} />
                                <Radar name="Away" dataKey="away" stroke="var(--color-away)" fill="var(--color-away)" fillOpacity={0.4} />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px' }} />
                                <Legend />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
