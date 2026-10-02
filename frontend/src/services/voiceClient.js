import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

let pcClient = null;

export const getVoiceClient = () => {
    if (!pcClient) {
        pcClient = new PipecatClient({
            transport: new SmallWebRTCTransport({
                iceServers: [], // Use local ICE for now, or you can add STUN/TURN if needed for remote
            }),
            enableCam: false,
            enableMic: true,
        });
    }
    return pcClient;
};

export const connectVoice = async (onConnected, onDisconnected) => {
    const client = getVoiceClient();
    
    // Register callbacks
    client.on("connected", onConnected);
    client.on("disconnected", onDisconnected);

    // The bot's development runner or small WebRTC server runs on port 7860 by default.
    // Ensure you start the bot with: python bot.py -t webrtc
    const botUrl = import.meta.env.VITE_BOT_URL || "http://localhost:7860/api/offer"; // adjust based on actual endpoint

    try {
        await client.connect({
            webrtcUrl: botUrl,
        });
    } catch (error) {
        console.error("Failed to connect to Pipecat bot:", error);
        throw error;
    }
};

export const disconnectVoice = async () => {
    if (pcClient) {
        await pcClient.disconnect();
        // The transport automatically stops mic tracks on disconnect, but we can double check
    }
};
