# card-fit relay

Thin SMS relay for card-fit. Receives pre-composed SMS digests from the frontend, holds them until scheduled time, sends via Twilio, deletes immediately.

## What it does

- Receives: `{ token, phone, message, send_at }` — all composed client-side
- Stores transiently in memory until `send_at`
- Sends via Twilio, then deletes the record
- Logs nothing (no message content, no phone numbers)

See [SECURITY.md](../SECURITY.md) for the full trust model.

## Setup

```bash
cd relay
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env with your Twilio credentials and RELAY_SECRET
```

## Run locally

```bash
uvicorn main:app --reload
```

## Deploy (Render)

1. Create a new Web Service on [Render](https://render.com)
2. Root directory: `relay`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from `.env.example`

## Self-hosting

The relay is designed to be self-hostable. Any platform that can run a Python ASGI app works (Railway, Fly.io, a VPS, etc.).

## Swap SMS provider

Edit `sms_provider.py` only — the `send_sms(phone, message)` interface is the only contract.
