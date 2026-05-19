---
name: taiwan-open-data
description: Integrate Taiwan public open data sources — government APIs, live CCTV/traffic cameras, weather, and geographic data. Direct fetch patterns without browser dependency.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [taiwan, open-data, api, cctv, traffic, government]
    related_skills: [leaflet-map-dashboard, news-aggregator-workflow]
---

# Taiwan Open Data Integration

Access publicly available Taiwan government data sources — traffic cameras, weather, geographic data — via direct API calls.

## Core Principle

**Direct Fetch first** — use `curl` / Python `requests` / `urllib`.  
Avoid browser automation for data sources that expose structured APIs or static endpoints.

## Data Sources

### Traffic & Landmark CCTV

Taiwan has thousands of publicly accessible traffic cameras maintained by:

| Source | Coverage | Format | Authentication |
|--------|----------|--------|----------------|
| twipcam | 7,457+ cameras — highway, provincial road, scenic spots | JSON list + HLS/MJPEG streams | Free, no key needed |
| Highways Bureau (高公局) | Freeway CCTV (MJPEG) | MJPEG direct URL | Public |
| Highway Bureau (公路總局) | Provincial road CCTV | XML/JSON metadata | Public |

### twipcam API

The most comprehensive single source. Provides a JSON endpoint returning camera list with live stream URLs:

```
GET https://www.twipcam.com/api/v1/cameras
```

Response format (per camera):
```json
{
  "id": "string — unique identifier",
  "lat": 25.033,
  "lon": 121.565,
  "name": "Camera name/location description",
  "cam_url": "https://... HLS or MJPEG stream URL"
}
```

**Usage:**
```bash
# Fetch all cameras
curl -s https://www.twipcam.com/api/v1/cameras > cameras.json

# Filter by proximity to a location (via nearby API)
# https://www.twipcam.com/widget/v1/nearby?lat=25.033&lon=121.565
```

The stream URLs are typically HLS (`.m3u8`) for MPEG-TS or direct MJPEG. HLS streams can be played or processed with `ffmpeg`:

```bash
# Grab a single frame from an HLS stream
ffmpeg -i "$CAM_URL" -frames:v 1 -q:v 2 snapshot.jpg -y

# Continuous monitoring (grab frame every 30s)
while true; do
  ffmpeg -i "$CAM_URL" -frames:v 1 -q:v 2 "capture_$(date +%s).jpg" -y
  sleep 30
done
```

### Highway Bureau (高速公路局) CCTV

Freeway CCTV cameras accessible directly via MJPEG:

```
http://cctvnXX.freeway.gov.tw/vStream.php?pm=XXX,XXX,XX
```

Or via the newer HTTPS:
```
https://cctvs.freeway.gov.tw/live-view/mjpg/video.cgi?camera=XXX
```

Camera metadata is available as XML from government open data:
```
https://gist.github.com/141141/17cd95b9473e485dbeddc0ee0aa3fbd1
```

### Provincial Road CCTV (公路總局)

Provincial highway cameras as MJPEG streams:

```
http://117.56.180.1/T1-28K+500?resolution=CIF_352X288
```

Metadata (XML with camera IDs, coordinates, stake numbers):
- Highway Bureau API: `https://www.thb.gov.tw/api/GetAllExpresswayStakeSet`
- Interchange info: `https://www.thb.gov.tw/api/GetExpresswayInterchangeSet?expresswayId=XXX`

### Taipei City CCTV

```
https://cctv.bote.gov.taipei:8501/CCTV/XXX/4CIF
```

## Workflow: Getting Cameras Near a Location

1. Fetch full camera list from twipcam API
2. Filter by distance to target coordinates
3. Select best camera based on proximity + name relevance
4. Access the stream URL directly

```python
import json, math, urllib.request

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def get_nearby_cameras(lat, lon, radius_km=5):
    with urllib.request.urlopen("https://www.twipcam.com/api/v1/cameras") as r:
        cams = json.loads(r.read())
    nearby = []
    for c in cams:
        dist = haversine(lat, lon, c["lat"], c["lon"])
        if dist <= radius_km:
            c["distance_km"] = round(dist, 2)
            nearby.append(c)
    return sorted(nearby, key=lambda x: x["distance_km"])
```

## Integration with Hermes

To use camera data in a Hermes session:

```bash
# Terminal: fetch + filter
curl -s https://www.twipcam.com/api/v1/cameras | python3 -c "
import json, sys
data = json.load(sys.stdin)
# Filter for Taipei area
taipei = [c for c in data if 25.0 <= c['lat'] <= 25.15 and 121.45 <= c['lon'] <= 121.6]
print(json.dumps(taipei[:10], indent=2, ensure_ascii=False))
"
```

## Legal Considerations

- **Only legally accessible cameras**: Use government/public CCTV feeds. These are explicitly made available for public use.
- **Do NOT** access private IP cameras without authorization — this violates Taiwan's Criminal Code Article 315-1 (unlawful recording of non-public activities), punishable by up to 3 years imprisonment.
- **Shodan/Censys exposure**: Just because a camera is internet-facing without auth doesn't make it legal to access. Stick to feeds explicitly published by government agencies.

## References

- `references/twipcam-api-detail.md` — Extended API documentation for the twipcam service

## Pitfalls

### API stability
The twipcam API URL path is not consistently documented. If `api/v1/cameras` doesn't resolve, check the official docs at `https://www.twipcam.com/api/document` for the current endpoint.

### Stream format variability
Some cameras serve HLS (`.m3u8`), others serve direct MJPEG. `ffmpeg` handles both, but simple `<img>` tags only work with MJPEG. For HLS, use `<video>` with hls.js or `ffmpeg` CLI.

### Performance
Opening many HLS streams simultaneously (e.g., for a dashboard) is bandwidth-heavy. Each stream maintains a persistent connection. Limit concurrent streams to 3-5 for a typical consumer connection.

### Rate limiting
The twipcam API does not advertise rate limits, but be respectful — one request per few seconds for the full camera list is fine; don't poll it every second.

## Verification Checklist

- [ ] API endpoint returns valid JSON with camera list
- [ ] Coordinates are within expected range for Taiwan (21.9-25.3 lat, 119.3-122.0 lon)
- [ ] Stream URLs are accessible (return HTTP 200 or initiate streaming)
- [ ] `ffmpeg` can grab a frame from the stream (if stream processing is needed)
