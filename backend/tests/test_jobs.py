import asyncio
import unittest
import time
from backend.jobs import PullJob, PullJobManager, ChatJob, ChatJobManager


class TestJobs(unittest.IsolatedAsyncioTestCase):
    async def test_pull_job_bounded_queue(self):
        job = PullJob("test-model")
        q = job.add_listener()
        self.assertEqual(q.maxsize, 100)

        # Broadcast more than 100 items - should not throw QueueFull
        for i in range(120):
            await job.broadcast({"index": i})

        # Queue should be at most 100 items
        self.assertLessEqual(q.qsize(), 100)
        job.remove_listener(q)
        self.assertEqual(len(job._listeners), 0)

    async def test_chat_job_bounded_queue(self):
        job = ChatJob("test-session", "test-model")
        q = job.add_listener()
        self.assertEqual(q.maxsize, 100)

        for i in range(120):
            await job.broadcast({"chunk": i})

        self.assertLessEqual(q.qsize(), 100)
        job.remove_listener(q)
        self.assertEqual(len(job._listeners), 0)

    def test_chat_job_manager_cleanup(self):
        mgr = ChatJobManager()
        job1 = ChatJob("sess_old", "model")
        job1.done = True
        job1.completed_at = time.time() - 2000  # Expired > 1800s ago
        mgr._jobs["sess_old"] = job1

        job2 = ChatJob("sess_recent", "model")
        job2.done = True
        job2.completed_at = time.time() - 100   # Recent
        mgr._jobs["sess_recent"] = job2

        job3 = ChatJob("sess_active", "model")
        job3.done = False                       # Active
        mgr._jobs["sess_active"] = job3

        # Trigger cleanup
        mgr._cleanup_old_jobs()

        self.assertNotIn("sess_old", mgr._jobs)
        self.assertIn("sess_recent", mgr._jobs)
        self.assertIn("sess_active", mgr._jobs)


if __name__ == "__main__":
    unittest.main()
