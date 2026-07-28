"""
Embedding service for RAG.

Uses google-genai for embeddings (text-embedding-004) and
llama-index-core SentenceSplitter for chunking.
"""

import asyncio
import logging
from datetime import datetime

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.services.ai.base import get_gemini_client

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 50
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768  # Must match Vector(768) in CourseEmbedding model
EMBEDDING_BATCH_SIZE = 100
BATCH_DELAY_SECONDS = 0.5
MAX_RETRIES = 3


def chunk_text(text: str) -> list[str]:
    """Split text into chunks using LlamaIndex SentenceSplitter."""
    from llama_index.core.node_parser import SentenceSplitter

    splitter = SentenceSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_text(text)
    return chunks


async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a list of texts using Gemini.
    Runs blocking Gemini calls off the event loop via asyncio.to_thread
    and retries transient failures with exponential backoff.
    """
    client = get_gemini_client()
    all_embeddings = []

    for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[i:i + EMBEDDING_BATCH_SIZE]

        for attempt in range(MAX_RETRIES):
            try:
                result = await asyncio.to_thread(
                    client.models.embed_content,
                    model=EMBEDDING_MODEL,
                    contents=batch,
                    config={"output_dimensionality": EMBEDDING_DIMENSIONS},
                )
                for emb in result.embeddings:
                    all_embeddings.append(list(emb.values))
                break
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    logger.error("Gemini embedding failed after %d attempts: %s", MAX_RETRIES, e)
                    raise
                wait = 2 ** attempt
                logger.warning(
                    "Gemini embedding attempt %d/%d failed, retrying in %ds: %s",
                    attempt + 1, MAX_RETRIES, wait, e,
                )
                await asyncio.sleep(wait)

        if i + EMBEDDING_BATCH_SIZE < len(texts):
            await asyncio.sleep(BATCH_DELAY_SECONDS)

    return all_embeddings


async def embed_single_text(text: str) -> list[float]:
    """Generate embedding for a single text, with retry."""
    client = get_gemini_client()
    for attempt in range(MAX_RETRIES):
        try:
            result = await asyncio.to_thread(
                client.models.embed_content,
                model=EMBEDDING_MODEL,
                contents=[text],
                config={"output_dimensionality": EMBEDDING_DIMENSIONS},
            )
            return list(result.embeddings[0].values)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                logger.error("Gemini single embedding failed after %d attempts: %s", MAX_RETRIES, e)
                raise
            await asyncio.sleep(2 ** attempt)
    raise RuntimeError("unreachable")



