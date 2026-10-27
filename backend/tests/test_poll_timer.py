# Vote Countdown Timer: duration_minutes, auto-close on expiry, winner logic (votes/tiebreak/no_votes)
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


DB = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]

OPTS = [
    {"name": "TEST_Low", "rating": 4.0},
    {"name": "TEST_High", "rating": 4.9},
    {"name": "TEST_Mid", "rating": 4.5},
]


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture
def mk(s):
    ids = []

    def make(**extra):
        r = s.post(f"{API}/polls", json={"title": "TEST_timer", "options": OPTS, **extra})
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
        return r.json()

    yield make
    for i in ids:
        s.delete(f"{API}/polls/{i}")


def expire(pid):
    DB.polls.update_one({"_id": ObjectId(pid)}, {"$set": {"ends_at": "2020-01-01T00:00:00+00:00"}})


# --- create with duration ---
def test_duration_sets_ends_at(mk):
    p = mk(duration_minutes=10)
    ends = datetime.fromisoformat(p["ends_at"])
    delta = (ends - datetime.now(timezone.utc)).total_seconds()
    assert 560 < delta <= 601
    assert p["closed"] is False


def test_no_duration_ends_at_null(mk, s):
    p = mk()
    assert p["ends_at"] is None
    assert s.get(f"{API}/polls/{p['id']}").json()["ends_at"] is None


def test_null_duration_ok(mk):
    assert mk(duration_minutes=None)["ends_at"] is None


@pytest.mark.parametrize("bad", [0, -5, 1441, "abc"])
def test_duration_validation(s, bad):
    r = s.post(f"{API}/polls", json={"title": "TEST_bad", "options": OPTS, "duration_minutes": bad})
    assert r.status_code == 422


@pytest.mark.parametrize("ok", [1, 1440])
def test_duration_bounds(mk, ok):
    p = mk(duration_minutes=ok)
    delta = (datetime.fromisoformat(p["ends_at"]) - datetime.now(timezone.utc)).total_seconds()
    assert abs(delta - ok * 60) < 30


# --- auto-close ---
def test_get_auto_closes_and_vote_blocked(mk, s):
    p = mk(duration_minutes=5)
    s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_t1", "choice": 0})
    s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_t2", "choice": 0})
    s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_t3", "choice": 1})
    expire(p["id"])
    g = s.get(f"{API}/polls/{p['id']}").json()
    assert g["closed"] is True and g["winner"] == 0 and g["decided"] == "votes"
    assert DB.polls.find_one({"_id": ObjectId(p["id"])})["closed"] is True
    r = s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_t4", "choice": 1})
    assert r.status_code == 400 and r.json()["detail"] == "Voting is closed"


def test_list_auto_closes(mk, s):
    p = mk(duration_minutes=5)
    expire(p["id"])
    lst = s.get(f"{API}/polls").json()
    me = next(x for x in lst if x["id"] == p["id"])
    assert me["closed"] is True and me["winner"] == 1 and me["decided"] == "no_votes"


def test_vote_on_expired_without_get_blocked(mk, s):
    p = mk(duration_minutes=5)
    expire(p["id"])
    r = s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_t5", "choice": 0})
    assert r.status_code == 400 and r.json()["detail"] == "Voting is closed"


def test_expired_tie_tiebreak(mk, s):
    p = mk(duration_minutes=5)
    s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_x1", "choice": 0})
    s.post(f"{API}/polls/{p['id']}/vote", json={"voter_id": "TEST_x2", "choice": 2})
    expire(p["id"])
    g = s.get(f"{API}/polls/{p['id']}").json()
    # tie between Low(4.0) and Mid(4.5) -> Mid (index 2), not untied High
    assert g["closed"] is True and g["winner"] == 2 and g["decided"] == "tiebreak"


def test_expired_zero_votes_no_votes(mk, s):
    p = mk(duration_minutes=5)
    expire(p["id"])
    g = s.get(f"{API}/polls/{p['id']}").json()
    assert g["closed"] is True and g["winner"] == 1 and g["decided"] == "no_votes"


def test_not_expired_stays_open(mk, s):
    p = mk(duration_minutes=5)
    g = s.get(f"{API}/polls/{p['id']}").json()
    assert g["closed"] is False and g["winner"] is None


def test_page_has_countdown(mk, s):
    p = mk(duration_minutes=5)
    r = s.get(f"{API}/polls/{p['id']}/page")
    assert r.status_code == 200 and "Closes in" in r.text and 'id="cd"' in r.text
