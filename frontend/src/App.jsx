import { useState, useEffect } from "react";
import "./App.css";

function App() {
    const [calls, setCalls] = useState([]);
    const [loadingCalls, setLoadingCalls] = useState(false);
    const [callsError, setCallsError] = useState(null);

    const [selectedCallId, setSelectedCallId] = useState(null);
    const [callDetails, setCallDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

    const fetchCalls = async () => {
        setLoadingCalls(true);
        setCallsError(null);
        try {
            const response = await fetch(`${API_URL}/calls`);
            if (!response.ok) {
                throw new Error(`Failed to fetch calls: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            setCalls(data);
        } catch (err) {
            setCallsError(err.message);
        } finally {
            setLoadingCalls(false);
        }
    };

    const fetchCallDetails = async (id) => {
        setLoadingDetails(true);
        setDetailsError(null);
        setCallDetails(null);
        try {
            const response = await fetch(`${API_URL}/calls/${encodeURIComponent(id)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch call details: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            setCallDetails(data);
        } catch (err) {
            setDetailsError(err.message);
        } finally {
            setLoadingDetails(false);
        }
    };

    useEffect(() => {
        fetchCalls();
    }, []);

    const handleSelectCall = (id) => {
        if (selectedCallId === id) return;
        setSelectedCallId(id);
        fetchCallDetails(id);
    };

    const [callStatus, setCallStatus] = useState("idle"); // idle, connecting, connected, ending, error
    const [callStartTime, setCallStartTime] = useState(null);
    const [activeCallId, setActiveCallId] = useState(null);
    const [callError, setCallError] = useState(null);
    const [mediaStream, setMediaStream] = useState(null);
    const [liveTranscript, setLiveTranscript] = useState([]);

    const handleStartCall = async () => {
        if (callStatus !== "idle" && callStatus !== "error") return;
        setCallStatus("connecting");
        setCallError(null);
        setLiveTranscript([]);

        try {
            // 1. Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setMediaStream(stream);

            // 2. Pipecat Bot Integration
            const { connectVoice } = await import("./services/voiceClient.js");
            
            await connectVoice(
                () => {
                    console.log("WebRTC Connected!");
                    setActiveCallId(`call_web_${Date.now()}`);
                    setCallStartTime(new Date());
                    setCallStatus("connected");
                },
                () => {
                    console.log("WebRTC Disconnected!");
                    // Handle unexpected disconnect if it happens while connected
                    if (callStatus === "connected") {
                        handleEndCall();
                    }
                },
                
                (transcript) => {
                    if (transcript.final && transcript.text?.trim()) {
                        const entry = {
                            speaker: "user",
                            text: transcript.text.trim()
                        };

                        console.log("Final transcript:", entry.text);

                        setLiveTranscript((previous) => [...previous, entry]);
                    }
                }
            );

        } catch (err) {
            console.error("Call failed to start:", err);
            setCallError("Could not access microphone or connect to bot.");
            setCallStatus("error");
            
            // Clean up if we got the mic but failed to connect
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                setMediaStream(null);
            }
        }
    };

    const handleEndCall = async () => {
        if (callStatus !== "connected") return;
        setCallStatus("ending");

        const endedAt = new Date();
        const duration = Math.max(0, Math.round((endedAt - callStartTime) / 1000));

        // Clean up media stream
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            setMediaStream(null);
        }

        try {
            // Disconnect WebRTC Pipecat Client
            const { disconnectVoice } = await import("./services/voiceClient.js");
            await disconnectVoice();
            
            // Prepare call record. Transcript and metrics are empty since the bot is not fully implemented.
            const callRecord = {
                id: activeCallId,
                startedAt: callStartTime.toISOString(),
                endedAt: endedAt.toISOString(),
                duration: duration,
                transcript: liveTranscript,
                metrics: {}
            };

            const response = await fetch(`${API_URL}/calls`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(callRecord)
            });

            if (!response.ok) {
                console.error("Failed to log call:", await response.text());
            } else {
                fetchCalls(); // Refresh history
            }
        } catch (err) {
            console.error("Error ending call:", err);
        } finally {
            setCallStatus("idle");
            setActiveCallId(null);
            setCallStartTime(null);
        }
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Mini Call Log</h1>
                <p>View and analyze saved AI voice calls.</p>
            </header>

            <section className="live-call-section">
                <div className="live-call-controls">
                    <h2>Live Voice Call</h2>
                    <div className="call-actions">
                        <button 
                            className={`btn-start ${callStatus === 'idle' || callStatus === 'error' ? '' : 'disabled'}`}
                            onClick={handleStartCall}
                            disabled={callStatus !== 'idle' && callStatus !== 'error'}
                        >
                            Start Call
                        </button>
                        <button 
                            className={`btn-end ${callStatus === 'connected' ? '' : 'disabled'}`}
                            onClick={handleEndCall}
                            disabled={callStatus !== 'connected'}
                        >
                            End Call
                        </button>
                    </div>
                    
                    <div className="call-status-indicator">
                        <span className={`status-badge ${callStatus}`}>
                            Status: {callStatus.toUpperCase()}
                        </span>
                        {callError && <p className="error-hint">{callError}</p>}
                    </div>
                </div>
            </section>

            <div className="dashboard-content">
                <section className="call-history-section">
                    <div className="section-header">
                        <h2>Call History</h2>
                        <button onClick={fetchCalls} className="refresh-btn">
                            Refresh Calls
                        </button>
                    </div>

                    {loadingCalls && <p className="loading">Loading calls...</p>}
                    {callsError && (
                        <div className="error">
                            <p><strong>Error fetching calls:</strong> {callsError}</p>
                            <p className="error-hint">
                                (Note: If this is a Network Error, it may be due to a CORS issue. The Cloudflare Worker needs to return `Access-Control-Allow-Origin: *` headers.)
                            </p>
                        </div>
                    )}

                    {!loadingCalls && !callsError && calls.length === 0 && (
                        <p className="empty-state">No calls found.</p>
                    )}

                    <ul className="call-list">
                        {calls.map((call) => (
                            <li
                                key={call.id}
                                className={`call-item ${selectedCallId === call.id ? "selected" : ""}`}
                                onClick={() => handleSelectCall(call.id)}
                            >
                                <div className="call-item-header">
                                    <span className="call-id">{call.id}</span>
                                    <span className="call-duration">{call.duration}s</span>
                                </div>
                                <div className="call-item-date">
                                    {new Date(call.started_at).toLocaleString()}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="call-details-section">
                    <h2>Call Details</h2>
                    {!selectedCallId && !loadingDetails && (
                        <div className="empty-details">
                            <p>Select a call from the history to view its details.</p>
                        </div>
                    )}

                    {loadingDetails && <p className="loading">Loading details...</p>}
                    {detailsError && <p className="error">{detailsError}</p>}

                    {callDetails && (
                        <div className="call-details-content">
                            <div className="details-header">
                                <h3>{callDetails.id}</h3>
                                <div className="details-meta">
                                    <p><strong>Started:</strong> {new Date(callDetails.started_at).toLocaleString()}</p>
                                    <p><strong>Ended:</strong> {new Date(callDetails.ended_at).toLocaleString()}</p>
                                    <p><strong>Duration:</strong> {callDetails.duration}s</p>
                                </div>
                            </div>

                            {callDetails.metrics && (
                                <div className="metrics-box">
                                    <h4>Latency Metrics</h4>
                                    <div className="metrics-grid">
                                        <div className="metric">
                                            <span className="metric-label">STT:</span>
                                            <span className="metric-value">{callDetails.metrics.stt ?? "N/A"}ms</span>
                                        </div>
                                        <div className="metric">
                                            <span className="metric-label">LLM:</span>
                                            <span className="metric-value">{callDetails.metrics.llm ?? "N/A"}ms</span>
                                        </div>
                                        <div className="metric">
                                            <span className="metric-label">TTS:</span>
                                            <span className="metric-value">{callDetails.metrics.tts ?? "N/A"}ms</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="transcript-box">
                                <h4>Transcript</h4>
                                {(!callDetails.transcript || callDetails.transcript.length === 0) ? (
                                    <p className="empty-state">No transcript available.</p>
                                ) : (
                                    <div className="transcript-messages">
                                        {callDetails.transcript.map((msg, index) => (
                                            <div key={index} className={`message ${msg.speaker}`}>
                                                <div className="message-speaker">{msg.speaker === "user" ? "User" : "Bot"}</div>
                                                <div className="message-text">{msg.text}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

export default App;
