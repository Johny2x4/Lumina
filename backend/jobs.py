import asyncio
import json
import time
from typing import Dict, List, Optional
import httpx


class PullJob:
    """Represents an ongoing or completed model pull job running independently on the server."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self.status = "initiating"
        self.completed = 0
        self.total = 0
        self.percent = 0
        self.done = False
        self.error: Optional[str] = None
        self.started_at = time.time()
        self.completed_at: Optional[float] = None
        self.task: Optional[asyncio.Task] = None
        self._listeners: List[asyncio.Queue] = []

    def to_dict(self) -> dict:
        return {
            "model": self.model_name,
            "status": self.status,
            "completed": self.completed,
            "total": self.total,
            "percent": self.percent,
            "done": self.done,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }

    def add_listener(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._listeners.append(q)
        return q

    def remove_listener(self, q: asyncio.Queue):
        if q in self._listeners:
            self._listeners.remove(q)

    async def broadcast(self, data: dict):
        raw = json.dumps(data)
        for q in list(self._listeners):
            try:
                q.put_nowait(raw)
            except Exception:
                pass


class PullJobManager:
    """Manages server-side model pulls that survive client disconnects."""

    def __init__(self):
        self._jobs: Dict[str, PullJob] = {}

    def get_job(self, model_name: str) -> Optional[PullJob]:
        return self._jobs.get(model_name)

    def get_active_jobs(self) -> List[dict]:
        self._cleanup_old_jobs()
        return [j.to_dict() for j in self._jobs.values()]

    def start_pull(self, model_name: str, ollama_base_url: str, client: httpx.AsyncClient) -> PullJob:
        existing = self._jobs.get(model_name)
        if existing and not existing.done:
            return existing

        job = PullJob(model_name)
        self._jobs[model_name] = job
        job.task = asyncio.create_task(self._run_pull(job, ollama_base_url, client))
        return job

    def cancel_pull(self, model_name: str) -> bool:
        job = self._jobs.get(model_name)
        if job and not job.done and job.task:
            job.task.cancel()
            return True
        return False

    async def _run_pull(self, job: PullJob, ollama_base_url: str, client: httpx.AsyncClient):
        try:
            url = f"{ollama_base_url}/api/pull"
            async with client.stream(
                "POST",
                url,
                json={"name": job.model_name, "stream": True},
                timeout=httpx.Timeout(connect=15.0, read=None, write=30.0, pool=30.0),
            ) as resp:
                if resp.status_code != 200:
                    err_bytes = await resp.aread()
                    job.error = f"Ollama error ({resp.status_code}): {err_bytes.decode('utf-8', errors='ignore')}"
                    job.done = True
                    job.status = "failed"
                    job.completed_at = time.time()
                    await job.broadcast(job.to_dict())
                    return

                job.status = "downloading"
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        status = data.get("status", "")
                        if status:
                            job.status = status
                        if "completed" in data and "total" in data and data["total"] > 0:
                            job.completed = data["completed"]
                            job.total = data["total"]
                            job.percent = round((job.completed / job.total) * 100)
                        elif status.lower() == "success":
                            job.percent = 100

                        await job.broadcast(job.to_dict())
                    except Exception:
                        pass

            job.done = True
            job.status = "success"
            job.percent = 100
            job.completed_at = time.time()
            await job.broadcast(job.to_dict())
        except asyncio.CancelledError:
            job.done = True
            job.status = "cancelled"
            job.completed_at = time.time()
            await job.broadcast(job.to_dict())
        except Exception as e:
            job.done = True
            job.error = str(e)
            job.status = "failed"
            job.completed_at = time.time()
            await job.broadcast(job.to_dict())

    def _cleanup_old_jobs(self):
        """Purge jobs completed more than 30 minutes ago."""
        now = time.time()
        expired = [
            name for name, j in self._jobs.items()
            if j.done and j.completed_at and (now - j.completed_at > 1800)
        ]
        for name in expired:
            del self._jobs[name]


class ChatJob:
    """Represents a background LLM inference stream that generates to completion even if client disconnects."""

    def __init__(self, session_id: str, model: str, sources: list = None):
        self.session_id = session_id
        self.model = model
        self.sources = sources or []
        self.accumulated_text = ""
        self.chunks: List[dict] = []
        self.final_metadata: Optional[dict] = None
        self.done = False
        self.error: Optional[str] = None
        self.started_at = time.time()
        self.completed_at: Optional[float] = None
        self.task: Optional[asyncio.Task] = None
        self._listeners: List[asyncio.Queue] = []

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "model": self.model,
            "accumulated_text": self.accumulated_text,
            "sources": self.sources,
            "final_metadata": self.final_metadata,
            "done": self.done,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }

    def add_listener(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._listeners.append(q)
        return q

    def remove_listener(self, q: asyncio.Queue):
        if q in self._listeners:
            self._listeners.remove(q)

    async def broadcast(self, data: dict):
        raw = json.dumps(data)
        for q in list(self._listeners):
            try:
                q.put_nowait(raw)
            except Exception:
                pass


class ChatJobManager:
    """Manages resilient background chat generations decoupled from client sockets."""

    def __init__(self):
        self._jobs: Dict[str, ChatJob] = {}

    def get_job(self, session_id: str) -> Optional[ChatJob]:
        return self._jobs.get(session_id)

    def start_chat(
        self,
        session_id: str,
        model: str,
        payload: dict,
        sources: list,
        ollama_base_url: str,
        client: httpx.AsyncClient,
    ) -> ChatJob:
        # Cancel any prior active generation on this session
        self.abort_chat(session_id)

        job = ChatJob(session_id=session_id, model=model, sources=sources)
        self._jobs[session_id] = job
        job.task = asyncio.create_task(self._run_chat(job, payload, ollama_base_url, client))
        return job

    def abort_chat(self, session_id: str) -> bool:
        job = self._jobs.get(session_id)
        if job and not job.done and job.task:
            job.task.cancel()
            return True
        return False

    async def _run_chat(self, job: ChatJob, payload: dict, ollama_base_url: str, client: httpx.AsyncClient):
        try:
            url = f"{ollama_base_url}/api/chat"
            async with client.stream(
                "POST",
                url,
                json=payload,
                timeout=httpx.Timeout(connect=15.0, read=None, write=30.0, pool=30.0),
            ) as resp:
                if resp.status_code != 200:
                    err_bytes = await resp.aread()
                    job.error = f"Ollama error ({resp.status_code}): {err_bytes.decode('utf-8', errors='ignore')}"
                    job.done = True
                    job.completed_at = time.time()
                    await job.broadcast({"error": job.error, "done": True})
                    return

                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            job.accumulated_text += content

                        job.chunks.append(data)
                        if data.get("done"):
                            job.final_metadata = data

                        await job.broadcast(data)
                    except Exception:
                        pass

            job.done = True
            job.completed_at = time.time()
        except asyncio.CancelledError:
            job.done = True
            job.error = "Aborted by user"
            job.completed_at = time.time()
            await job.broadcast({"done": True, "aborted": True})
        except Exception as e:
            job.done = True
            job.error = str(e)
            job.completed_at = time.time()
            await job.broadcast({"done": True, "error": str(e)})


# Global Singletons
pull_manager = PullJobManager()
chat_manager = ChatJobManager()
