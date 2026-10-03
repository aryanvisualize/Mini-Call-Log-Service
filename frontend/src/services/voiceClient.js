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

export const connectVoice = async (
  onConnected,
  onDisconnected,
  onTranscript,
  onServerMessage,
) => {
  const client = getVoiceClient();
  client.on("connected", onConnected);
  client.on("disconnected", onDisconnected);
  if (onTranscript) {
    client.on("userTranscript", (data) => {
      console.log("[RTVI] userTranscript event:", data);
      onTranscript(data);
    });
  }
  if (onServerMessage) {
    client.on("serverMessage", (data) => {
      console.log("[RTVI] serverMessage event:", data);
      onServerMessage(data);
    });
  }
  const botUrl =
    import.meta.env.VITE_BOT_URL || "http://localhost:7860/api/offer";
  try {
    await client.connect({ webrtcUrl: botUrl });
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
