# Health responsiveness while slow LLM/STT requests run (event loop must not be blocked)
import os, time, threading
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
LOCAL = "http://localhost:8001"
AUDIO = "/tmp/hungry.mp3"


def poll_health(stop, results, base):
    while not stop.is_set():
        t = time.time()
        try:
            r = requests.get(f"{base}/health", timeout=5)
            results.append((r.status_code, time.time() - t))
        except Exception as e:
            results.append((str(e), time.time() - t))
        time.sleep(0.5)


def run_with_health(jobs, base=LOCAL):
    stop, results, outs = threading.Event(), [], {}
    hp = threading.Thread(target=poll_health, args=(stop, results, base))
    hp.start()
    threads = []
    for name, fn in jobs:
        def w(n=name, f=fn):
            t = time.time()
            try:
                outs[n] = (f(), time.time() - t)
            except Exception as e:
                outs[n] = (e, time.time() - t)
        th = threading.Thread(target=w); th.start(); threads.append(th)
    for th in threads:
        th.join()
    stop.set(); hp.join()
    return results, outs


def hungry():
    return requests.post(f"{BASE_URL}/api/hungry", json={"text": "I am hungry for ramen", "place": "Austin, TX",
                                                         "today": "2026-10-27"}, timeout=180)


def trip():
    return requests.post(f"{BASE_URL}/api/trips", json={"destination": "TEST_Paris", "date": "2026-11-05",
                                                        "meal": "lunch", "craving": "croissant"}, timeout=180)


def transcribe():
    with open(AUDIO, "rb") as f:
        return requests.post(f"{BASE_URL}/api/transcribe", files={"audio": ("hungry.mp3", f, "audio/mpeg")}, timeout=120)


def check(results, outs):
    print("health samples:", len(results), "max latency:", max(r[1] for r in results))
    for n, (r, d) in outs.items():
        print(n, getattr(r, "status_code", r), round(d, 1))
    assert len(results) >= 3
    assert all(r[0] == 200 for r in results), results
    assert max(r[1] for r in results) < 1.0, results


class TestHealthUnderLoad:
    def test_health_local_during_hungry_and_trips(self):
        results, outs = run_with_health([("h1", hungry), ("h2", hungry), ("h3", hungry), ("t1", trip)])
        check(results, outs)
        for n, (r, _) in outs.items():
            assert getattr(r, "status_code", None) == 200, (n, r)
        assert outs["h1"][0].json()["intent"] == "eat_now"
        assert len(outs["h1"][0].json()["options"]) > 0
        assert outs["t1"][0].json()["destination"] == "TEST_Paris"
        assert len(outs["t1"][0].json()["options"]) > 0

    def test_health_public_during_hungry(self):
        results, outs = run_with_health([("h1", hungry), ("h2", hungry)], base=BASE_URL)
        print("public", results)
        assert all(r[0] == 200 for r in results)
        assert max(r[1] for r in results) < 2.0

    def test_health_during_transcribe(self):
        if not os.path.exists(AUDIO):
            pytest.skip("no audio")
        results, outs = run_with_health([("s1", transcribe), ("s2", transcribe), ("h1", hungry)])
        check(results, outs)
        r = outs["s1"][0]
        assert r.status_code == 200
        print("transcript:", r.json())
        assert "pizza" in r.json()["text"].lower()

    def test_transcribe_tiny(self):
        r = requests.post(f"{BASE_URL}/api/transcribe", files={"audio": ("a.m4a", b"x" * 100, "audio/m4a")})
        assert r.status_code == 200 and r.json() == {"text": ""}

    def test_hungry_trip_intent(self):
        r = requests.post(f"{BASE_URL}/api/hungry", json={"text": "I'm travelling to Tokyo next Friday for lunch",
                                                          "today": "2026-10-27"}, timeout=180)
        assert r.status_code == 200
        d = r.json()
        assert d["intent"] == "trip"
        assert d["trip"]["meal"] == "lunch" and d["trip"]["date"] > "2026-10-27"
        requests.delete(f"{BASE_URL}/api/trips/{d['trip']['id']}")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for t in requests.get(f"{BASE_URL}/api/trips").json():
        if t["destination"].startswith("TEST_"):
            requests.delete(f"{BASE_URL}/api/trips/{t['id']}")
