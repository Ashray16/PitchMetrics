import React, { useRef } from 'react';
import './SpaceAnalysis.css';

interface Point {
    [index: number]: number;
}

interface VoronoiPolygon {
    team: string;
    player: string;
    polygon: Point[];
}

interface TeamMetrics {
    width: number;
    depth: number;
    compactness: number;
}

interface SpaceData {
    voronoi: VoronoiPolygon[];
    metrics: {
        home: TeamMetrics;
        away: TeamMetrics;
    };
    error?: string;
}

interface SpaceAnalysisProps {
    data: SpaceData | null;
}

export const SpaceAnalysis: React.FC<SpaceAnalysisProps> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    if (!data) {
        return (
            <div className="placeholder-content">
                Click "Analyze Frame" to generate Space metrics for this exact moment.
            </div>
        );
    }

    if (data.error) {
        return (
            <div className="placeholder-content" style={{ color: '#ef4444' }}>
                Error computing space metrics: {data.error}
            </div>
        );
    }

    const { voronoi, metrics } = data;

    // Convert (0-120, 0-80) to SVG viewbox percentages (0-100)
    const scaleX = (x: number) => (x / 120.0) * 100;
    const scaleY = (y: number) => (y / 80.0) * 100;

    return (
        <div className="space-analysis-container">
            {/* The Pitch Viz */}
            <div className="space-pitch-container">
                <div className="pitch-background"></div>
                <svg className="voronoi-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" ref={svgRef}>
                    {voronoi.map((v, idx) => {
                        const pointsStr = v.polygon
                            .map((p) => `${scaleX(p[0])},${scaleY(p[1])}`)
                            .join(' ');
                        const fillClass = v.team === 'Home' ? 'voronoi-home' : 'voronoi-away';
                        return (
                            <polygon
                                key={idx}
                                points={pointsStr}
                                className={`voronoi-polygon ${fillClass}`}
                            >
                                <title>Player {v.player}</title>
                            </polygon>
                        );
                    })}
                </svg>
            </div>

            {/* The Metrics Panel */}
            <div className="space-metrics-panel">
                <h3>Current Shape</h3>
                
                <div className="metrics-team-header home-header">Home Team</div>
                <div className="metrics-grid">
                    <div className="metric-box">
                        <span className="metric-label">Width</span>
                        <span className="metric-value">{metrics.home?.width || 0} m</span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">Depth</span>
                        <span className="metric-value">{metrics.home?.depth || 0} m</span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">Compactness</span>
                        <span className="metric-value">{metrics.home?.compactness || 0} m²</span>
                    </div>
                </div>

                <div className="metrics-team-header away-header" style={{ marginTop: '1.5rem' }}>Away Team</div>
                <div className="metrics-grid">
                    <div className="metric-box">
                        <span className="metric-label">Width</span>
                        <span className="metric-value">{metrics.away?.width || 0} m</span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">Depth</span>
                        <span className="metric-value">{metrics.away?.depth || 0} m</span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">Compactness</span>
                        <span className="metric-value">{metrics.away?.compactness || 0} m²</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
