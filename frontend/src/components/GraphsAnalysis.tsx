import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import './GraphsAnalysis.css';

interface GraphsAnalysisProps {
    globalFrame: number;
}

// Generate some realistic-looking tracking data for the graph
const generateGraphData = () => {
    const data = [];
    let currentSpeed = 0;
    let distance = 0;
    for (let i = 0; i < 90; i++) {
        // Random walk for speed (km/h)
        currentSpeed = Math.max(0, Math.min(32, currentSpeed + (Math.random() - 0.4) * 5));
        
        // Accumulate distance
        distance += (currentSpeed / 3.6) * 60; // rough meter estimation per minute

        data.push({
            minute: i,
            speed: currentSpeed,
            distance: distance,
            playerLoad: (currentSpeed * 1.5) + (Math.random() * 5),
            teamIntensity: 40 + (Math.random() * 40) + (Math.sin(i / 10) * 10)
        });
    }
    return data;
};

const mockData = generateGraphData();

export const GraphsAnalysis: React.FC<GraphsAnalysisProps> = ({ globalFrame }) => {
    const [activeMetric, setActiveMetric] = useState('speed');

    const renderChart = () => {
        if (activeMetric === 'speed') {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mockData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="minute" stroke="#9ca3af" label={{ value: 'Match Minute', position: 'insideBottom', offset: -5, fill: '#9ca3af' }} />
                        <YAxis stroke="#9ca3af" label={{ value: 'Speed (km/h)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '4px' }} />
                        <Legend />
                        <Line type="monotone" dataKey="speed" name="Top Speed (Trend)" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
            );
        }
        
        if (activeMetric === 'distance') {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="minute" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px', boxShadow: '0px 10px 25px rgba(0,0,0,0.25)' }} />
                        <Legend />
                        <Area type="monotone" dataKey="distance" name="Expected Distance" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                    </AreaChart>
                </ResponsiveContainer>
            );
        }

        return (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="minute" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px', boxShadow: '0px 10px 25px rgba(0,0,0,0.25)' }} />
                    <Legend />
                    <Line type="monotone" dataKey="teamIntensity" name="Home Intensity" stroke="#DC2626" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="playerLoad" name="Away Intensity" stroke="#2563EB" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="average" name="Average" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
            </ResponsiveContainer>
        );
    };

    return (
        <div className="graphs-analysis-container">
            <div className="graphs-sidebar">
                <h3>Select Metric</h3>
                <button 
                    className={`graph-btn ${activeMetric === 'speed' ? 'active' : ''}`}
                    onClick={() => setActiveMetric('speed')}
                >
                    Velocity & Top Speed
                </button>
                <button 
                    className={`graph-btn ${activeMetric === 'distance' ? 'active' : ''}`}
                    onClick={() => setActiveMetric('distance')}
                >
                    Distance Covered
                </button>
                <button 
                    className={`graph-btn ${activeMetric === 'load' ? 'active' : ''}`}
                    onClick={() => setActiveMetric('load')}
                >
                    Player Load & Intensity
                </button>

                <div className="graph-info">
                    <p>Current Match Time: <strong>{Math.floor(globalFrame / 600)} min</strong></p>
                    <p>Dynamic charts tracking physical output across the entire match timeframe. Updated continuously as new tracking data is streamed.</p>
                </div>
            </div>
            <div className="chart-container">
                {renderChart()}
            </div>
        </div>
    );
};
