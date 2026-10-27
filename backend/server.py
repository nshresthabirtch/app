from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import json
import re
import uuid
import logging
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from typing import List, Optional, Annotated, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAISpeechToText

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")

# ---------- Mongo helpers ----------
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude={"id"})
        return data

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)

    def out(self) -> dict:
        return self.model_dump(by_alias=False)


class Restaurant(BaseModel):
    name: str
    cuisine: str = ""
    price: str = "$$"
    distance: str = ""
    signature_dish: str = ""
    why: str = ""
    address: str = ""
    rating: float = 4.5


Meal = Literal["breakfast", "lunch", "dinner"]


class Trip(BaseDocument):
    destination: str
    date: str  # YYYY-MM-DD
    meal: Meal
    craving: str = ""
    headline: str = ""
    options: List[Restaurant] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Favorite(BaseDocument):
    restaurant: Restaurant
    craving: str = ""
    place: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Craving(BaseDocument):
    text: str
    craving: str
    place: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------- Requests ----------
class HungryRequest(BaseModel):
    text: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    place: Optional[str] = None
    today: str  # YYYY-MM-DD on device
    budget: Optional[str] = None


class TripRequest(BaseModel):
    destination: str
    date: str
    meal: Meal
    craving: Optional[str] = ""
    budget: Optional[str] = None


class FavoriteRequest(BaseModel):
    restaurant: Restaurant
    craving: str = ""
    place: str = ""


# ---------- LLM ----------
SYSTEM = """You are "I'm Hungry", a cheerful local food concierge.
Always reply with ONLY valid JSON (no markdown) with this exact shape:
{"intent": "eat_now" | "trip",
 "craving": "short craving, e.g. 'pizza' (pick something tasty if user is vague or says surprise)",
 "headline": "fun, punchy one-liner under 60 chars",
 "destination": "city/place if trip else ''",
 "date": "YYYY-MM-DD if trip else ''",
 "meal": "breakfast" | "lunch" | "dinner",
 "options": [{"name": "", "cuisine": "", "price": "$|$$|$$$|$$$$", "distance": "e.g. 0.6 mi (eat_now) or neighborhood (trip)",
   "signature_dish": "", "why": "one appetizing sentence", "address": "street address or neighborhood", "rating": 4.6}]}
Rules: intent is "trip" when the user says they are travelling/going/visiting somewhere in the future; otherwise "eat_now".
For trips resolve relative dates against TODAY; if no date given use tomorrow; infer meal from words, default dinner.
Return 6 options of REAL, well-known places that actually exist near the given location/destination when possible."""


async def ask_llm(prompt: str) -> dict:
    chat = LlmChat(api_key=LLM_KEY, session_id=str(uuid.uuid4()), system_message=SYSTEM).with_model("openai", "gpt-5.5")
    out = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            out += ev.content
        elif isinstance(ev, StreamDone):
            break
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        raise HTTPException(502, "Could not understand the food oracle. Try again.")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        raise HTTPException(502, "Food oracle returned gibberish. Try again.")


def clean_options(raw) -> List[Restaurant]:
    res = []
    for o in raw or []:
        try:
            res.append(Restaurant(**{k: v for k, v in o.items() if k in Restaurant.model_fields}))
        except Exception:
            continue
    return res


def budget_line(b: Optional[str]) -> str:
    return f"Budget preference: {b}. " if b else ""


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "I'm Hungry API"}


@api_router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    if len(data) < 2000:
        return {"text": ""}
    suffix = Path(audio.filename or "rec.m4a").suffix or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        stt = OpenAISpeechToText(api_key=LLM_KEY)
        with open(path, "rb") as f:
            resp = await stt.transcribe(file=f, model="gpt-4o-mini-transcribe", response_format="json",
                                        prompt="I'm hungry for pizza. I'm travelling to Paris next Friday for lunch.")
        return {"text": (resp.text or "").strip()}
    except Exception as e:
        logger.exception("transcribe failed")
        raise HTTPException(502, f"Transcription failed: {e}")
    finally:
        os.unlink(path)


