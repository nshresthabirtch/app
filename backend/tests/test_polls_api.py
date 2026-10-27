# Group Food Vote (polls) API regression tests
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://hungry-trip--8hy9lrsl.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OPTS = [
    {"name": "TEST_Pizza Place", "cuisine": "Italian", "price": "$$"},
    {"name": "TEST_Slice Shop", "cuisine": "Pizza", "price": "$"},
    {"name": "TEST_Oven Co", "cuisine": "Neapolitan", "price": "$$$"},
]


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture
def poll(s):
    r = s.post(f"{API}/polls", json={"title": "TEST_Where to eat", "craving": "pizza", "place": "NYC", "options": OPTS})
    assert r.status_code == 200, r.text
    p = r.json()
    yield p
    s.delete(f"{API}/polls/{p['id']}")


# --- create ---
def test_create_poll_shape(poll):
    assert isinstance(poll["id"], str) and len(poll["id"]) == 24
    assert poll["title"] == "TEST_Where to eat"
    assert poll["counts"] == [0, 0, 0]
    assert poll["total"] == 0
    assert poll["winner"] is None
    assert poll["closed"] is False
    assert len(poll["options"]) == 3
    assert "_id" not in poll


def test_create_poll_needs_two_options(s):
    r = s.post(f"{API}/polls", json={"title": "TEST_x", "options": OPTS[:1]})
    assert r.status_code == 400
    r = s.post(f"{API}/polls", json={"title": "TEST_x", "options": []})
    assert r.status_code == 400


def test_create_poll_caps_six_options(s):
    opts = [{"name": f"TEST_R{i}"} for i in range(8)]
    r = s.post(f"{API}/polls", json={"title": "TEST_cap", "options": opts})
    assert r.status_code == 200
    p = r.json()
    assert len(p["options"]) == 6 and len(p["counts"]) == 6
    s.delete(f"{API}/polls/{p['id']}")


# --- read ---
def test_get_and_list(s, poll):
    r = s.get(f"{API}/polls/{poll['id']}")
    assert r.status_code == 200 and r.json()["id"] == poll["id"]
    r = s.get(f"{API}/polls")
    assert r.status_code == 200
    assert any(p["id"] == poll["id"] for p in r.json())


def test_invalid_ids_404(s):
    assert s.get(f"{API}/polls/notanid").status_code == 404
    assert s.get(f"{API}/polls/0123456789abcdef01234567").status_code == 404
    assert s.post(f"{API}/polls/0123456789abcdef01234567/vote", json={"voter_id": "abcd", "choice": 0}).status_code == 404
    assert s.post(f"{API}/polls/0123456789abcdef01234567/close").status_code == 404
    assert s.get(f"{API}/polls/0123456789abcdef01234567/page").status_code == 404


# --- vote ---
def test_vote_and_change_vote(s, poll):
    pid = poll["id"]
    r = s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_v1", "name": "Ann", "choice": 0})
    assert r.status_code == 200
    assert r.json()["counts"] == [1, 0, 0] and r.json()["total"] == 1 and r.json()["winner"] == 0
    r = s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_v1", "name": "Ann", "choice": 2})
    assert r.json()["counts"] == [0, 0, 1] and r.json()["total"] == 1
    g = s.get(f"{API}/polls/{pid}").json()
    assert g["counts"] == [0, 0, 1]
    assert g["votes"][0]["name"] == "Ann"


def test_vote_validation(s, poll):
    pid = poll["id"]
    assert s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_v1", "choice": 3}).status_code == 400
    assert s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_v1", "choice": -1}).status_code == 400
    assert s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "abc", "choice": 0}).status_code == 422
    assert s.post(f"{API}/polls/{pid}/vote", json={"choice": 0}).status_code == 422


# --- close ---
def test_close_with_winner_then_vote_blocked(s, poll):
    pid = poll["id"]
    s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_a1", "choice": 1})
    s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_a2", "choice": 1})
    s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_a3", "choice": 0})
    r = s.post(f"{API}/polls/{pid}/close")
    assert r.status_code == 200 and r.json()["closed"] is True and r.json()["winner"] == 1
    assert s.get(f"{API}/polls/{pid}").json()["closed"] is True
    r = s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_a4", "choice": 0})
    assert r.status_code == 400


def test_close_tie_winner_null(s, poll):
    pid = poll["id"]
    s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_b1", "choice": 0})
    s.post(f"{API}/polls/{pid}/vote", json={"voter_id": "TEST_b2", "choice": 1})
    r = s.post(f"{API}/polls/{pid}/close")
    assert r.json()["closed"] is True and r.json()["winner"] is None


# --- delete ---
def test_delete(s):
    p = s.post(f"{API}/polls", json={"title": "TEST_del", "options": OPTS[:2]}).json()
    assert s.delete(f"{API}/polls/{p['id']}").status_code == 200
    assert s.get(f"{API}/polls/{p['id']}").status_code == 404


# --- html page ---
def test_page_html(s, poll):
    r = s.get(f"{API}/polls/{poll['id']}/page")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert poll["id"] in r.text and "GROUP VOTE" in r.text
