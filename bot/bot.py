import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.runner.run import main

async def bot(runner_args):
    transport = runner_args.transport
    
    # Minimal pipeline that simply takes input and outputs it (echo)
    # This prevents needing external API keys for STT/LLM/TTS while validating the WebRTC connection.
    pipeline = Pipeline([
        transport.input(),
        transport.output(),
    ])
    
    task = PipelineTask(pipeline)
    
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        print(f"Client connected: {client}")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        print(f"Client disconnected: {client}")
        # Stop the task when the client disconnects so the runner can cleanly exit
        await task.cancel()

    await task.run()


if __name__ == "__main__":
    # Run the Pipecat WebRTC signaling server
    # Usage: python bot.py -t webrtc
    main()