@api_router.post("/hungry")
async def hungry(req: HungryRequest):
    if not req.text.strip():
        raise HTTPException(400, "Tell me what you're hungry for")
    loc = req.place or ""
    if req.lat is not None and req.lng is not None:
        loc = f"{loc} (lat {req.lat:.4f}, lng {req.lng:.4f})".strip()
    prompt = (f"TODAY: {req.today}. User location: {loc or 'unknown - suggest popular chain/common options'}. "
              f"{budget_line(req.budget)}User said: \"{req.text}\"")
    data = await ask_llm(prompt)
    options = clean_options(data.get("options"))
    craving = data.get("craving") or req.text
    if data.get("intent") == "trip" and data.get("destination"):
        meal = data.get("meal") if data.get("meal") in ("breakfast", "lunch", "dinner") else "dinner"
        trip = Trip(destination=data["destination"], date=data.get("date") or req.today, meal=meal,
                    craving=craving, headline=data.get("headline", ""), options=options)
        r = await db.trips.insert_one(trip.to_mongo())
        trip.id = str(r.inserted_id)
        return {"intent": "trip", "trip": trip.out()}
    c = Craving(text=req.text, craving=craving, place=req.place or "")
    await db.cravings.insert_one(c.to_mongo())
    return {"intent": "eat_now", "craving": craving, "headline": data.get("headline", ""),
            "options": [o.model_dump() for o in options]}


@api_router.post("/trips")
async def create_trip(req: TripRequest):
    prompt = (f"TODAY: {req.date}. This is a trip. Destination: {req.destination}. Date: {req.date}. Meal: {req.meal}. "
              f"{budget_line(req.budget)}Craving: {req.craving or 'local favourites'}. Set intent to trip.")
    data = await ask_llm(prompt)
    trip = Trip(destination=req.destination, date=req.date, meal=req.meal,
                craving=req.craving or data.get("craving", ""), headline=data.get("headline", ""),
                options=clean_options(data.get("options")))
    r = await db.trips.insert_one(trip.to_mongo())
    trip.id = str(r.inserted_id)
    return trip.out()


@api_router.get("/trips")
async def list_trips():
    docs = await db.trips.find().sort("date", 1).to_list(200)
    return [Trip.from_mongo(d).out() for d in docs]


@api_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str):
    if not ObjectId.is_valid(trip_id):
        raise HTTPException(404, "Trip not found")
    d = await db.trips.find_one({"_id": ObjectId(trip_id)})
    if not d:
        raise HTTPException(404, "Trip not found")
    return Trip.from_mongo(d).out()


@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str):
    if ObjectId.is_valid(trip_id):
        await db.trips.delete_one({"_id": ObjectId(trip_id)})
    return {"ok": True}


@api_router.get("/favorites")
async def list_favorites():
    docs = await db.favorites.find().sort("created_at", -1).to_list(200)
    return [Favorite.from_mongo(d).out() for d in docs]


@api_router.post("/favorites")
async def add_favorite(req: FavoriteRequest):
    existing = await db.favorites.find_one({"restaurant.name": req.restaurant.name})
    if existing:
        return Favorite.from_mongo(existing).out()
    fav = Favorite(restaurant=req.restaurant, craving=req.craving, place=req.place)
    r = await db.favorites.insert_one(fav.to_mongo())
    fav.id = str(r.inserted_id)
    return fav.out()


@api_router.delete("/favorites/{fav_id}")
async def delete_favorite(fav_id: str):
    if ObjectId.is_valid(fav_id):
        await db.favorites.delete_one({"_id": ObjectId(fav_id)})
    return {"ok": True}


@api_router.get("/history")
async def history():
    docs = await db.cravings.find().sort("created_at", -1).to_list(30)
    return [Craving.from_mongo(d).out() for d in docs]


# ---------- Group food vote ----------
class Vote(BaseModel):
    voter_id: str
    name: str = ""
    choice: int


class Poll(BaseDocument):
    title: str
    craving: str = ""
    place: str = ""
    options: List[Restaurant]
    votes: List[Vote] = []
    closed: bool = False
    ends_at: Optional[str] = None  # ISO UTC; auto-closes when passed
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def expired(self) -> bool:
        return bool(self.ends_at) and datetime.fromisoformat(self.ends_at) <= datetime.now(timezone.utc)

    def public(self) -> dict:
        counts = [0] * len(self.options)
        for v in self.votes:
            if 0 <= v.choice < len(counts):
                counts[v.choice] += 1
        top = max(counts) if counts else 0
        leaders = [i for i, c in enumerate(counts) if c == top]
        winner, decided = None, None
        if len(leaders) == 1 and top > 0:
            winner, decided = leaders[0], "votes"
        elif self.closed:
            # Tie or no votes: break it with the highest-rated place so there's always a winner.
            winner = max(leaders, key=lambda i: self.options[i].rating)
            decided = "tiebreak" if top > 0 else "no_votes"
        d = self.out()
        d["votes"] = [{"voter_id": v.voter_id, "name": v.name, "choice": v.choice} for v in self.votes]
        d["counts"] = counts
        d["total"] = len(self.votes)
        d["winner"] = winner
        d["decided"] = decided
        return d


