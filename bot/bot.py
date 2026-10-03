import asyncio
import os
import time

from dotenv import load_dotenv
from google import genai

from pipecat.frames.frames import (
    Frame,
    TextFrame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
)
from pipecat.services.google.tts import GeminiTTSService
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.base_task import PipelineTaskParams
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.run import main
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport


load_dotenv()


class TranscriptLogger(FrameProcessor):
    async def process_frame(
        self, frame: Frame, direction: FrameDirection
    ):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            print(f"\nTranscript: {frame.text}", flush=True)
        elif isinstance(frame, InterimTranscriptionFrame):
            print(f"\rListening: {frame.text}", end="", flush=True)

        await self.push_frame(frame, direction)


class GeminiResponder(FrameProcessor):
    def __init__(self, api_key: str):
        super().__init__()
        self.client = genai.Client(api_key=api_key)
        self.history = []
        self.rtvi = None

    async def process_frame(
        self, frame: Frame, direction: FrameDirection
    ):
        await super().process_frame(frame, direction)
        print(
            f"[Gemini Debug] Frame type: {type(frame).__name__}",
            flush=True,
        )
        if isinstance(frame, TranscriptionFrame):
            print(
                f"[Gemini Debug] Received transcription frame: "
                f"direction={direction}, text={frame.text!r}",
                flush=True,
            )

        if (
            isinstance(frame, TranscriptionFrame)
            and frame.text.strip()
        ):
            print("[Gemini Debug] Triggering Gemini request...", flush=True)
            user_text = frame.text.strip()

            try:
                conversation = self.history + [
                    {"role": "user", "text": user_text}
                ]

                prompt = (
                    "You are a helpful voice-call assistant. "
                    "Give clear, concise responses suitable for a "
                    "spoken conversation.\n\n"
                    "Conversation:\n"
                    + "\n".join(
                        f"{item['role'].capitalize()}: {item['text']}"
                        for item in conversation
                    )
                    + "\nAssistant:"
                )

                start_time = time.perf_counter()

                response = await self.client.aio.models.generate_content(
                    model=os.getenv(
                        "GEMINI_MODEL", "gemini-3.8-flash"
                    ),
                    contents=prompt,
                )

                latency_ms = round(
                    (time.perf_counter() - start_time) * 1000
                )

                reply = (response.text or "").strip()

                if reply:
                    self.history.extend([
                        {"role": "user", "text": user_text},
                        {"role": "assistant", "text": reply},
                    ])

                    print(
                        f"\nGemini ({latency_ms} ms): {reply}",
                        flush=True,
                    )

                    if self.rtvi:
                        await self.rtvi.send_server_message({
                            "type": "llm_response",
                            "text": reply,
                            "latency_ms": latency_ms,
                        })
                    # Send Gemini's reply downstream to TTS
                    await self.push_frame(
                        TextFrame(reply),
                        FrameDirection.DOWNSTREAM,
                    )

            except Exception as error:
                print(
                    f"\nGemini response error: {error}",
                    flush=True,
                )

        await self.push_frame(frame, direction)


async def bot(runner_args):
    deepgram_key = os.getenv("DEEPGRAM_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if not deepgram_key:
        raise RuntimeError(
            "DEEPGRAM_API_KEY is missing. Check bot/.env."
        )

    if not gemini_key:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. Check bot/.env."
        )

    transport = SmallWebRTCTransport(
        webrtc_connection=runner_args.webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )

    stt = DeepgramSTTService(api_key=deepgram_key)
    transcript_logger = TranscriptLogger()
    gemini_responder = GeminiResponder(api_key=gemini_key)

    tts = GeminiTTSService(
        api_key=gemini_key,
        model="gemini-3.8-flash-tts",
        voice_id="Kore",
        use_genai=True,
    )

    pipeline = Pipeline([
        transport.input(),
        stt,
        transcript_logger,
        gemini_responder,
        tts,
        transport.output(),
    ])

    task = PipelineTask(pipeline)
    gemini_responder.rtvi = task.rtvi

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        print("Client connected", flush=True)

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        print("Client disconnected", flush=True)
        await task.cancel()

    await task.run(
        PipelineTaskParams(loop=asyncio.get_running_loop())
    )


if __name__ == "__main__":
    main()