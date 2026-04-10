import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel, Field

from zip_data import ZIP_IMPACT

load_dotenv()

ELECTRICITY_MAPS_BASE = "https://api.electricitymaps.com/v3/carbon-intensity"
ZONE = "US-SE-SOCO"

app = FastAPI(title="WattWatch ATL API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _georgia_solar_curve_g_per_kwh(hour_of_day: float) -> float:
    """~450 at midnight, ~280 at 1pm, ~480 at 8pm (gCO2eq/kWh)."""
    h = hour_of_day % 24

    def lerp(a: float, b: float, t: float) -> float:
        return a + (b - a) * t

    if h <= 13:
        return lerp(450, 280, h / 13)
    if h <= 20:
        return lerp(280, 480, (h - 13) / 7)
    return lerp(480, 450, (h - 20) / 4)


def mock_carbon_payload() -> dict:
    now = datetime.now(timezone.utc)
    history: list[float] = []
    for i in range(24):
        t = now - timedelta(hours=23 - i)
        hod = t.hour + t.minute / 60.0
        history.append(round(_georgia_solar_curve_g_per_kwh(hod), 1))
    hod_now = now.hour + now.minute / 60.0
    current = round(_georgia_solar_curve_g_per_kwh(hod_now), 1)
    return {
        "current": current,
        "unit": "gCO2eq/kWh",
        "history": history,
    }


def _extract_intensity(obj: dict) -> float | None:
    if obj is None:
        return None
    for key in ("carbonIntensity", "carbon_intensity", "value", "intensity"):
        v = obj.get(key)
        if isinstance(v, (int, float)):
            return float(v)
    data = obj.get("data")
    if isinstance(data, dict):
        return _extract_intensity(data)
    return None


def _parse_latest_json(data: dict) -> float | None:
    return _extract_intensity(data)


def _parse_history_json(data: dict) -> list[float] | None:
    if not isinstance(data, dict):
        return None
    raw = data.get("history") or data.get("data") or data.get("carbonIntensityHistory")
    if not isinstance(raw, list) or not raw:
        return None
    out: list[float] = []
    for item in raw:
        if isinstance(item, (int, float)):
            out.append(float(item))
        elif isinstance(item, dict):
            v = _extract_intensity(item)
            if v is not None:
                out.append(v)
    return out if out else None


async def fetch_carbon_from_api() -> dict | None:
    key = os.getenv("ELECTRICITY_MAPS_KEY", "").strip()
    if not key or key == "PASTE_YOUR_KEY_HERE":
        return None
    headers = {"auth-token": key}
    timeout = httpx.Timeout(12.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        latest_url = f"{ELECTRICITY_MAPS_BASE}/latest?zone={ZONE}"
        history_url = f"{ELECTRICITY_MAPS_BASE}/history?zone={ZONE}"
        latest_r = await client.get(latest_url, headers=headers)
        latest_r.raise_for_status()
        history_r = await client.get(history_url, headers=headers)
        history_r.raise_for_status()
        latest_data = latest_r.json()
        history_data = history_r.json()
        current = _parse_latest_json(latest_data)
        history = _parse_history_json(history_data)
        if current is None:
            return None
        if history is None or len(history) < 24:
            now = datetime.now(timezone.utc)
            history = []
            for i in range(24):
                t = now - timedelta(hours=23 - i)
                hod = t.hour + t.minute / 60.0
                history.append(round(_georgia_solar_curve_g_per_kwh(hod), 1))
        else:
            history = [round(float(x), 1) for x in history[-24:]]
        return {
            "current": round(float(current), 1),
            "unit": "gCO2eq/kWh",
            "history": history,
        }


@app.get("/api/carbon-intensity")
async def carbon_intensity():
    try:
        payload = await fetch_carbon_from_api()
        if payload is not None:
            return payload
    except Exception:
        pass
    return mock_carbon_payload()


DATACENTERS = [
    {
        "name": "QTS Atlanta",
        "county": "Douglas County",
        "lat": 33.9940,
        "lon": -84.7427,
        "capacity_mw": 450,
        "pue": 1.45,
        "renewable_pct": 12,
    },
    {
        "name": "Switch Atlanta",
        "county": "Fulton County",
        "lat": 33.7490,
        "lon": -84.3880,
        "capacity_mw": 280,
        "pue": 1.38,
        "renewable_pct": 18,
    },
    {
        "name": "Compass Datacenters",
        "county": "Douglas County",
        "lat": 33.7749,
        "lon": -84.5549,
        "capacity_mw": 180,
        "pue": 1.52,
        "renewable_pct": 8,
    },
    {
        "name": "CyrusOne Atlanta",
        "county": "Gwinnett County",
        "lat": 33.9526,
        "lon": -84.0799,
        "capacity_mw": 320,
        "pue": 1.41,
        "renewable_pct": 15,
    },
    {
        "name": "Equinix AT1",
        "county": "Midtown Atlanta",
        "lat": 33.7886,
        "lon": -84.3902,
        "capacity_mw": 95,
        "pue": 1.35,
        "renewable_pct": 22,
    },
    {
        "name": "Digital Realty ATL",
        "county": "Fulton County",
        "lat": 33.8486,
        "lon": -84.4169,
        "capacity_mw": 210,
        "pue": 1.48,
        "renewable_pct": 10,
    },
    {
        "name": "Microsoft Azure",
        "county": "Douglas County",
        "lat": 33.9540,
        "lon": -84.7427,
        "capacity_mw": 500,
        "pue": 1.32,
        "renewable_pct": 35,
    },
    {
        "name": "Google Atlanta",
        "county": "Fulton County",
        "lat": 33.7765,
        "lon": -84.3902,
        "capacity_mw": 150,
        "pue": 1.28,
        "renewable_pct": 67,
    },
]


@app.get("/api/atlanta-datacenters")
async def atlanta_datacenters():
    return DATACENTERS


def resolve_zip_impact(zip_code: str) -> dict:
    key = zip_code.strip()
    if key not in ZIP_IMPACT:
        key = "30318"
    return ZIP_IMPACT[key]


def resolve_zip_impact_with_key(zip_code: str) -> tuple[dict, str]:
    """Return (row, resolved_zip) — unknown zips fall back to 30318."""
    key = zip_code.strip()
    if key not in ZIP_IMPACT:
        return ZIP_IMPACT["30318"], "30318"
    return ZIP_IMPACT[key], key


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_json_object(raw_text: str) -> dict | None:
    """Parse a JSON object from model output; tolerate leading/trailing noise."""
    text = _strip_code_fence(raw_text.strip())
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    while start != -1:
        try:
            obj, _end = json.JSONDecoder().raw_decode(text[start:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        start = text.find("{", start + 1)
    return None


def _bullets_from_parsed_obj(obj: dict) -> list[str] | None:
    """Accept several key shapes; return 1–3+ strings or None."""
    raw_list = None
    if "bullets" in obj and isinstance(obj["bullets"], list):
        raw_list = obj["bullets"]
    elif "ai_bullets" in obj and isinstance(obj["ai_bullets"], list):
        raw_list = obj["ai_bullets"]
    elif all(f"bullet_{i}" in obj for i in (1, 2, 3)):
        raw_list = [obj["bullet_1"], obj["bullet_2"], obj["bullet_3"]]

    if raw_list is None:
        return None
    strings: list[str] = []
    for x in raw_list:
        if isinstance(x, str) and x.strip():
            strings.append(x.strip())
        elif isinstance(x, (int, float)):
            strings.append(str(x))
    if not strings:
        return None
    while len(strings) < 3:
        strings.append(
            "Regional data center load continues to shape local grid costs and reliability.",
        )
    return strings[:3]


def _parse_groq_structured_bullets(raw_text: str) -> list[str]:
    obj = _extract_json_object(raw_text)
    if obj is None:
        raise ValueError("Model did not return valid JSON")
    bullets = _bullets_from_parsed_obj(obj)
    if bullets is None:
        raise ValueError('JSON must include a "bullets" array of 3 strings')
    return bullets


def groq_zip_impact_bullets(
    *,
    neighborhood_name: str,
    increase_usd: int,
    datacenter_name: str,
    distance_miles: float,
    datacenter_mw: float,
) -> list[str]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "PASTE_YOUR_GROQ_KEY_HERE":
        raise ValueError(
            "GROQ_API_KEY is not configured. Set it in backend/.env",
        )

    system = (
        "You respond only with valid JSON (no markdown, no code fences, no commentary). "
        'The JSON must be a single object with exactly one key, "bullets", whose value is an array '
        "of exactly 3 strings. Each string is one short plain-English bullet for an Atlanta resident: "
        "specific, human, empathetic; start each string with one emoji; under 25 words per string. "
        'Example shape: {"bullets": ["emoji …", "emoji …", "emoji …"]}'
    )
    user = (
        "Given this data: "
        f"neighborhood={neighborhood_name}, monthly bill increase=${increase_usd}/month since 2022, "
        f"nearest data center={datacenter_name} at {distance_miles} miles consuming {datacenter_mw} MW — "
        "write exactly 3 bullets as specified in your instructions. Output only the JSON object."
    )

    client = Groq(api_key=api_key)
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=500,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        raise ValueError(f"Groq API error: {e}") from e

    choice = completion.choices[0] if completion.choices else None
    raw = (choice.message.content if choice and choice.message else "") or ""
    raw = raw.strip()
    if not raw:
        raise ValueError("Empty response from Groq")
    return _parse_groq_structured_bullets(raw)


class ZipImpactAIRequest(BaseModel):
    zip: str = Field(..., min_length=1, max_length=12)


@app.get("/api/zip-impact/{zip}")
async def zip_impact(zip: str):
    return resolve_zip_impact(zip)


@app.post("/api/zip-impact-ai")
async def zip_impact_ai(body: ZipImpactAIRequest):
    row, resolved_zip = resolve_zip_impact_with_key(body.zip)
    neighborhood_name = row["area"]
    bill_2022 = int(row["bill_before_usd"])
    bill_current = int(row["bill_after_usd"])
    increase = bill_current - bill_2022
    datacenter_name = row["nearest_datacenter"]
    distance_miles = float(row["distance_mi"])
    datacenter_mw = float(row["datacenter_capacity_mw"])

    try:
        ai_bullets = await asyncio.to_thread(
            groq_zip_impact_bullets,
            neighborhood_name=neighborhood_name,
            increase_usd=increase,
            datacenter_name=datacenter_name,
            distance_miles=distance_miles,
            datacenter_mw=datacenter_mw,
        )
    except ValueError as e:
        msg = str(e)
        code = 503 if "GROQ_API_KEY" in msg else 502
        raise HTTPException(status_code=code, detail=msg) from e

    return {
        "neighborhood_name": neighborhood_name,
        "bill_2022": bill_2022,
        "bill_current": bill_current,
        "increase": increase,
        "datacenter_name": datacenter_name,
        "distance_miles": distance_miles,
        "datacenter_mw": datacenter_mw,
        "ai_bullets": ai_bullets,
        "resolved_zip": resolved_zip,
    }