class PollRequest(BaseModel):
    title: str
    craving: str = ""
    place: str = ""
    options: List[Restaurant]
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)


class VoteRequest(BaseModel):
    voter_id: str = Field(min_length=4, max_length=64)
    name: str = Field(default="", max_length=40)
    choice: int


async def load_poll(poll_id: str) -> Poll:
    if not ObjectId.is_valid(poll_id):
        raise HTTPException(404, "Vote not found")
    d = await db.polls.find_one({"_id": ObjectId(poll_id)})
    if not d:
        raise HTTPException(404, "Vote not found")
    return await auto_close(Poll.from_mongo(d))


async def auto_close(poll: Poll) -> Poll:
    if not poll.closed and poll.expired():
        await db.polls.update_one({"_id": ObjectId(poll.id)}, {"$set": {"closed": True}})
        poll.closed = True
    return poll


@api_router.post("/polls")
async def create_poll(req: PollRequest):
    if len(req.options) < 2:
        raise HTTPException(400, "Need at least 2 places to vote on")
    ends_at = (datetime.now(timezone.utc) + timedelta(minutes=req.duration_minutes)).isoformat() if req.duration_minutes else None
    poll = Poll(title=req.title[:80], craving=req.craving, place=req.place, options=req.options[:6], ends_at=ends_at)
    r = await db.polls.insert_one(poll.to_mongo())
    poll.id = str(r.inserted_id)
    return poll.public()


@api_router.get("/polls")
async def list_polls():
    docs = await db.polls.find().sort("created_at", -1).to_list(50)
    return [(await auto_close(Poll.from_mongo(d))).public() for d in docs]


@api_router.get("/polls/{poll_id}")
async def get_poll(poll_id: str):
    return (await load_poll(poll_id)).public()


@api_router.post("/polls/{poll_id}/vote")
async def vote(poll_id: str, req: VoteRequest):
    poll = await load_poll(poll_id)
    if poll.closed:
        raise HTTPException(400, "Voting is closed")
    if not 0 <= req.choice < len(poll.options):
        raise HTTPException(400, "Invalid choice")
    await db.polls.update_one({"_id": ObjectId(poll_id)}, {"$pull": {"votes": {"voter_id": req.voter_id}}})
    await db.polls.update_one({"_id": ObjectId(poll_id)}, {"$push": {"votes": Vote(voter_id=req.voter_id, name=req.name.strip(), choice=req.choice).model_dump()}})
    return (await load_poll(poll_id)).public()


@api_router.post("/polls/{poll_id}/close")
async def close_poll(poll_id: str):
    poll = await load_poll(poll_id)
    if poll.closed:
        return poll.public()
    if not poll.votes:
        raise HTTPException(400, "Get at least one vote first")
    await db.polls.update_one({"_id": ObjectId(poll_id)}, {"$set": {"closed": True}})
    poll.closed = True
    return poll.public()


@api_router.delete("/polls/{poll_id}")
async def delete_poll(poll_id: str):
    await load_poll(poll_id)
    await db.polls.delete_one({"_id": ObjectId(poll_id)})
    return {"ok": True}


