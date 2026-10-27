# Helper: generate a short real speech mp3 for /api/transcribe tests
import asyncio, os
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.openai import OpenAITextToSpeech

load_dotenv(Path(__file__).parent.parent / ".env")


async def main():
    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    audio = await tts.generate_speech(text="I'm hungry for pizza in Austin.", model="tts-1", voice="alloy")
    Path("/tmp/hungry.mp3").write_bytes(audio)
    print("bytes", len(audio))

asyncio.run(main())
