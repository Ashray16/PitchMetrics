import React, { useRef } from 'react';
import './Timeline.css';

interface Possession {
    id: number;
    team: string;
    start_frame: number;
    end_frame: number;
    duration_sec: number;
}

interface MatchEvent {
    player: string;
    team: string;
    type: 'goal' | 'yellow_card' | 'red_card';
    frame: number;
}

interface TimelineProps {
    possessions: Possession[];
    events?: MatchEvent[];
    currentGlobalFrame: number;
    maxGlobalFrames: number; // usually 135000 for 90 mins, but we might have 20000
    onSeek: (possession: Possession, frameInside: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ possessions, events = [], currentGlobalFrame, maxGlobalFrames, onSeek }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    
    const FPS = 10;
    // Scale timeline to the actual duration based on maxGlobalFrames
    const FULL_MATCH_FRAMES = maxGlobalFrames > 0 ? maxGlobalFrames : (90 * 60 * FPS);
    const totalMatchSecs = FULL_MATCH_FRAMES / FPS;

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!trackRef.current || possessions.length === 0) return;
        
        const rect = trackRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        const targetGlobalFrame = Math.floor(percentage * FULL_MATCH_FRAMES);
        
        // Find which possession this frame belongs to
        // If it's between possessions, find the nearest one.
        let targetPoss = possessions[0];
        let minDiff = Infinity;
        
        for (const p of possessions) {
            if (targetGlobalFrame >= p.start_frame && targetGlobalFrame <= p.end_frame) {
                targetPoss = p;
                break;
            }
            // Check distance
            const diff = Math.min(Math.abs(targetGlobalFrame - p.start_frame), Math.abs(targetGlobalFrame - p.end_frame));
            if (diff < minDiff) {
                minDiff = diff;
                targetPoss = p;
            }
        }
        
        // Frame inside that possession
        const maxFrameInside = targetPoss.end_frame - targetPoss.start_frame;
        const frameInside = Math.max(0, Math.min(targetGlobalFrame - targetPoss.start_frame, maxFrameInside));
        onSeek(targetPoss, frameInside);
    };

    return (
        <div className="global-timeline-container">
            <div 
                className="timeline-track" 
                ref={trackRef}
                onClick={handleTrackClick}
            >
                {/* Background is grey (Loose Ball) */}
                
                {/* Render Possession Segments */}
                {possessions.map((p, idx) => {
                    const leftPct = (p.start_frame / FULL_MATCH_FRAMES) * 100;
                    const widthPct = ((p.end_frame - p.start_frame) / FULL_MATCH_FRAMES) * 100;
                    let bgColor = 'var(--color-loose)'; // Grey
                    if (p.team === 'Home') bgColor = 'var(--color-home)'; // Red
                    if (p.team === 'Away') bgColor = 'var(--color-away)'; // Blue
                    
                    return (
                        <div 
                            key={idx}
                            className="possession-segment tooltip-trigger"
                            style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: bgColor
                            }}
                            title={`Possession #${p.id}\nTeam: ${p.team}\nDuration: ${p.duration_sec}s`}
                        ></div>
                    );
                })}
                
                {/* Render Events */}
                {events.map((ev, idx) => {
                    const leftPct = (ev.frame / FULL_MATCH_FRAMES) * 100;
                    let icon = '';
                    let color = '';
                    let size = '14px';
                    if (ev.type === 'goal') {
                        icon = '⚽';
                        color = 'transparent';
                    } else if (ev.type === 'yellow_card') {
                        icon = '';
                        color = '#fbbf24'; // yellow
                        size = '10px';
                    } else if (ev.type === 'red_card') {
                        icon = '';
                        color = '#ef4444'; // red
                        size = '10px';
                    }
                    
                    return (
                        <div 
                            key={`ev-${idx}`}
                            className="timeline-event-marker tooltip-trigger"
                            style={{
                                left: `${leftPct}%`,
                                backgroundColor: color,
                                width: ev.type === 'goal' ? 'auto' : '8px',
                                height: ev.type === 'goal' ? 'auto' : '12px',
                                borderRadius: ev.type === 'goal' ? '0' : '2px',
                                transform: 'translate(-50%, -50%)',
                                top: '50%',
                                position: 'absolute',
                                fontSize: size,
                                zIndex: 10,
                                cursor: 'pointer',
                                boxShadow: ev.type !== 'goal' ? '0 0 2px rgba(0,0,0,0.5)' : 'none'
                            }}
                            title={`${ev.type === 'goal' ? 'Goal' : ev.type === 'yellow_card' ? 'Yellow Card' : 'Red Card'}: ${ev.player} (${ev.team})`}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Seek to the event frame
                                let targetPoss = possessions[0];
                                let minDiff = Infinity;
                                for (const p of possessions) {
                                    if (ev.frame >= p.start_frame && ev.frame <= p.end_frame) {
                                        targetPoss = p;
                                        break;
                                    }
                                    const diff = Math.min(Math.abs(ev.frame - p.start_frame), Math.abs(ev.frame - p.end_frame));
                                    if (diff < minDiff) {
                                        minDiff = diff;
                                        targetPoss = p;
                                    }
                                }
                                if (targetPoss) {
                                    const maxFrameInside = targetPoss.end_frame - targetPoss.start_frame;
                                    const frameInside = Math.max(0, Math.min(ev.frame - targetPoss.start_frame, maxFrameInside));
                                    onSeek(targetPoss, frameInside);
                                }
                            }}
                        >
                            {icon}
                        </div>
                    );
                })}
                
                {/* Current Playhead Scrubber */}
                <div 
                    className="timeline-scrubber"
                    style={{ left: `${(currentGlobalFrame / FULL_MATCH_FRAMES) * 100}%` }}
                >
                    <div className="scrubber-head"></div>
                    <div className="scrubber-time">{formatTime(currentGlobalFrame / FPS)}</div>
                </div>
            </div>
            
            <div className="timeline-labels" style={{ position: 'relative' }}>
                <span>00:00</span>
                <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', color: '#9ca3af' }}>HT</span>
                <span>{formatTime(totalMatchSecs)}</span>
            </div>
            
            <div className="timeline-legend">
                <div className="legend-item">
                    <span className="color-box home"></span> Home Possession
                </div>
                <div className="legend-item">
                    <span className="color-box away"></span> Away Possession
                </div>
                <div className="legend-item">
                    <span className="color-box none"></span> Loose Ball / Stop
                </div>
            </div>
        </div>
    );
};
export default Timeline;
