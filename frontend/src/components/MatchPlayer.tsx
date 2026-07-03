import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react';
import { Timeline } from './Timeline';
import { endpoints, getHeaders } from '../api';
import './MatchPlayer.css';

interface MatchPlayerProps {
    onAnalyze: (frame: number) => void;
    onFrameChange: (globalFrame: number) => void;
    onPlayStateChange?: (isPlaying: boolean) => void;
    onPossessionChange?: (possession: any) => void;
    selectedAction?: any;
}

export const MatchPlayer: React.FC<MatchPlayerProps> = ({ onAnalyze, onFrameChange, onPlayStateChange, onPossessionChange, selectedAction }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [possessions, setPossessions] = useState<any[]>([]);
    const [currentPossession, setCurrentPossession] = useState<any>(null);
    const [maxGlobalFrames, setMaxGlobalFrames] = useState(20000);
    const [homeGk, setHomeGk] = useState('11');
    const [awayGk, setAwayGk] = useState('25');
    const [events, setEvents] = useState<any[]>([]);
    
    // Playback state
    const [frames, setFrames] = useState<any[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1.0);

    // Augmented Reality Toggles
    const [showVoronoi, setShowVoronoi] = useState(false);
    const [showHull, setShowHull] = useState(false);
    const [showCentroids, setShowCentroids] = useState(false);
    const [showCompactness, setShowCompactness] = useState(false);
    const [showVelocity, setShowVelocity] = useState(false);
    
    // Use refs for high-frequency animation state to avoid React rerenders
    const currentFrameIdxRef = useRef(0);
    const requestRef = useRef<number | undefined>(undefined);
    const lastTimeRef = useRef<number | undefined>(undefined);
    const accumulatorRef = useRef<number>(0);
    const [uiFrameIdx, setUiFrameIdx] = useState(0); // Only update periodically for UI
    
    const msPerFrame = 50; // 2x playback speed

    useEffect(() => {
        fetch(endpoints.possessions(), { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data && data.possessions && data.possessions.length > 0) {
                    setPossessions(data.possessions);
                    setCurrentPossession(data.possessions[0]);
                    if (onPossessionChange) onPossessionChange(data.possessions[0]);
                    const lastPoss = data.possessions[data.possessions.length - 1];
                    setMaxGlobalFrames(lastPoss.end_frame);
                }
            })
            .catch(err => console.error("Failed to fetch possessions:", err));
            
        fetch(endpoints.gks(), { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data && data.home_gk) setHomeGk(data.home_gk);
                if (data && data.away_gk) setAwayGk(data.away_gk);
            })
            .catch(err => console.error("Failed to fetch GKs:", err));
            
        fetch(endpoints.events(), { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data && data.events) setEvents(data.events);
            })
            .catch(err => console.error("Failed to fetch events:", err));
            
    }, []);

    useEffect(() => {
        if (onPlayStateChange) {
            onPlayStateChange(isPlaying);
        }
    }, [isPlaying, onPlayStateChange]);

    useEffect(() => {
        if (!currentPossession) return;
        
        setFrames([]);
        
        fetch(endpoints.possessionFrames(currentPossession.id), { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data && data.frames) {
                    setFrames(data.frames);
                    if (data.frames.length > 0) {
                        const safeIdx = Math.max(0, Math.min(currentFrameIdxRef.current, data.frames.length - 1));
                        currentFrameIdxRef.current = safeIdx;
                        setUiFrameIdx(safeIdx);
                        drawFrame(data.frames[safeIdx]);
                    }
                }
            });
    }, [currentPossession]);

    const animate = (time: number) => {
        if (lastTimeRef.current != null) {
            const deltaTime = time - lastTimeRef.current;
            accumulatorRef.current += (deltaTime * speed);
            
            const framesToAdvance = Math.floor(accumulatorRef.current / msPerFrame);
            
            if (framesToAdvance > 0) {
                accumulatorRef.current -= (framesToAdvance * msPerFrame);
                
                currentFrameIdxRef.current += framesToAdvance;
                
                if (currentFrameIdxRef.current >= frames.length - 1) {
                    currentFrameIdxRef.current = frames.length - 1;
                    
                    const idx = possessions.findIndex(p => p.id === currentPossession?.id);
                    if (idx >= 0 && idx < possessions.length - 1) {
                        setCurrentPossession(possessions[idx + 1]);
                        if (onPossessionChange) onPossessionChange(possessions[idx + 1]);
                    } else {
                        setIsPlaying(false);
                    }
                }
                
                // Draw directly without React state update
                drawFrame(frames[currentFrameIdxRef.current]);
                
                // Debounce UI state update (e.g. 5 times a second)
                if (currentFrameIdxRef.current % 5 === 0) {
                    setUiFrameIdx(currentFrameIdxRef.current);
                    if (currentPossession) {
                        onFrameChange(currentPossession.start_frame + currentFrameIdxRef.current);
                    }
                }
            }
        }
        
        lastTimeRef.current = time;
        if (isPlaying && currentFrameIdxRef.current < frames.length - 1) {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        if (isPlaying && frames.length > 0) {
            lastTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            lastTimeRef.current = undefined;
            // Force UI sync when paused
            setUiFrameIdx(currentFrameIdxRef.current);
            if (currentPossession && frames.length > 0) {
                onFrameChange(currentPossession.start_frame + currentFrameIdxRef.current);
            }
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, frames, speed]);

    // Initial draw when frames load
    useEffect(() => {
        if (frames.length > 0) {
            currentFrameIdxRef.current = 0;
            setUiFrameIdx(0);
            drawFrame(frames[0]);
        }
    }, [frames]);

    // Redraw if AR overlays are toggled while paused
    useEffect(() => {
        if (!isPlaying && frames.length > 0 && currentFrameIdxRef.current < frames.length) {
            drawFrame(frames[currentFrameIdxRef.current]);
        }
    }, [showVoronoi, showHull, showCentroids, showCompactness, showVelocity, selectedAction]);

    const drawPitch = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        // 1. Grass Stripes (Avoid saturated green, slightly more contrast)
        const numStripes = 10;
        const stripeWidth = w / numStripes;
        for (let i = 0; i < numStripes; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#1f331b' : '#182b14'; // Darker, less saturated
            ctx.fillRect(i * stripeWidth, 0, stripeWidth, h);
        }
        
        // Ambient Lighting (Overlay gradient)
        const ambient = ctx.createLinearGradient(0, 0, 0, h);
        ambient.addColorStop(0, 'rgba(0,0,0,0.3)');
        ambient.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        ambient.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = ambient;
        ctx.fillRect(0, 0, w, h);

        // Soft Inner Shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, w, h);

        // 2. Lines (Brighter white)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2;
        
        // Borders
        ctx.strokeRect(0, 0, w, h);
        
        // Center line
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
        
        // Center circle (radius ~9.15m)
        const scaleX = w / 120.0;
        const scaleY = h / 80.0;
        
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 9.15 * scaleX, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 3, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();

        // Penalty Boxes (16.5m x 40.3m)
        const penBoxW = 16.5 * scaleX;
        const penBoxH = 40.3 * scaleY;
        const penBoxY = (h - penBoxH) / 2;
        ctx.strokeRect(0, penBoxY, penBoxW, penBoxH);
        ctx.strokeRect(w - penBoxW, penBoxY, penBoxW, penBoxH);
        
        // 6-yard Boxes (5.5m x 18.3m)
        const sixBoxW = 5.5 * scaleX;
        const sixBoxH = 18.3 * scaleY;
        const sixBoxY = (h - sixBoxH) / 2;
        ctx.strokeRect(0, sixBoxY, sixBoxW, sixBoxH);
        ctx.strokeRect(w - sixBoxW, sixBoxY, sixBoxW, sixBoxH);
        
        // Penalty Spots (11m)
        ctx.beginPath();
        ctx.arc(11 * scaleX, h / 2, 2.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w - (11 * scaleX), h / 2, 2.5, 0, 2 * Math.PI);
        ctx.fill();
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, p: any, isHome: boolean, _gkColor: string, isGK: boolean, scaleX: number, scaleY: number, isSelected: boolean = false) => {
        const cx = p.x * scaleX;
        const cy = p.y * scaleY;
        
        // Selected Glow
        if (isSelected) {
            ctx.shadowColor = isHome ? '#FF6B6B' : '#60A5FA';
            ctx.shadowBlur = 15;
        } else {
            // Soft Shadow
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetY = 2;
        }
        
        // Gradient fill
        const grad = ctx.createLinearGradient(cx, cy - 6, cx, cy + 6);
        if (isGK) {
            grad.addColorStop(0, '#FBBF24');
            grad.addColorStop(1, '#D97706');
        } else if (isHome) {
            grad.addColorStop(0, '#FF6B6B');
            grad.addColorStop(1, '#DC2626');
        } else {
            grad.addColorStop(0, '#60A5FA');
            grad.addColorStop(1, '#2563EB');
        }

        // Player Circle
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
        
        // Thin white outline
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Reset shadow for text
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Jersey Number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.id, cx, cy + 0.5);
    };

    const drawFrame = (frameData: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        const scaleX = w / 120.0;
        const scaleY = h / 80.0;

        ctx.clearRect(0, 0, w, h);
        
        // Draw the realistic pitch
        drawPitch(ctx, w, h);

        const homePts: [number, number][] = [];
        const awayPts: [number, number][] = [];
        const homeOutfieldPts: [number, number][] = [];
        const awayOutfieldPts: [number, number][] = [];
        const allPts: [number, number][] = [];
        const allTeams: string[] = [];

        frameData.h.forEach((p: any) => {
            const cx = p.x * scaleX;
            const cy = p.y * scaleY;
            homePts.push([cx, cy]);
            allPts.push([cx, cy]);
            allTeams.push('Home');
            if (p.id !== homeGk) homeOutfieldPts.push([cx, cy]);
        });
        frameData.a.forEach((p: any) => {
            const cx = p.x * scaleX;
            const cy = p.y * scaleY;
            awayPts.push([cx, cy]);
            allPts.push([cx, cy]);
            allTeams.push('Away');
            if (p.id !== awayGk) awayOutfieldPts.push([cx, cy]);
        });

        // 1. Draw Pitch Control (Voronoi)
        if (showVoronoi && allPts.length > 0) {
            try {
                const delaunay = d3.Delaunay.from(allPts);
                const voronoi = delaunay.voronoi([0, 0, w, h]);
                
                ctx.globalAlpha = 0.25;
                for (let i = 0; i < allPts.length; i++) {
                    ctx.beginPath();
                    voronoi.renderCell(i, ctx);
                    ctx.fillStyle = allTeams[i] === 'Home' ? '#ef4444' : '#3b82f6';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
                ctx.globalAlpha = 1.0;
            } catch (e) { console.error("Voronoi error:", e); }
        }

        // 2. Draw Team Shape (Convex Hulls)
        if (showHull) {
            try {
                ctx.lineWidth = 2;
                if (homePts.length >= 3) {
                    const hullH = d3.polygonHull(homePts);
                    if (hullH) {
                        ctx.beginPath();
                        ctx.moveTo(hullH[0][0], hullH[0][1]);
                        for (let i = 1; i < hullH.length; i++) ctx.lineTo(hullH[i][0], hullH[i][1]);
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // Home fill
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // Home border
                        ctx.stroke();
                    }
                }
                if (awayPts.length >= 3) {
                    const hullA = d3.polygonHull(awayPts);
                    if (hullA) {
                        ctx.beginPath();
                        ctx.moveTo(hullA[0][0], hullA[0][1]);
                        for (let i = 1; i < hullA.length; i++) ctx.lineTo(hullA[i][0], hullA[i][1]);
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // Away fill
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Away border
                        ctx.stroke();
                    }
                }
            } catch (e) { console.error("Hull error:", e); }
        }

        // 3. Draw Centroids
        if (showCentroids) {
            const drawCentroid = (pts: [number, number][], color: string) => {
                if (pts.length === 0) return;
                const sum = pts.reduce((acc, val) => [acc[0] + val[0], acc[1] + val[1]], [0, 0]);
                const cx = sum[0] / pts.length;
                const cy = sum[1] / pts.length;
                
                ctx.beginPath();
                ctx.moveTo(cx - 15, cy);
                ctx.lineTo(cx + 15, cy);
                ctx.moveTo(cx, cy - 15);
                ctx.lineTo(cx, cy + 15);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(cx - 15, cy);
                ctx.lineTo(cx + 15, cy);
                ctx.moveTo(cx, cy - 15);
                ctx.lineTo(cx, cy + 15);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            };
            drawCentroid(homeOutfieldPts, '#ef4444');
            drawCentroid(awayOutfieldPts, '#3b82f6');
            
            // Centroid Trajectory
            const currentIdx = Math.min(currentFrameIdxRef.current, frames.length - 1);
            if (currentIdx > 0) {
                ctx.beginPath();
                for (let i = 0; i <= currentIdx; i++) {
                    const f = frames[i];
                    if (!f) continue;
                    let hSumX = 0, hSumY = 0, hCount = 0;
                    f.h.forEach((p: any) => { if (p.id !== homeGk && p.x !== undefined) { hSumX += p.x * scaleX; hSumY += p.y * scaleY; hCount++; } });
                    if (hCount > 0) {
                        const cx = hSumX / hCount;
                        const cy = hSumY / hCount;
                        if (i === 0) ctx.moveTo(cx, cy);
                        else ctx.lineTo(cx, cy);
                    }
                }
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                ctx.lineWidth = 4;
                ctx.stroke();

                ctx.beginPath();
                for (let i = 0; i <= currentIdx; i++) {
                    const f = frames[i];
                    if (!f) continue;
                    let aSumX = 0, aSumY = 0, aCount = 0;
                    f.a.forEach((p: any) => { if (p.id !== awayGk && p.x !== undefined) { aSumX += p.x * scaleX; aSumY += p.y * scaleY; aCount++; } });
                    if (aCount > 0) {
                        const cx = aSumX / aCount;
                        const cy = aSumY / aCount;
                        if (i === 0) ctx.moveTo(cx, cy);
                        else ctx.lineTo(cx, cy);
                    }
                }
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
                ctx.lineWidth = 4;
                ctx.stroke();
            }

            // HUD Overlay for Centroids
            if (homeOutfieldPts.length > 0 && awayOutfieldPts.length > 0) {
                const hSum = homeOutfieldPts.reduce((acc, val) => [acc[0] + val[0], acc[1] + val[1]], [0, 0]);
                const hcx = hSum[0] / homeOutfieldPts.length;
                const hcy = hSum[1] / homeOutfieldPts.length;
                
                const aSum = awayOutfieldPts.reduce((acc, val) => [acc[0] + val[0], acc[1] + val[1]], [0, 0]);
                const acx = aSum[0] / awayOutfieldPts.length;
                const acy = aSum[1] / awayOutfieldPts.length;
                
                const sepM = (Math.hypot(hcx - acx, hcy - acy) / scaleX).toFixed(1);
                
                const bx = frameData.b?.x !== undefined ? frameData.b.x * scaleX : undefined;
                const by = frameData.b?.y !== undefined ? frameData.b.y * scaleY : undefined;
                let hBallM = "-", aBallM = "-";
                if (bx !== undefined && by !== undefined) {
                    hBallM = (Math.hypot(hcx - bx, hcy - by) / scaleX).toFixed(1);
                    aBallM = (Math.hypot(acx - bx, acy - by) / scaleX).toFixed(1);
                }
                
                const hOffsetX = ((hcx / scaleX) - 60).toFixed(1);
                const hOffsetY = ((hcy / scaleY) - 40).toFixed(1);
                const aOffsetX = ((acx / scaleX) - 60).toFixed(1);
                const aOffsetY = ((acy / scaleY) - 40).toFixed(1);

                ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
                ctx.fillRect(w - 220, 10, 210, 130);
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 1;
                ctx.strokeRect(w - 220, 10, 210, 130);
                
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText('CENTROID ANALYSIS', w - 210, 30);
                
                ctx.font = '11px Inter, sans-serif';
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(`Separation:`, w - 210, 50);
                ctx.fillStyle = '#fff';
                ctx.fillText(`${sepM} m`, w - 100, 50);

                // Home
                ctx.fillStyle = '#ef4444';
                ctx.fillText('Home Team', w - 210, 75);
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(`To Ball: ${hBallM} m`, w - 210, 95);
                ctx.fillText(`Offset: ${hOffsetX}m, ${hOffsetY}m`, w - 210, 115);

                // Away
                ctx.fillStyle = '#3b82f6';
                ctx.fillText('Away Team', w - 100, 75);
                ctx.fillStyle = '#9ca3af';
                ctx.fillText(`To Ball: ${aBallM} m`, w - 100, 95);
                ctx.fillText(`Offset: ${aOffsetX}m, ${aOffsetY}m`, w - 100, 115);
            }
        }

        // 4. Draw Line Compactness
        if (showCompactness) {
            const drawCompactness = (pts: [number, number][], color: string) => {
                if (pts.length < 2) return;
                const xs = pts.map(p => p[0]);
                const ys = pts.map(p => p[1]);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                
                ctx.beginPath();
                ctx.rect(minX, minY, maxX - minX, maxY - minY);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.fillStyle = color;
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const widthM = ((maxY - minY) / scaleY).toFixed(1);
                const depthM = ((maxX - minX) / scaleX).toFixed(1);
                
                ctx.fillText(`W: ${widthM}m`, minX + (maxX - minX)/2, maxY + 15);
                ctx.fillText(`D: ${depthM}m`, minX - 25, minY + (maxY - minY)/2);
            };
            drawCompactness(homeOutfieldPts, '#ef4444');
            drawCompactness(awayOutfieldPts, '#3b82f6');
        }

        // Draw players
        frameData.h.forEach((p: any) => {
            const isGK = p.id === homeGk;
            const isSelected = currentPossession?.player_in_possession_id === p.id || p.id === 'selected_player_id_placeholder'; 
            drawPlayer(ctx, p, true, '#FBBF24', isGK, scaleX, scaleY, isSelected); 
        });
        frameData.a.forEach((p: any) => {
            const isGK = p.id === awayGk;
            const isSelected = currentPossession?.player_in_possession_id === p.id;
            drawPlayer(ctx, p, false, '#10b981', isGK, scaleX, scaleY, isSelected);
        });

        // 5. Draw Velocity Vectors
        if (showVelocity) {
            const drawVelocity = (p: any, color: string) => {
                if (p.vx === undefined || p.vy === undefined) return;
                const speed = Math.hypot(p.vx, p.vy);
                if (speed < 0.5) return; // Only draw if moving fast enough
                
                const cx = p.x * scaleX;
                const cy = p.y * scaleY;
                const targetX = cx + p.vx * 1.5 * scaleX; // Predict 1.5s ahead
                const targetY = cy + p.vy * 1.5 * scaleY;
                
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(targetX, targetY);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                // Arrowhead
                const angle = Math.atan2(targetY - cy, targetX - cx);
                ctx.beginPath();
                ctx.moveTo(targetX, targetY);
                ctx.lineTo(targetX - 5 * Math.cos(angle - Math.PI / 6), targetY - 5 * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(targetX - 5 * Math.cos(angle + Math.PI / 6), targetY - 5 * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
            };
            
            frameData.h.forEach((p: any) => drawVelocity(p, 'rgba(239, 68, 68, 0.8)'));
            frameData.a.forEach((p: any) => drawVelocity(p, 'rgba(59, 130, 246, 0.8)'));
        }
        
        // Draw ball (Realistic Football)
        if (frameData.b && frameData.b.x !== undefined && frameData.b.y !== undefined) {
            const bx = frameData.b.x * scaleX;
            const by = frameData.b.y * scaleY;
            const radius = 4;
            
            // Soft drop shadow (not a glow)
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            
            // Ball base (White)
            ctx.beginPath();
            ctx.arc(bx, by, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            
            // Reset shadow for details
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            
            // Ball details (Black pentagons/spots)
            ctx.fillStyle = '#111827';
            
            // Center spot
            ctx.beginPath();
            ctx.arc(bx, by, radius * 0.35, 0, 2 * Math.PI);
            ctx.fill();
            
            // 5 edge spots to simulate soccer ball pattern
            for (let i = 0; i < 5; i++) {
                const angle = (i * 2 * Math.PI) / 5;
                const spotX = bx + Math.cos(angle) * (radius * 0.75);
                const spotY = by + Math.sin(angle) * (radius * 0.75);
                ctx.beginPath();
                ctx.arc(spotX, spotY, radius * 0.25, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Thin outline
            ctx.beginPath();
            ctx.arc(bx, by, radius, 0, 2 * Math.PI);
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = '#333333';
            ctx.stroke();
        }

        // Draw Selected Action from Football IQ
        if (selectedAction && selectedAction.target && frameData.b && frameData.b.x !== undefined && frameData.b.y !== undefined) {
            const bx = frameData.b.x * scaleX;
            const by = frameData.b.y * scaleY;
            const tx = selectedAction.target[0] * scaleX;
            const ty = selectedAction.target[1] * scaleY;

            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(tx, ty);
            ctx.lineWidth = 3;
            
            // Green for safe/high prob, Yellow for medium, Red for risky
            let color = '#3b82f6'; // default blue
            if (selectedAction.risk === 'Low') color = '#10b981';
            else if (selectedAction.risk === 'Medium') color = '#fbbf24';
            else if (selectedAction.risk === 'High') color = '#ef4444';
            
            ctx.strokeStyle = color;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw arrowhead
            const angle = Math.atan2(ty - by, tx - bx);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx - 10 * Math.cos(angle - Math.PI / 6), ty - 10 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(tx - 10 * Math.cos(angle + Math.PI / 6), ty - 10 * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(tx, ty);
            ctx.fillStyle = color;
            ctx.fill();
            
            // Draw Target Circle (intended receiver/area)
            ctx.beginPath();
            ctx.arc(tx, ty, 8, 0, 2 * Math.PI);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = color + '40'; // transparent fill
            ctx.fill();
            
            // Draw xT Gain text at the target
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`+${selectedAction.xt.toFixed(3)} xT`, tx, ty - 12);
        }

        // Half Time / Paused Indicator
        if (frameData.h.length === 0 && frameData.a.length === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'bold 36px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('MATCH PAUSED / HALF TIME', w / 2, h / 2);
        }
    };

    const togglePlay = () => setIsPlaying(!isPlaying);

    const seekTo = (frameIdx: number) => {
        const safeIdx = Math.max(0, Math.min(frameIdx, frames.length - 1));
        currentFrameIdxRef.current = safeIdx;
        setUiFrameIdx(safeIdx);
        if (frames.length > 0) {
            drawFrame(frames[safeIdx]);
            if (currentPossession) {
                onFrameChange(currentPossession.start_frame + safeIdx);
            }
        }
    };
    
    const stepFrame = (delta: number) => {
        setIsPlaying(false);
        seekTo(currentFrameIdxRef.current + delta);
    };
    
    const handleSeek = (possession: any, frameInside: number) => {
        if (currentPossession && possession.id === currentPossession.id) {
            seekTo(frameInside);
        } else {
            setCurrentPossession(possession);
            if (onPossessionChange) onPossessionChange(possession);
            currentFrameIdxRef.current = frameInside;
            setUiFrameIdx(frameInside);
        }
    };

    const nextPossession = () => {
        if (!currentPossession) return;
        const idx = possessions.findIndex(p => p.id === currentPossession.id);
        if (idx >= 0 && idx < possessions.length - 1) {
            setCurrentPossession(possessions[idx + 1]);
        }
    };

    const prevPossession = () => {
        if (!currentPossession) return;
        const idx = possessions.findIndex(p => p.id === currentPossession.id);
        if (idx > 0) {
            setCurrentPossession(possessions[idx - 1]);
        }
    };

    const handleAnalyzeClick = () => {
        setIsPlaying(false); // Freeze playback
        if (currentPossession) {
            const globalFrame = currentPossession.start_frame + currentFrameIdxRef.current;
            onAnalyze(globalFrame);
        }
    };

    const globalFrame = currentPossession ? currentPossession.start_frame + uiFrameIdx : 0;

    return (
        <div className="match-player">
            <div className="player-header">
                <div className="possession-info">
                    <span className="poss-title">Possession #{currentPossession?.id || '-'}</span>
                    <span className="poss-team">Team: <span className={currentPossession?.team === 'Home' ? 'text-red' : 'text-blue'}>{currentPossession?.team}</span></span>
                </div>
                <div className="action-buttons" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="ar-toggles" style={{ display: 'flex', gap: '12px', background: 'rgba(17, 24, 39, 0.5)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 'bold', textTransform: 'uppercase', alignSelf: 'center', whiteSpace: 'nowrap' }}>AR</span>
                        <label className="ar-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={showVoronoi} onChange={e => setShowVoronoi(e.target.checked)} />
                            <span>Pitch Control</span>
                        </label>
                        <label className="ar-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={showHull} onChange={e => setShowHull(e.target.checked)} />
                            <span>Team Shape</span>
                        </label>
                        <label className="ar-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={showCentroids} onChange={e => setShowCentroids(e.target.checked)} />
                            <span>Centroids</span>
                        </label>
                        <label className="ar-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={showCompactness} onChange={e => setShowCompactness(e.target.checked)} />
                            <span>Compactness</span>
                        </label>
                        <label className="ar-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={showVelocity} onChange={e => setShowVelocity(e.target.checked)} />
                            <span>Velocity</span>
                        </label>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyzeClick}>Analyze Frame</button>
                    <button className="btn btn-secondary" onClick={() => setIsPlaying(false)}>Freeze</button>
                </div>
            </div>

            <div className="canvas-container" style={{ position: 'relative' }}>
                <canvas 
                    ref={canvasRef} 
                    width={840} 
                    height={560} 
                    className="pitch-canvas"
                />
            </div>
            <div className="player-controls-container">
                <div className="playback-controls">
                    <button onClick={prevPossession} title="Previous Possession"><SkipBack size={20} /></button>
                    <button onClick={() => stepFrame(-1)} title="Previous Frame"><Rewind size={20} /></button>
                    
                    <button className="play-btn" onClick={togglePlay}>
                        {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                    </button>
                    
                    <button onClick={() => stepFrame(1)} title="Next Frame"><FastForward size={20} /></button>
                    <button onClick={nextPossession} title="Next Possession"><SkipForward size={20} /></button>
                    
                    <select 
                        className="speed-select"
                        value={speed} 
                        onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                        <option value={0.25}>0.25x</option>
                        <option value={0.5}>0.5x</option>
                        <option value={1}>1.0x</option>
                        <option value={2}>2.0x</option>
                        <option value={4}>4.0x</option>
                    </select>
                    <div className="time-display">
                        {Number(uiFrameIdx / 10 || 0).toFixed(1)} / {currentPossession?.duration_sec} sec
                    </div>
                </div>

                <Timeline 
                    possessions={possessions} 
                    events={events}
                    currentGlobalFrame={globalFrame}
                    maxGlobalFrames={maxGlobalFrames}
                    onSeek={handleSeek}
                />
            </div>
        </div>
    );
};