VOTE_PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>I'm Hungry - Vote</title><style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#FFFBF7;color:#2C2622}
.wrap{max-width:520px;margin:0 auto;padding:24px 16px 48px}.k{color:#F25C54;font-weight:900;letter-spacing:1px;font-size:13px}
h1{font-size:28px;margin:6px 0 4px}.sub{color:#8C7F77;font-weight:600;margin:0 0 16px}
input{width:100%;height:50px;border-radius:999px;border:1.5px solid #E8DED6;padding:0 18px;font-size:16px;margin-bottom:16px;background:#fff}
.opt{position:relative;overflow:hidden;background:#fff;border:1.5px solid #E8DED6;border-bottom-width:4px;border-radius:20px;padding:14px 16px;margin-bottom:12px;cursor:pointer}
.opt.mine{border-color:#F25C54}.bar{position:absolute;left:0;top:0;bottom:0;background:#FBE6D8;z-index:0;transition:width .4s}
.in{position:relative;z-index:1;display:flex;justify-content:space-between;gap:12px;align-items:center}
.n{font-weight:900;font-size:17px}.m{color:#8C7F77;font-size:13px;font-weight:600;margin-top:2px}.c{font-weight:900;color:#D1453F;font-size:18px}
.done{background:#F25C54;color:#fff;border-radius:20px;padding:16px;margin-bottom:16px;font-weight:800}
.err{color:#D1453F;font-weight:700}.cd{display:inline-block;background:#2C2622;color:#fff;border-radius:999px;padding:8px 14px;font-weight:800;margin:0 0 16px}.cd:empty{display:none}
</style></head><body><div class="wrap"><div class="k">I'M HUNGRY · GROUP VOTE</div><h1 id="t">Loading…</h1><p class="sub" id="s"></p><p class="cd" id="cd"></p>
<div id="w"></div><input id="name" placeholder="Your name (optional)" maxlength="40"><div id="o"></div><p class="err" id="e"></p></div>
<script>
const PID=__PID__;const api=location.pathname.replace(/\\/page$/,'');
let vid=localStorage.getItem('ih_voter');if(!vid){vid='w'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('ih_voter',vid)}
const nm=document.getElementById('name');nm.value=localStorage.getItem('ih_name')||'';
function el(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function render(p){document.getElementById('t').textContent=p.title;
cur=p;document.getElementById('s').textContent=p.closed?'Voting closed':(p.total+' vote'+(p.total==1?'':'s')+' so far · tap a place to vote');tick();
const w=document.getElementById('w');w.innerHTML='';if(p.closed&&p.winner!=null){w.appendChild(el('div','done','\\u{1F3C6} Winner: '+p.options[p.winner].name+(p.decided==='tiebreak'?' (tie broken by rating)':p.decided==='no_votes'?' (no votes - top rated pick)':'')))}
const mine=(p.votes.find(v=>v.voter_id===vid)||{}).choice;const o=document.getElementById('o');o.innerHTML='';
p.options.forEach((r,i)=>{const d=el('div','opt'+(mine===i?' mine':''));const b=el('div','bar');b.style.width=(p.total?Math.round(100*p.counts[i]/p.total):0)+'%';d.appendChild(b);
const inn=el('div','in');const l=el('div');l.appendChild(el('div','n',(mine===i?'\\u2713 ':'')+r.name));l.appendChild(el('div','m',[r.cuisine,r.price,r.signature_dish?'try: '+r.signature_dish:''].filter(Boolean).join(' · ')));
inn.appendChild(l);inn.appendChild(el('div','c',String(p.counts[i])));d.appendChild(inn);if(!p.closed)d.onclick=()=>vote(i);o.appendChild(d)})}
async function load(){try{const r=await fetch(api);if(!r.ok)throw 0;render(await r.json())}catch(e){document.getElementById('t').textContent='Vote not found'}}
async function vote(i){localStorage.setItem('ih_name',nm.value);const r=await fetch(api+'/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voter_id:vid,name:nm.value,choice:i})});
const j=await r.json();if(r.ok){document.getElementById('e').textContent='';render(j)}else document.getElementById('e').textContent=j.detail||'Could not vote'}
let cur=null;function tick(){const c=document.getElementById('cd');if(!cur||cur.closed||!cur.ends_at){c.textContent='';return}
const ms=new Date(cur.ends_at)-Date.now();if(ms<=0){c.textContent='Time is up! Announcing the winner…';if(!tick.f){tick.f=1;setTimeout(load,800)}return}
const s=Math.floor(ms/1000);c.textContent='\\u23F1 Closes in '+(s>=3600?Math.floor(s/3600)+'h ':'')+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
load();setInterval(load,5000);setInterval(tick,1000);
</script></body></html>"""


@api_router.get("/polls/{poll_id}/page", response_class=HTMLResponse)
async def poll_page(poll_id: str):
    await load_poll(poll_id)
    return HTMLResponse(VOTE_PAGE.replace("__PID__", json.dumps(poll_id)))


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
