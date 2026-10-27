"""Backend tests for I'm Hungry API."""
import os
import io
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://hungry-trip--8hy9lrsl.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TODAY = date.today().isoformat()

TIMEOUT = 90  # LLM calls are slow


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----- health / root -----
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


# ----- /api/hungry eat_now -----
def test_hungry_eat_now(session):
    payload = {"text": "I'm hungry for pizza", "place": "San Francisco, CA", "today": TODAY}
    r = session.post(f"{API}/hungry", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["intent"] == "eat_now"
    assert "craving" in data and "headline" in data
    assert isinstance(data["options"], list)
    assert len(data["options"]) >= 1  # should ideally be 6
    opt = data["options"][0]
    for k in ("name", "cuisine", "price", "signature_dish", "why"):
        assert k in opt
    pytest.shared_craving = data["craving"]
    pytest.shared_opt = opt


def test_hungry_empty_text(session):
    r = session.post(f"{API}/hungry", json={"text": "   ", "today": TODAY})
    assert r.status_code == 400


# ----- /api/hungry trip intent -----
def test_hungry_trip_intent(session):
    payload = {"text": "I'm travelling to Rome next Friday, hungry for lunch", "today": TODAY}
    r = session.post(f"{API}/hungry", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["intent"] == "trip"
    trip = data["trip"]
    assert trip["id"]
    assert "rome" in trip["destination"].lower()
    assert trip["meal"] == "lunch"
    assert len(trip["options"]) >= 1
    pytest.shared_trip_id = trip["id"]


# ----- /api/trips CRUD -----
def test_create_trip(session):
    payload = {"destination": "TEST_Paris", "date": TODAY, "meal": "dinner", "craving": "pasta"}
    r = session.post(f"{API}/trips", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["id"] and t["destination"] == "TEST_Paris" and t["meal"] == "dinner"
    assert len(t["options"]) >= 1
    pytest.created_trip_id = t["id"]


def test_list_trips(session):
    r = session.get(f"{API}/trips")
    assert r.status_code == 200
    trips = r.json()
    assert any(t["id"] == pytest.created_trip_id for t in trips)


def test_get_trip(session):
    r = session.get(f"{API}/trips/{pytest.created_trip_id}")
    assert r.status_code == 200
    assert r.json()["id"] == pytest.created_trip_id


def test_get_trip_404(session):
    r = session.get(f"{API}/trips/doesnotexist")
    assert r.status_code == 404


def test_delete_trip(session):
    r = session.delete(f"{API}/trips/{pytest.created_trip_id}")
    assert r.status_code == 200
    # verify gone
    r2 = session.get(f"{API}/trips/{pytest.created_trip_id}")
    assert r2.status_code == 404
    # also cleanup trip from hungry_trip test
    if hasattr(pytest, "shared_trip_id"):
        session.delete(f"{API}/trips/{pytest.shared_trip_id}")


# ----- /api/favorites -----
def test_add_favorite(session):
    rest = {"name": "TEST_Joe's Pizza", "cuisine": "Pizza", "price": "$$",
            "signature_dish": "Margherita", "why": "best cheese", "address": "123 Test", "rating": 4.7}
    r = session.post(f"{API}/favorites", json={"restaurant": rest, "craving": "pizza", "place": "SF"})
    assert r.status_code == 200
    f = r.json()
    assert f["id"] and f["restaurant"]["name"] == "TEST_Joe's Pizza"
    pytest.fav_id = f["id"]


def test_add_favorite_duplicate(session):
    rest = {"name": "TEST_Joe's Pizza", "cuisine": "Pizza", "price": "$$",
            "signature_dish": "Margherita", "why": "best cheese", "address": "123 Test", "rating": 4.7}
    r = session.post(f"{API}/favorites", json={"restaurant": rest})
    assert r.status_code == 200
    assert r.json()["id"] == pytest.fav_id  # idempotent


def test_list_favorites(session):
    r = session.get(f"{API}/favorites")
    assert r.status_code == 200
    assert any(f["id"] == pytest.fav_id for f in r.json())


def test_delete_favorite(session):
    r = session.delete(f"{API}/favorites/{pytest.fav_id}")
    assert r.status_code == 200
    r2 = session.get(f"{API}/favorites")
    assert not any(f["id"] == pytest.fav_id for f in r2.json())


# ----- /api/history -----
def test_history(session):
    r = session.get(f"{API}/history")
    assert r.status_code == 200
    hist = r.json()
    assert isinstance(hist, list)
    # eat_now test should have logged one
    assert any("pizza" in (h.get("text", "") + h.get("craving", "")).lower() for h in hist)


# ----- /api/transcribe -----
def test_transcribe_tiny_file(session):
    files = {"audio": ("rec.m4a", b"\x00" * 100, "audio/m4a")}
    # Use fresh request without json header
    r = requests.post(f"{API}/transcribe", files=files, timeout=TIMEOUT)
    assert r.status_code == 200
    assert r.json()["text"] == ""
