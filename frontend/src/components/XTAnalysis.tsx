import React, { useRef, useEffect } from 'react';
import './XTAnalysis.css';

interface PassingLane {
    target_player: string;
    start: [number, number];
    end: [number, number];
    xt_added: number;
    is_progressive: boolean;
}

interface XTData {
    xt_grid: number[][]; // 20x30 grid
    current_xt: number;
    best_action: string;
    potential_xt: number;
    passing_lanes: PassingLane[];
    error?: string;
    teammates?: any[];
    opponents?: any[];
}

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

// Generate mock data for xT flow and breakdowns
const mockXTFlow = Array.from({ length: 90 }, (_, i) => ({
    minute: i,
    homeXT: Math.random() * 0.15 + (Math.sin(i / 10) * 0.05 + 0.05),
    awayXT: Math.random() * 0.12 + (Math.cos(i / 10) * 0.04 + 0.04)
}));

const mockXTBreakdown = [
    { name: 'Passes', home: 1.25, away: 0.98 },
    { name: 'Carries', home: 0.85, away: 0.65 },
    { name: 'Dribbles', home: 0.42, away: 0.55 },
];

interface XTAnalysisProps {
    data: XTData | null;
}

export const XTAnalysis: React.FC<XTAnalysisProps> = ({ data }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Draw Heatmap
    useEffect(() => {
        if (!data || !data.xt_grid || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const grid = data.xt_grid;
        const rows = grid.length;
        const cols = grid[0].length;
        
        const cellWidth = canvas.width / cols;
        const cellHeight = canvas.height / rows;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Find max xT for color scaling (usually around 0.35 in our matrix)
        let maxXt = 0.35;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const val = grid[i][j];
                const intensity = Math.min(1, val / maxXt);
                
                // Blue to Red color scale
                // Blue: 37, 99, 235 (intensity 0)
                // Red: 239, 68, 68 (intensity 1)
                const r = Math.round(37 + (239 - 37) * intensity);
                const g = Math.round(99 + (68 - 99) * intensity);
                const b = Math.round(235 + (68 - 235) * intensity);
                
                // Add transparency to the heatmap
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
                ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            }
        }
    }, [data]);

    if (!data) {
        return (
            <div className="placeholder-content">
                Click "Analyze Frame" to generate xT mapping for this exact moment.
            </div>
        );
    }

    if (data.error) {
        return (
            <div className="placeholder-content" style={{ color: '#ef4444' }}>
                Error computing xT metrics: {data.error}
            </div>
        );
    }

    const { current_xt, best_action, potential_xt, passing_lanes } = data;

    // Convert (0-120, 0-80) to SVG viewbox percentages (0-100)
    const scaleX = (x: number) => (x / 120.0) * 100;
    const scaleY = (y: number) => (y / 80.0) * 100;

    return (
        <div className="xt-analysis-container">
            {/* The Pitch Viz */}
            <div className="xt-pitch-container">
                <div className="pitch-background"></div>
                
                <canvas 
                    ref={canvasRef} 
                    width={300} 
                    height={200} 
                    className="xt-heatmap-canvas"
                />

                <svg className="xt-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Draw Passing Lanes */}
                    {passing_lanes.map((lane, idx) => {
                        const startX = scaleX(lane.start[0]);
                        const startY = scaleY(lane.start[1]);
                        const endX = scaleX(lane.end[0]);
                        const endY = scaleY(lane.end[1]);
                        
                        const isPrimary = idx === 0;
                        const strokeColor = lane.is_progressive ? '#22c55e' : '#fbbf24'; // Green or Yellow
                        const strokeWidth = isPrimary ? 0.6 : 0.3;

                        return (
                            <g key={idx}>
                                <defs>
                                    <marker id={`arrowhead-${idx}`} markerWidth="5" markerHeight="5" 
                                    refX="2" refY="2" orient="auto">
                                        <polygon points="0 0, 4 2, 0 4" fill={strokeColor} />
                                    </marker>
                                </defs>
                                <line
                                    x1={startX}
                                    y1={startY}
                                    x2={endX}
                                    y2={endY}
                                    stroke={strokeColor}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray="1,1"
                                    markerEnd={`url(#arrowhead-${idx})`}
                                    className={isPrimary ? 'primary-lane' : 'secondary-lane'}
                                />
                                {isPrimary && (
                                    <text
                                        x={(startX + endX) / 2}
                                        y={(startY + endY) / 2 - 1}
                                        fill="#ffffff"
                                        fontSize="1.5"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                    >
                                        +{Number(lane.xt_added || 0).toFixed(2)} xT
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    {/* Draw Teammates */}
                    {data.teammates && data.teammates.map((p: any, idx: number) => (
                        <g key={`tm-${idx}`}>
                            <circle 
                                cx={scaleX(p.x)} 
                                cy={scaleY(p.y)} 
                                r="2" 
                                fill="#2563eb" 
                                stroke="#ffffff"
                                strokeWidth="0.5"
                            />
                            <text x={scaleX(p.x)} y={scaleY(p.y) + 0.5} fontSize="1.5" fill="white" textAnchor="middle" alignmentBaseline="middle">{p.id}</text>
                        </g>
                    ))}
                    
                    {/* Draw Opponents */}
                    {data.opponents && data.opponents.map((p: any, idx: number) => (
                        <g key={`opp-${idx}`}>
                            <circle 
                                cx={scaleX(p.x)} 
                                cy={scaleY(p.y)} 
                                r="2" 
                                fill="#dc2626" 
                                stroke="#ffffff"
                                strokeWidth="0.5"
                            />
                            <text x={scaleX(p.x)} y={scaleY(p.y) + 0.5} fontSize="1.5" fill="white" textAnchor="middle" alignmentBaseline="middle">{p.id}</text>
                        </g>
                    ))}
                </svg>
            </div>

            {/* The Metrics Panel */}
            <div className="xt-metrics-panel">
                <h3>Expected Threat (xT)</h3>
                
                <div className="metrics-grid xt-grid-panel">
                    <div className="metric-box">
                        <span className="metric-label">Current xT</span>
                        <span className="metric-value" style={{ color: '#fbbf24' }}>{Number(current_xt || 0).toFixed(3)}</span>
                    </div>
                    
                    <div className="metric-box primary-action-box">
                        <span className="metric-label">Best Action</span>
                        <span className="metric-value">{best_action}</span>
                    </div>
                    
                    <div className="metric-box">
                        <span className="metric-label">Potential xT</span>
                        <span className="metric-value" style={{ color: '#22c55e' }}>{Number(potential_xt || 0).toFixed(3)}</span>
                    </div>
                </div>

                <div className="xt-legend">
                    <h4>xT Added Zones</h4>
                    <div className="legend-gradient">
                        <span>Low Threat (0.01)</span>
                        <div className="gradient-bar"></div>
                        <span>High Threat (0.35+)</span>
                    </div>
                    <div className="lane-legend">
                        <div className="lane-item">
                            <span className="lane-dash progressive"></span> Progressive Pass
                        </div>
                        <div className="lane-item">
                            <span className="lane-dash standard"></span> Retention Pass
                        </div>
                    </div>
                </div>
            </div>

            {/* xT Match Flow & Breakdown */}
            <div className="xt-charts-col" style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '24px' }}>
                <div className="xt-flow-chart" style={{ height: '300px', background: 'var(--color-panel)', borderRadius: 'var(--radius-card)', padding: '16px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'var(--shadow-premium)' }}>
                    <h4 style={{ color: 'var(--text-section)', margin: '0 0 16px 0' }}>xT Match Flow</h4>
                    <ResponsiveContainer width="100%" height="90%">
                        <LineChart data={mockXTFlow}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="minute" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px', boxShadow: '0px 10px 25px rgba(0,0,0,0.25)' }} />
                            <Legend />
                            <Line type="monotone" dataKey="homeXT" name="Home xT" stroke="#DC2626" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="awayXT" name="Away xT" stroke="#2563EB" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="xt-breakdown-chart" style={{ height: '250px', background: 'var(--color-panel)', borderRadius: 'var(--radius-card)', padding: '16px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'var(--shadow-premium)' }}>
                    <h4 style={{ color: 'var(--text-section)', margin: '0 0 16px 0' }}>xT Generation Source</h4>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={mockXTBreakdown} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={false} />
                            <XAxis type="number" stroke="#9ca3af" />
                            <YAxis dataKey="name" type="category" stroke="#9ca3af" width={60} />
                            <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '14px', boxShadow: '0px 10px 25px rgba(0,0,0,0.25)' }} />
                            <Legend />
                            <Bar dataKey="home" name="Home" fill="#DC2626" radius={[0, 4, 4, 0]} />
                            <Bar dataKey="away" name="Away" fill="#2563EB" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
