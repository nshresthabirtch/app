# I'm Hungry — PRD

## Original problem statement
App called I'm Hungry. Say "I'm hungry for soup/pizza/XYZ" out loud → uses location and gives multiple eating options. Or say you're travelling somewhere and you'll be hungry there → creates a future calendar event (breakfast/lunch/dinner) with recommendations. User asked for extra simple, delightful features.

## User choices
- Voice: OpenAI speech-to-text (gpt-4o-mini-transcribe) via Emergent LLM key
- Recommendations: GPT-5.5 AI suggestions (names may not always be accurate)
- Calendar: native expo-calendar + Google Calendar template link + trips saved in app
- Style: warm, appetizing, food-forward

## Architecture
- Backend FastAPI + MongoDB: /api/hungry (intent parse + recs), /api/transcribe, /api/trips CRUD, /api/favorites, /api/history
- Frontend Expo Router: tabs (Eat, Trips, Saved) + trip/[id] detail; NativeTabs on iOS 26+
- expo-audio recording with silence auto-stop, expo-location, expo-calendar

## Implemented (Jun 2026)
- Group Food Vote: start a vote from results or a trip, share a link friends open in any browser (no app), live tallies, end vote → winner with directions; votes listed in Saved tab
- Voice + text "I'm hungry for…", craving chips, budget toggle, Surprise-me dice
- AI picks near location: cards with Let's go (Maps), save, share
- Travel intent detection by voice/text → trip saved → detail with device calendar / Google Calendar
- Trip planner form (destination, date, meal, craving)
- Saved favorites + "Crave again" history
- Tested: backend 15/15, frontend core flows pass

## Backlog
- P1: Real place data (Google Places) for verified restaurants + photos
- P1: Dietary preferences (vegan, halal, gluten-free) stored per user
- P2: User accounts / sync, group "where should we eat" voting
