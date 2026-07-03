import React, { useRef, useEffect, useState } from 'react';
import './HeatmapAnalysis.css';
import { endpoints, getHeaders } from '../api';

interface HeatmapData {
    heatmap_grid: number[][]; // 20x30 grid
    type: string;
    player?: string;
    team: string;
    error?: string;
}

interface HeatmapAnalysisProps {
    globalFrame: number;
}

export const HeatmapAnalysis: React.FC<HeatmapAnalysisProps> = ({ globalFrame }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [heatmapType, setHeatmapType] = useState('team');
    const [selectedTeam, setSelectedTeam] = useState('Home');
    const [selectedPlayer, setSelectedPlayer] = useState('');
    const [data, setData] = useState<HeatmapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [roster, setRoster] = useState<{home: any[], away: any[]}>({home: [], away: []});

    // Fetch roster on mount
    useEffect(() => {
        fetch(endpoints.roster(), { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.home && data.away) {
                    setRoster(data);
                    // Select first available player for home team as default
                    if (data.home.length > 0 && !selectedPlayer) {
                        setSelectedPlayer(data.home[0].id);
                    }
                }
            })
            .catch(err => console.error("Failed to fetch roster:", err));
    }, []);

    const fetchHeatmap = async () => {
        if (globalFrame === 0) return;
        setLoading(true);
        try {
            let typeParam = heatmapType;
            let playerParam = heatmapType === 'player' ? `${selectedTeam.toLowerCase()}_${selectedPlayer}` : '';
            const url = endpoints.analysisHeatmap(globalFrame, typeParam, playerParam, selectedTeam);
            
            const res = await fetch(url, { headers: getHeaders() });
            if (res.ok) {
                const d = await res.json();
                setData(d);
            }
        } catch (e) {
            console.error("Failed to fetch heatmap", e);
        }
        setLoading(false);
    };

    // Refetch when controls change or frame changes
    useEffect(() => {
        fetchHeatmap();
    }, [heatmapType, selectedTeam, selectedPlayer, globalFrame]);

    // Handle Team Change to reset selected player
    useEffect(() => {
        if (selectedTeam === 'Home' && roster.home.length > 0) {
            setSelectedPlayer(roster.home[0].id);
        } else if (selectedTeam === 'Away' && roster.away.length > 0) {
            setSelectedPlayer(roster.away[0].id);
        }
    }, [selectedTeam, roster]);

    // Draw Heatmap
    useEffect(() => {
        if (!data || !data.heatmap_grid || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const grid = data.heatmap_grid;
        const rows = grid.length;
        const cols = grid[0].length;
        
        const cellWidth = canvas.width / cols;
        const cellHeight = canvas.height / rows;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Heatmap colors: Dark Blue -> Grey -> Orange -> Red
        const colors = [
            { v: 0.0, r: 30, g: 58, b: 138 },    // Dark Blue
            { v: 0.33, r: 156, g: 163, b: 175 }, // Grey
            { v: 0.66, r: 249, g: 115, b: 22 },  // Orange
            { v: 1.0, r: 220, g: 38, b: 38 }     // Red
        ];
        
        const interpolateColor = (val: number) => {
            if (val <= 0) return colors[0];
            if (val >= 1) return colors[3];
            let i = 0;
            while (val > colors[i+1].v) i++;
            const c1 = colors[i];
            const c2 = colors[i+1];
            const t = (val - c1.v) / (c2.v - c1.v);
            return {
                r: Math.round(c1.r + t * (c2.r - c1.r)),
                g: Math.round(c1.g + t * (c2.g - c1.g)),
                b: Math.round(c1.b + t * (c2.b - c1.b))
            };
        };

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const intensity = grid[i][j];
                if (intensity > 0.05) { // Threshold to hide completely empty space
                    const c = interpolateColor(intensity);
                    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, intensity + 0.3)})`;
                    ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
                }
            }
        }
    }, [data]);

    return (
        <div className="heatmap-analysis-container">
            {/* The Pitch Viz */}
            <div className="heatmap-pitch-container">
                <div className="pitch-background"></div>
                
                <canvas 
                    ref={canvasRef} 
                    width={300} 
                    height={200} 
                    className="heatmap-canvas"
                />
                
                {loading && (
                    <div className="heatmap-loading-overlay">
                        Generating Heatmap...
                    </div>
                )}
            </div>

            {/* The Controls Panel */}
            <div className="heatmap-controls-panel">
                <h3>Spatial Heatmaps</h3>
                
                <div className="control-group">
                    <label>Map Type</label>
                    <select 
                        value={heatmapType} 
                        onChange={(e) => setHeatmapType(e.target.value)}
                        className="control-select"
                    >
                        <option value="team">Team Heatmap</option>
                        <option value="player">Player Heatmap</option>
                        <option value="ball">Ball Touches</option>
                        <option value="pressure">Defensive Pressure</option>
                        <option value="pass_origin">Passing Origins</option>
                        <option value="pass_dest">Passing Destinations</option>
                    </select>
                </div>
                
                <div className="control-group">
                    <label>Team</label>
                    <div className="team-toggle">
                        <button 
                            className={`toggle-btn ${selectedTeam === 'Home' ? 'active home' : ''}`}
                            onClick={() => setSelectedTeam('Home')}
                        >
                            Home
                        </button>
                        <button 
                            className={`toggle-btn ${selectedTeam === 'Away' ? 'active away' : ''}`}
                            onClick={() => setSelectedTeam('Away')}
                        >
                            Away
                        </button>
                    </div>
                </div>

                {heatmapType === 'player' && (
                    <div className="control-group">
                        <label>Select Player</label>
                        <select 
                            value={selectedPlayer} 
                            onChange={(e) => setSelectedPlayer(e.target.value)}
                            className="control-select"
                        >
                            {(selectedTeam === 'Home' ? roster.home : roster.away).map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="heatmap-legend">
                    <h4>Intensity</h4>
                    <div className="legend-gradient">
                        <span>Low</span>
                        <div className="gradient-bar"></div>
                        <span>High</span>
                    </div>
                    <p className="legend-description">
                        Heatmaps aggregate positional data from the start of the match up to the current frame.
                    </p>
                </div>
            </div>
        </div>
    );
};
