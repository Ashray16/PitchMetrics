import React, { useRef, useEffect } from 'react';
import './TacticalDeepDive.css';

interface TacticalDeepDiveProps {
    pitchControlGrid: number[][];
    homeTeam?: string;
    awayTeam?: string;
}

export const TacticalDeepDive: React.FC<TacticalDeepDiveProps> = ({ pitchControlGrid, homeTeam = "Home Team", awayTeam = "Away Team" }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current || !pitchControlGrid || pitchControlGrid.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const rows = pitchControlGrid.length;
        const cols = pitchControlGrid[0].length;
        const cellWidth = width / cols;
        const cellHeight = height / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = pitchControlGrid[r][c];
                // 1.0 is Home (Red), 0.0 is Away (Blue), 0.5 is Neutral (Transparent/White)
                let rColor = 255;
                let gColor = 255;
                let bColor = 255;
                let alpha = 0.0;

                if (val > 0.55) {
                    // Home control
                    const intensity = (val - 0.5) * 2;
                    rColor = 220; gColor = 38; bColor = 38; // Red
                    alpha = intensity * 0.7;
                } else if (val < 0.45) {
                    // Away control
                    const intensity = (0.5 - val) * 2;
                    rColor = 37; gColor = 99; bColor = 235; // Blue
                    alpha = intensity * 0.7;
                }
                
                ctx.fillStyle = `rgba(${rColor}, ${gColor}, ${bColor}, ${alpha})`;
                ctx.fillRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight);
            }
        }

        // Draw pitch lines overlay
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        // Outline
        ctx.strokeRect(0, 0, width, height);
        
        // Halfway line
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        
        // Centre circle
        ctx.moveTo(width / 2 + 30, height / 2);
        ctx.arc(width / 2, height / 2, 30, 0, Math.PI * 2);
        
        // Penalty boxes
        const boxWidth = width * 0.15;
        const boxHeight = height * 0.45;
        const boxY = (height - boxHeight) / 2;
        
        ctx.strokeRect(0, boxY, boxWidth, boxHeight);
        ctx.strokeRect(width - boxWidth, boxY, boxWidth, boxHeight);
        
        ctx.stroke();
    }, [pitchControlGrid]);

    return (
        <div className="space-control-panel">
            <div className="panel-header">
                <h3 className="panel-title">SPACE CONTROL</h3>
                <div className="legend">
                    <span className="legend-team away">{awayTeam} Control</span>
                    <div className="gradient-bar"></div>
                    <span className="legend-team home">{homeTeam} Control</span>
                </div>
            </div>
            
            <div className="minimap-container">
                <div className="minimap-grid"></div>
                <canvas 
                    ref={canvasRef} 
                    width={800} 
                    height={400} 
                    className="pitch-control-canvas"
                />
            </div>
        </div>
    );
};
