import { v4 as uuidv4 } from 'uuid';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001';

// Generate or retrieve unique client ID for rate limiting
let clientId = localStorage.getItem('client_id');
if (!clientId) {
    clientId = uuidv4();
    localStorage.setItem('client_id', clientId);
}

export const getHeaders = () => {
    return {
        'Content-Type': 'application/json',
        'X-Client-ID': clientId as string,
    };
};

export const endpoints = {
    matches: () => `${API_BASE}/matches`,
    loadMatch: (id: string | number) => `${API_BASE}/matches/load/${id}`,
    possessions: () => `${API_BASE}/possessions`,
    events: () => `${API_BASE}/events`,
    roster: () => `${API_BASE}/roster`,
    gks: () => `${API_BASE}/gks`,
    possessionFrames: (id: string | number) => `${API_BASE}/possessions/${id}/frames`,
    analyze: (frame: number) => `${API_BASE}/analyze/${frame}`,
    analysisSpace: (frame: number) => `${API_BASE}/analysis/space/${frame}`,
    analysisXt: (frame: number) => `${API_BASE}/analysis/xt/${frame}`,
    analysisPassing: (frame: number, team: string) => `${API_BASE}/analysis/passing/${frame}?team=${team}`,
    analysisPhysical: (frame: number, team: string) => `${API_BASE}/analysis/physical/${frame}?team=${team}`,
    analysisHeatmap: (frame: number, type: string, player: string, team: string) => 
        `${API_BASE}/analysis/heatmap/${frame}?type=${type}&player=${player}&team=${team}`,
};
