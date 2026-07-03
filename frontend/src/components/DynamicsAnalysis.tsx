import React from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './DynamicsAnalysis.css';

// Mock data for Match Momentum
const generateMomentum = () => {
    const data = [];
    let momentum = 0;
    for (let i = 0; i <= 90; i += 2) {
        // Random walk, bounded between -100 (Away) and 100 (Home)
        momentum += (Math.random() - 0.5) * 40;
        momentum = Math.max(-100, Math.min(100, momentum));
        
        // Split into positive (Home) and negative (Away) for AreaChart
        data.push({
            minute: i,
            homeMomentum: momentum > 0 ? momentum : 0,
            awayMomentum: momentum < 0 ? momentum : 0,
            raw: momentum
        });
    }
    return data;
};

// Mock data for Fatigue (Sprint Capacity Decline)
const generateFatigue = () => {
    const data = [];
    for (let i = 0; i <= 90; i += 5) {
        // Starts at 100%, drops to ~70% with some noise
        const homeDecline = 100 - (i / 90) * 30 + (Math.random() - 0.5) * 5;
        const awayDecline = 100 - (i / 90) * 35 + (Math.random() - 0.5) * 5;
        data.push({
            minute: i,
            homeSprintCapacity: Math.min(100, Math.max(0, homeDecline)),
            awaySprintCapacity: Math.min(100, Math.max(0, awayDecline))
        });
    }
    return data;
};

const mockMomentum = generateMomentum();
const mockFatigue = generateFatigue();

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ backgroundColor: '#111827', padding: '12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                <p style={{ margin: '0 0 8px 0', color: '#9ca3af', fontWeight: 'bold' }}>{label}' Minute</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} style={{ color: entry.color, fontSize: '13px', margin: '4px 0' }}>
                        {entry.name}: {Number(entry.value).toFixed(1)}{entry.name.includes('Capacity') ? '%' : ''}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const DynamicsAnalysis: React.FC = () => {
    return (
        <div className="dynamics-analysis-container">
            <div className="dynamics-charts-col">
                {/* Momentum Chart */}
                <div className="dynamics-chart-card" style={{ height: '350px' }}>
                    <h4>Match Momentum</h4>
                    <p className="chart-subtitle">Expected Threat and Field Tilt advantage over time.</p>
                    <ResponsiveContainer width="100%" height="80%">
                        <AreaChart data={mockMomentum} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorHome" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorAway" x1="0" y1="1" x2="0" y2="0">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="minute" stroke="#9ca3af" tickFormatter={(tick) => `${tick}'`} />
                            <YAxis domain={[-100, 100]} stroke="#9ca3af" hide />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <ReferenceLine y={0} stroke="#6b7280" />
                            <Area type="monotone" dataKey="homeMomentum" name="Home Dominance" stroke="#ef4444" fillOpacity={1} fill="url(#colorHome)" />
                            <Area type="monotone" dataKey="awayMomentum" name="Away Dominance" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAway)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Fatigue Chart */}
                <div className="dynamics-chart-card" style={{ height: '300px' }}>
                    <h4>Team Fatigue (Player Load)</h4>
                    <p className="chart-subtitle">Average team sprint capacity (%) remaining.</p>
                    <ResponsiveContainer width="100%" height="80%">
                        <LineChart data={mockFatigue} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="minute" stroke="#9ca3af" tickFormatter={(tick) => `${tick}'`} />
                            <YAxis domain={[50, 105]} stroke="#9ca3af" tickFormatter={(tick) => `${tick}%`} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend />
                            <Line type="monotone" dataKey="homeSprintCapacity" name="Home Sprint Capacity" stroke="#ef4444" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="awaySprintCapacity" name="Away Sprint Capacity" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
