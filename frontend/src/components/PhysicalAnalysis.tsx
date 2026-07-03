import React, { useEffect, useState } from 'react';
import './PhysicalAnalysis.css';
import { endpoints, getHeaders } from '../api';

interface PlayerPhysicalData {
    player_id: string;
    total_distance: number;
    top_speed: number;
    sprint_distance: number;
    hsr_distance: number;
    sprint_count: number;
    accelerations: number;
    decelerations: number;
    player_load: number;
}

interface PhysicalData {
    players: PlayerPhysicalData[];
    team: string;
}

interface PhysicalAnalysisProps {
    globalFrame: number;
}

export const PhysicalAnalysis: React.FC<PhysicalAnalysisProps> = ({ globalFrame }) => {
    const [team, setTeam] = useState('Home');
    const [data, setData] = useState<PhysicalData | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchPhysicalData = async () => {
        if (globalFrame === 0) return;
        setLoading(true);
        try {
            const url = endpoints.analysisPhysical(globalFrame, team);
            const res = await fetch(url, { headers: getHeaders() });
            if (res.ok) {
                const d = await res.json();
                setData(d);
            }
        } catch (e) {
            console.error("Failed to fetch physical data", e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPhysicalData();
    }, [globalFrame, team]);

    if (!data || data.players.length === 0) {
        return (
            <div className="placeholder-content">
                Play the match for a bit, then click Analyze Frame to view accumulated physical metrics.
            </div>
        );
    }

    // Helper to calculate max value for scaling the bars
    const getMax = (field: keyof PlayerPhysicalData) => {
        return Math.max(...data.players.map(p => p[field] as number), 0.1); // avoid div by 0
    };

    const maxDist = getMax('total_distance');
    const maxSpeed = getMax('top_speed');
    const maxSprint = getMax('sprint_count');
    const maxSprintDist = getMax('sprint_distance');
    const maxHSR = getMax('hsr_distance');
    const maxAcc = getMax('accelerations');
    const maxDec = getMax('decelerations');
    const maxLoad = getMax('player_load');

    const teamClass = team === 'Home' ? 'home-team' : 'away-team';

    return (
        <div className="physical-analysis-container">
            <div className="physical-header">
                <h3>Physical Performance Data</h3>
                <div className="team-toggle">
                    <button 
                        className={`toggle-btn ${team === 'Home' ? 'active home' : ''}`}
                        onClick={() => setTeam('Home')}
                    >
                        Home Team
                    </button>
                    <button 
                        className={`toggle-btn ${team === 'Away' ? 'active away' : ''}`}
                        onClick={() => setTeam('Away')}
                    >
                        Away Team
                    </button>
                </div>
            </div>

            {loading && <div className="loading-indicator">Updating metrics...</div>}

            <div className={`physical-table-container ${loading ? 'loading' : ''}`}>
                <table className={`physical-table ${teamClass}`}>
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th>Total Dist (m)</th>
                            <th>Top Speed (km/h)</th>
                            <th>Sprints</th>
                            <th>Sprint Dist (m)</th>
                            <th>HSR Dist (m)</th>
                            <th>Accels</th>
                            <th>Decels</th>
                            <th>Load</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.players.map(p => (
                            <tr key={p.player_id}>
                                <td className="player-col">
                                    <span className="jersey-badge">{p.player_id}</span>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar blue" style={{width: `${(p.total_distance / maxDist) * 100}%`}}></div>
                                        <span>{p.total_distance.toLocaleString()}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar red" style={{width: `${(p.top_speed / maxSpeed) * 100}%`}}></div>
                                        <span>{Number(p.top_speed || 0).toFixed(1)}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar orange" style={{width: `${(p.sprint_count / maxSprint) * 100}%`}}></div>
                                        <span>{p.sprint_count}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar green" style={{width: `${(p.sprint_distance / maxSprintDist) * 100}%`}}></div>
                                        <span>{p.sprint_distance.toLocaleString()}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar green-light" style={{width: `${(p.hsr_distance / maxHSR) * 100}%`}}></div>
                                        <span>{p.hsr_distance.toLocaleString()}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar purple" style={{width: `${(p.accelerations / maxAcc) * 100}%`}}></div>
                                        <span>{p.accelerations}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar pink" style={{width: `${(p.decelerations / maxDec) * 100}%`}}></div>
                                        <span>{p.decelerations}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="graph-bar-container">
                                        <div className="graph-bar yellow" style={{width: `${(p.player_load / maxLoad) * 100}%`}}></div>
                                        <span>{Number(p.player_load || 0).toFixed(1)}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
