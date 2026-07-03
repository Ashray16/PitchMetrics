import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import './PossessionAnalysis.css';

const mockPossessionData = [
    { name: 'Home', value: 58, color: 'var(--color-home)' },
    { name: 'Away', value: 42, color: 'var(--color-away)' },
];

const mockThirdsData = [
    { name: 'Defensive 3rd', home: 25, away: 30 },
    { name: 'Middle 3rd', home: 55, away: 45 },
    { name: 'Attacking 3rd', home: 20, away: 25 },
];

const mockSequenceData = [
    { name: '1-3 Passes', home: 45, away: 60 },
    { name: '4-6 Passes', home: 35, away: 25 },
    { name: '7-9 Passes', home: 15, away: 10 },
    { name: '10+ Passes', home: 5, away: 5 },
];

export const PossessionAnalysis: React.FC = () => {
    return (
        <div className="possession-analysis-container">
            {/* Metrics Ribbon */}
            <div className="possession-metrics-bar">
                <div className="possession-metric-card">
                    <span className="metric-label">Passes Completed</span>
                    <span className="metric-value">485 - 320</span>
                </div>
                <div className="possession-metric-card">
                    <span className="metric-label">Pass Accuracy</span>
                    <span className="metric-value">86% - 78%</span>
                </div>
                <div className="possession-metric-card">
                    <span className="metric-label">10+ Pass Sequences</span>
                    <span className="metric-value">12 - 4</span>
                </div>
                <div className="possession-metric-card">
                    <span className="metric-label">Avg Build-up Speed</span>
                    <span className="metric-value">2.4 m/s - 2.8 m/s</span>
                </div>
            </div>

            <div className="possession-charts-row">
                <div className="chart-panel">
                    <h3>Overall Possession</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={mockPossessionData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {mockPossessionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-panel">
                    <h3>Possession by Thirds</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mockThirdsData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="name" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" tickFormatter={(v) => `${v}%`} />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend />
                                <Bar dataKey="home" name="Home" fill="var(--color-home)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="away" name="Away" fill="var(--color-away)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-panel">
                    <h3>Passing Sequences</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mockSequenceData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="name" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend />
                                <Bar dataKey="home" name="Home" fill="var(--color-home)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="away" name="Away" fill="var(--color-away)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
