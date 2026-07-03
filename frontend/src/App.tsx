import React, { useState, useEffect } from 'react';
import { MatchPlayer } from './components/MatchPlayer';
import { ActionRankings } from './components/ActionRankings';
import { TacticalDeepDive } from './components/TacticalDeepDive';
import { StatisticsRibbon } from './components/StatisticsRibbon';
import { SpaceAnalysis } from './components/SpaceAnalysis';
import { XTAnalysis } from './components/XTAnalysis';
import { HeatmapAnalysis } from './components/HeatmapAnalysis';
import { PhysicalAnalysis } from './components/PhysicalAnalysis';
import { PassingAnalysis } from './components/PassingAnalysis';
import { GraphsAnalysis } from './components/GraphsAnalysis';
import { XGAnalysis } from './components/XGAnalysis';
import { PossessionAnalysis } from './components/PossessionAnalysis';
import { DefensiveAnalysis } from './components/DefensiveAnalysis';
import { DynamicsAnalysis } from './components/DynamicsAnalysis';
import './App.css';
import { endpoints, getHeaders } from './api';

import { Header } from './components/Header';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, errorMsg: string}> {
    constructor(props: any) { super(props); this.state = { hasError: false, errorMsg: '' }; }
    static getDerivedStateFromError(error: any) { return { hasError: true, errorMsg: error?.message || error?.toString() || 'Unknown Error' }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="empty-state" style={{color: '#ef4444', padding: '2rem', textAlign: 'center', backgroundColor: '#0f172a', height: '100vh', width: '100vw'}}>
                    <h3>App Crashed</h3>
                    <p>{this.state.errorMsg}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentPossession, setCurrentPossession] = useState<any>(null);
    const [analyticsData, setAnalyticsData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    
    // Match Selection State
    const [matches, setMatches] = useState<any[]>([]);
    const [currentMatchId, setCurrentMatchId] = useState<string>("1886347");
    const [isSwitchingMatch, setIsSwitchingMatch] = useState<boolean>(false);

    const [spaceData, setSpaceData] = useState<any>(null);
    const [xtData, setXtData] = useState<any>(null);
    const [globalFrame, setGlobalFrame] = useState(0);
    const [activeTab, setActiveTab] = useState('pitch_control');
    const [selectedAction, setSelectedAction] = useState<any>(null);

    useEffect(() => {
        // Fetch available matches
        fetch(endpoints.matches(), { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.matches) setMatches(data.matches);
            })
            .catch(err => console.error(err));
    }, []);

    const handleMatchChange = async (matchId: string) => {
        setIsSwitchingMatch(true);
        setCurrentMatchId(matchId);
        try {
            await fetch(endpoints.loadMatch(matchId), { method: 'POST', headers: getHeaders() });
            // Reset state
            setGlobalFrame(0);
            setCurrentPossession(null);
            setAnalyticsData(null);
            setSelectedAction(null);
        } catch (e) {
            console.error("Failed to load match", e);
        }
        setIsSwitchingMatch(false);
    };

    const handlePossessionChange = (possession: any) => {
        if (currentPossession && possession && currentPossession.id !== possession.id) {
            // When moving to a new possession, clear the old tactical insights
            setAnalyticsData(null);
            setSelectedAction(null);
            setSpaceData(null);
            setXtData(null);
        }
        setCurrentPossession(possession);
    };

    const handleAnalyze = async (frame: number) => {
        setLoading(true);
        setErrorMsg(null);
        setSelectedAction(null);
        try {
            const [analysisRes, spaceRes, xtRes] = await Promise.all([
                fetch(endpoints.analyze(frame), { headers: getHeaders() }),
                fetch(endpoints.analysisSpace(frame), { headers: getHeaders() }),
                fetch(endpoints.analysisXt(frame), { headers: getHeaders() })
            ]);
            
            if (!analysisRes.ok) {
                throw new Error(`HTTP error! status: ${analysisRes.status}`);
            }
            
            const data = await analysisRes.json();
            setAnalyticsData(data);
            
            if (spaceRes.ok) {
                const sData = await spaceRes.json();
                setSpaceData(sData);
            }
            if (xtRes.ok) {
                const xData = await xtRes.json();
                setXtData(xData);
            }
        } catch (error) {
            console.error("Failed to fetch analytics", error);
            setErrorMsg("Analysis unavailable for this frame.");
        }
        setLoading(false);
    };

    const currentMatch = matches.find((m: any) => m.match_id === currentMatchId);

    return (
        <ErrorBoundary>
        <div className="app-container">
            {isSwitchingMatch && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', flexDirection: 'column' }}>
                    <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 2s linear infinite', marginBottom: '20px' }} />
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <h2>Loading Match Data...</h2>
                    <p style={{ color: '#aaa', fontSize: '16px' }}>Processing possessions, physical stats, and analytics...</p>
                </div>
            )}
            <Header 
                globalFrame={globalFrame}
                homeFormation={analyticsData?.home_formation?.shape}
                awayFormation={analyticsData?.away_formation?.shape}
                matches={matches}
                currentMatchId={currentMatchId}
                onMatchChange={handleMatchChange}
            />
            
            <StatisticsRibbon 
                isPlaying={isPlaying}
                isAnalyzing={!!analyticsData && !isPlaying}
                currentPossession={currentPossession}
                analyticsData={analyticsData}
            />
            
            <main className="dashboard">
                <div className="middle-section">
                    <div className="video-section">
                        {!isSwitchingMatch && (
                            <MatchPlayer 
                                key={currentMatchId}
                                onAnalyze={handleAnalyze} 
                                onFrameChange={setGlobalFrame}
                                onPlayStateChange={setIsPlaying}
                                onPossessionChange={handlePossessionChange}
                                selectedAction={selectedAction}
                            />
                        )}
                    </div>

                    <div className="analysis-section">
                        {errorMsg && !loading && (
                            <div className="empty-state" style={{color: '#ef4444'}}>
                                {errorMsg}
                            </div>
                        )}
                        
                        {!analyticsData && !loading && !errorMsg && (
                            <div className="empty-state">
                                Pause the video and click Analyze Frame to generate tactical insights.
                            </div>
                        )}
                        
                        {loading && (
                            <div className="loading-state">
                                Analyzing tactical context...
                            </div>
                        )}
                        
                        {analyticsData && !loading && !errorMsg && (
                            <ErrorBoundary>
                                <div className="analysis-top">
                                    {/* Tactical Context removed as per user request */}
                                    <div className="iq-engine-container">
                                        <ActionRankings 
                                            actions={analyticsData?.top_actions || []} 
                                            selectedAction={selectedAction}
                                            onActionSelect={setSelectedAction}
                                        />
                                    </div>
                                </div>
                            </ErrorBoundary>
                        )}
                    </div>
                </div>
                
                <div className="bottom-section">
                    <div className="tabbed-analysis-container">
                        <div className="tabs-header">
                            <button className={activeTab === 'pitch_control' ? 'active' : ''} onClick={() => setActiveTab('pitch_control')}>Pitch Control</button>
                            <button className={activeTab === 'space' ? 'active' : ''} onClick={() => setActiveTab('space')}>Space</button>
                            <button className={activeTab === 'passing' ? 'active' : ''} onClick={() => setActiveTab('passing')}>Passing</button>
                            <button className={activeTab === 'xt' ? 'active' : ''} onClick={() => setActiveTab('xt')}>xT</button>
                            <button className={activeTab === 'heatmap' ? 'active' : ''} onClick={() => setActiveTab('heatmap')}>Heatmap</button>
                            <button className={activeTab === 'physical' ? 'active' : ''} onClick={() => setActiveTab('physical')}>Physical</button>
                            <button className={activeTab === 'graphs' ? 'active' : ''} onClick={() => setActiveTab('graphs')}>Graphs</button>
                            
                            <button className={activeTab === 'xg' ? 'active' : ''} onClick={() => setActiveTab('xg')}>Expected Goals</button>
                            <button className={activeTab === 'possession' ? 'active' : ''} onClick={() => setActiveTab('possession')}>Possession</button>
                            <button className={activeTab === 'defensive' ? 'active' : ''} onClick={() => setActiveTab('defensive')}>Defensive</button>
                            <button className={activeTab === 'dynamics' ? 'active' : ''} onClick={() => setActiveTab('dynamics')}>Dynamics</button>
                        </div>
                        <div className={`tab-content ${activeTab}-tab`}>
                            {activeTab === 'pitch_control' && analyticsData?.pitch_control_grid && (
                                <TacticalDeepDive 
                                    pitchControlGrid={analyticsData.pitch_control_grid} 
                                    homeTeam={currentMatch?.home_team_name}
                                    awayTeam={currentMatch?.away_team_name}
                                />
                            )}
                            {activeTab === 'xg' && (
                                <XGAnalysis />
                            )}
                            {activeTab === 'possession' && (
                                <PossessionAnalysis />
                            )}
                            {activeTab === 'defensive' && (
                                <DefensiveAnalysis />
                            )}
                            {activeTab === 'dynamics' && (
                                <DynamicsAnalysis />
                            )}
                            {activeTab === 'space' && (
                                <SpaceAnalysis data={spaceData} />
                            )}
                            {activeTab === 'passing' && (
                                <PassingAnalysis globalFrame={globalFrame} />
                            )}
                            {activeTab === 'xt' && (
                                <XTAnalysis data={xtData} />
                            )}
                            {activeTab === 'heatmap' && (
                                <HeatmapAnalysis globalFrame={globalFrame} />
                            )}
                            {activeTab === 'physical' && (
                                <PhysicalAnalysis globalFrame={globalFrame} />
                            )}
                            {activeTab === 'graphs' && (
                                <GraphsAnalysis globalFrame={globalFrame} />
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
        </ErrorBoundary>
    );
}

export default App;
