import asyncio
import os

from dotenv import load_dotenv

from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
)
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


async def bot(runner_args):
    api_key = os.getenv("DEEPGRAM_API_KEY")

    if not api_key:
        raise RuntimeError(
            "DEEPGRAM_API_KEY is missing. Check bot/.env."
        )

    transport = SmallWebRTCTransport(
        webrtc_connection=runner_args.webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=False,
        ),
    )

    stt = DeepgramSTTService(api_key=api_key)
    transcript_logger = TranscriptLogger()

    pipeline = Pipeline([
        transport.input(),
        stt,
        transcript_logger,
        transport.output(),
    ])

    task = PipelineTask(pipeline)

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
