import os
import unittest
from fastapi.testclient import TestClient
from backend.main import app


class TestApiEndpoints(unittest.TestCase):
    def test_endpoints_with_lifespan(self):
        with TestClient(app) as client:
            # 1. Sys stats
            resp = client.get("/api/sys/stats")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("cpu", data)
            self.assertIn("ram", data)
            self.assertIn("gpus", data)

            # 2. Search status
            resp = client.get("/api/search/status")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("enabled", data)

            # 3. Voice status
            resp = client.get("/api/voice/status")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("available", data)

            # 4. Ollama path protection
            resp = client.get("/api/ollama/..%2f..%2fetc%2fpasswd")
            self.assertIn(resp.status_code, [400, 403, 404])

            resp_invalid = client.get("/api/ollama/forbidden_endpoint")
            self.assertEqual(resp_invalid.status_code, 403)

    def test_auth_token_enforcement(self):
        os.environ["LUMINA_AUTH_TOKEN"] = "test-secret-token"
        try:
            with TestClient(app) as client:
                # Healthcheck is unauthenticated and always returns 200
                resp_health = client.get("/api/health")
                self.assertEqual(resp_health.status_code, 200)
                self.assertEqual(resp_health.json().get("status"), "ok")

                # Protected endpoint without token: 401
                resp = client.get("/api/sys/stats")
                self.assertEqual(resp.status_code, 401)

                # With Bearer token: 200
                resp_bearer = client.get(
                    "/api/sys/stats",
                    headers={"Authorization": "Bearer test-secret-token"},
                )
                self.assertEqual(resp_bearer.status_code, 200)

                # With X-Lumina-Token: 200
                resp_header = client.get(
                    "/api/sys/stats",
                    headers={"X-Lumina-Token": "test-secret-token"},
                )
                self.assertEqual(resp_header.status_code, 200)

                # With query param: 200
                resp_query = client.get("/api/sys/stats?token=test-secret-token")
                self.assertEqual(resp_query.status_code, 200)
        finally:
            os.environ.pop("LUMINA_AUTH_TOKEN", None)

        with TestClient(app) as client:
            resp_open = client.get("/api/sys/stats")
            self.assertEqual(resp_open.status_code, 200)

    def test_search_intent_extraction(self):
        from backend.routers.search import clean_search_query

        self.assertEqual(
            clean_search_query("what will the weather be like tomorrow in zip code 68046"),
            "weather 68046",
        )
        self.assertEqual(
            clean_search_query("weather forecast for Omaha, NE tomorrow"),
            "weather Omaha NE",
        )
        self.assertEqual(
            clean_search_query("what's the temperature in Chicago this weekend"),
            "weather Chicago",
        )
        self.assertEqual(
            clean_search_query("is it raining in 90210 right now"),
            "weather 90210",
        )
        self.assertEqual(
            clean_search_query("can you find the price of bitcoin today"),
            "bitcoin price",
        )


if __name__ == "__main__":
    unittest.main()
