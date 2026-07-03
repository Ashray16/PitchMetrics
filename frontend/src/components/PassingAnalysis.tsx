import React, { useState, useEffect } from 'react';
import './PassingAnalysis.css';
import { endpoints, getHeaders } from '../api';

interface PassingAnalysisProps {
    globalFrame: number;
}

interface PassingNode {
    id: string;
    x: number;
    y: number;
    cluster: string;
}

interface PassingEdge {
    source: string;
    target: string;
    weight: number;
    progression: number;
    xt_added: number;
}

export const PassingAnalysis: React.FC<PassingAnalysisProps> = ({ globalFrame }) => {
    const [team, setTeam] = useState('Home');
    const [metric, setMetric] = useState('network');
    
    const [nodes, setNodes] = useState<PassingNode[]>([]);
    const [edges, setEdges] = useState<PassingEdge[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchPassingData = async () => {
            setLoading(true);
            try {
                const url = endpoints.analysisPassing(globalFrame, team);
                const response = await fetch(url, { headers: getHeaders() });
                const data = await response.json();
                
                // Convert coordinates from 120x80 to 100x100 SVG scale
                const scaledNodes = data.nodes.map((n: any) => ({
                    ...n,
                    x: (n.x / 120) * 100,
                    y: (n.y / 80) * 100
                }));
                
                setNodes(scaledNodes);
                setEdges(data.edges);
            } catch (err) {
                console.error("Failed to load passing data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPassingData();
    }, [globalFrame, team]);

    // Helpers for rendering based on metric
    const getEdgeColor = (edge: PassingEdge) => {
        if (metric === 'xT_added') {
            return edge.xt_added > 0.05 ? '#f59e0b' : (team === 'Home' ? '#ef4444' : '#3b82f6');
        }
        if (metric === 'progression') {
            return edge.progression > 15 ? '#10b981' : (team === 'Home' ? '#ef4444' : '#3b82f6');
        }
        return team === 'Home' ? '#ef4444' : '#3b82f6';
    };
    
    const getEdgeWidth = (edge: PassingEdge) => {
        if (metric === 'progression') return Math.max(0.2, edge.progression * 0.05);
        if (metric === 'xT_added') return Math.max(0.2, edge.xt_added * 20);
        return Math.max(0.2, edge.weight * 0.05);
    };

    const getNodeColor = (node: PassingNode) => {
        if (metric === 'clusters') {
            if (node.cluster === 'Defense') return '#3b82f6';
            if (node.cluster === 'Midfield') return '#10b981';
            if (node.cluster === 'Attack') return '#f59e0b';
        }
        return team === 'Home' ? '#b91c1c' : '#1d4ed8';
    };

    const getLegendDescription = () => {
        switch (metric) {
            case 'xT_added': return <><p><strong>Edges:</strong> Orange lines indicate passes with high Expected Threat (xT &gt; 0.05). Thicker lines = higher xT.</p></>;
            case 'progression': return <><p><strong>Edges:</strong> Green lines indicate highly progressive passes (&gt;15m forward). Thicker lines = more progression.</p></>;
            case 'clusters': return <><p><strong>Nodes:</strong> Colors indicate tactical clustering (Blue=Defense, Green=Midfield, Yellow=Attack).</p></>;
            default: return <><p><strong>Nodes:</strong> Average position.</p><p><strong>Edges:</strong> Volume of passes between players.</p></>;
        }
    };

    return (
        <div className="passing-analysis-container">
            <div className="passing-viz-container">
                <div className="pitch-background"></div>
                {loading && <div className="loading-overlay">Loading Passing Data...</div>}
                
                <svg className="passing-network-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Render Edges */}
                    {!loading && edges.map((edge, idx) => {
                        const sourceNode = nodes.find(n => n.id === edge.source);
                        const targetNode = nodes.find(n => n.id === edge.target);
                        if (!sourceNode || !targetNode) return null;
                        
                        // Flip X axis if away team (so they always attack right to left if desired, or left to right? 
                        // The user's original code had: sx = team === 'Home' ? sourceNode.x : 100 - sourceNode.x;
                        const sx = team === 'Home' ? sourceNode.x : 100 - sourceNode.x;
                        const tx = team === 'Home' ? targetNode.x : 100 - targetNode.x;
                        
                        const strokeWidth = getEdgeWidth(edge);
                        const strokeColor = getEdgeColor(edge);
                        
                        // Determine opacity based on weight so weak links fade out
                        const opacity = Math.min(1, edge.weight * 0.05 + 0.1);

                        return (
                            <line 
                                key={`edge-${idx}`}
                                x1={sx} 
                                y1={sourceNode.y} 
                                x2={tx} 
                                y2={targetNode.y}
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                opacity={opacity}
                            />
                        );
                    })}

                    {/* Render Nodes */}
                    {!loading && nodes.map(node => {
                        const nx = team === 'Home' ? node.x : 100 - node.x;
                        const radius = 2.5; 
                        
                        return (
                            <g key={`node-${node.id}`}>
                                <circle 
                                    cx={nx} 
                                    cy={node.y} 
                                    r={radius} 
                                    fill={getNodeColor(node)}
                                    stroke="#ffffff"
                                    strokeWidth="0.5"
                                />
                                <text 
                                    x={nx} 
                                    y={node.y + 0.5} 
                                    fill="#ffffff" 
                                    fontSize="2" 
                                    textAnchor="middle" 
                                    fontWeight="bold"
                                >
                                    {node.id}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="passing-controls-panel">
                <h3>Passing Analytics</h3>
                
                <div className="control-group">
                    <label>Team</label>
                    <div className="team-toggle">
                        <button 
                            className={`toggle-btn ${team === 'Home' ? 'active home' : ''}`}
                            onClick={() => setTeam('Home')}
                        >
                            Home
                        </button>
                        <button 
                            className={`toggle-btn ${team === 'Away' ? 'active away' : ''}`}
                            onClick={() => setTeam('Away')}
                        >
                            Away
                        </button>
                    </div>
                </div>

                <div className="control-group">
                    <label>Visualization Type</label>
                    <select 
                        value={metric} 
                        onChange={(e) => setMetric(e.target.value)}
                        className="control-select"
                    >
                        <option value="network">Passing Network</option>
                        <option value="xT_added">xT from Passes</option>
                        <option value="progression">Pass Progression</option>
                        <option value="clusters">Passing Clusters</option>
                    </select>
                </div>

                <div className="passing-legend">
                    <h4>Network Meaning</h4>
                    {getLegendDescription()}
                </div>
            </div>
        </div>
    );
};
