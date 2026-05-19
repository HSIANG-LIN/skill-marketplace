---
name: leaflet-map-dashboard
description: Build an interactive map dashboard with Leaflet, CartoDB dark tiles, sidebar, filters, and GitHub Pages deployment.
version: 1.0.0
tags: [leaflet, map, dashboard, github-pages, visualization, geocoding, nominatim]
---

# Leaflet Map Dashboard

Build a single-page interactive map dashboard with search, city filter, and GitHub Pages deployment. Reusable pattern proven across restaurant-dashboard and scenic-spots-dashboard projects.

## Architecture

```
project-root/
├── index.html          # Single-page app (Leaflet + all logic)
├── spots.json           # Structured data (or restaurants.json, etc.)
└── README.md            # Optional
```

Zero build step — pure static files, deployable to GitHub Pages.

## Data Format

```json
[
  {
    "name": "七星山主峰",
    "address": "台北市北投區陽明山竹子湖路1-20號",
    "year": 2024,
    "description": "台北市最高峰 1120m，俯瞰台北盆地",
    "source": "自然景點精選",
    "lat": 25.1700,
    "lng": 121.5475,
    "city": "台北市",
    "image": "https://images.unsplash.com/photo-1589308078059-a31f349526c2?q=80&w=800&auto=format&fit=crop"
  }
]
```

Core fields: `name`, `address`, `year`, `description`, `source`, `lat`, `lng`, `city`.

**Optional `image` field**: URL to a representative photo (e.g., Unsplash direct photo link). Use `?q=80&w=800&auto=format&fit=crop` for good performance. If absent, a type-based emoji placeholder is shown instead (see Dynamic Marker Icons section).

**Image sourcing reality**: Getting accurate real photos for all items is the hardest part of a dashboard. Wikipedia API yields only ~16-20% usable images. Browser-based Bing extraction works (see Image Sourcing section below) but costs ~30s per spot. For large datasets (50+ spots), four valid strategies ranked by reliability:
1. **User-provided social media links** (best) — user sends IG/Flickr post URLs, you extract and embed. Pattern from restaurant-dashboard: zero wrong-image risk, guaranteed accurate. Recommended when user cares about photo correctness.
2. **Fix only the clearly wrong images** (compromise) — identify the most egregious mismatches (e.g., temple photo for a mountain) and fix those manually via Bing/browser. Leave the rest.
3. **Remove images entirely** — clean, honest, zero-maintenance. The dashboard works perfectly without images, using emoji placeholders instead.
4. **Automated batch** via scripts/fetch_wikipedia_images.py (low yield — ~16-20% — needs manual cleanup)

Choose based on the user's tolerance for image-quality work. If they give up on images or prefer IG-link sourcing, simply strip the `image` and `image_source` fields from all entries.

## HTML Structure (index.html)

### Map Setup

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script>
  map = L.map('map');
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);
</script>
```

### Sidebar Layout

Use flexbox: `#container { display: flex; height: 100vh; }` with `#sidebar { width: 350px; }` and `#map { flex-grow: 1; }`.

Sidebar components (top to bottom):
1. **Header**: Title + stats line ("N 個景點 · M 縣市")
2. **Controls**: Search input + city filter `<select>`
3. **Scrollable list**: Cards for each item

### Sidebar Card Component (with Image)

Two variants — image-enabled (recommended for scenic/concept dashboards) and text-only (for dense data).

**Image card variant:**
```html
<div class="spot-card">
  <!-- Image at top (conditional) -->
  <img class="spot-card-img" src="${spot.image}" alt="${spot.name}" loading="lazy">
  <div class="spot-card-body">
    <h3>${spot.name}</h3>
    <div class="sub">${spot.city} · ${spot.year}</div>
    <div class="desc">${spot.description}</div>
    <div class="meta">
      <span class="tag">${spot.city}</span>
      <a href="..." class="nav-link">🗺️ 導航</a>
    </div>
  </div>
</div>
```

Image card CSS:
```css
.spot-card { background: var(--card-bg); border-radius: 12px; margin-bottom: 12px; cursor: pointer; overflow: hidden; border: 1px solid var(--border); transition: all 0.25s ease; }
.spot-card:hover { border-color: var(--accent); transform: translateX(4px); box-shadow: 0 0 20px var(--accent-glow); }
.spot-card-img { width: 100%; height: 140px; object-fit: cover; display: block; background: #222; }
.spot-card-img-placeholder { width: 100%; height: 140px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a2e, #16213e); font-size: 2.5rem; }
.spot-card-body { padding: 14px; }
.spot-card-body .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 0.7rem; }
```

**Text-only card variant** (original, for dense data lists):
```html
<div class="spot-card" style="border-left: 4px solid ${color}">
  <h3>${spot.name}</h3>
  <div class="info">${spot.city} | ${spot.year}</div>
  <div class="meta">
    <span>📍 ${spot.address}</span>
    <a href="..." class="nav-link">🗺️ 導航</a>
  </div>
</div>
```

- Cards are clickable: `onclick = () => { map.setView([lat, lng], 15); marker.openPopup(); }`
- **Color index stability**: `spots.indexOf(spot)` works for initial render but breaks on re-sort. Use `filtered.indexOf(spot)` in filter handlers.

### Dynamic Marker Icons by Type

Automatically switch icons based on spot name AND description keywords (better than name-only matching):

```javascript
function spotType(spot) {
  const n = spot.name;
  const d = spot.description;
  const txt = n + ' ' + d;
  if (txt.includes('瀑布') || txt.includes('瀑布群')) return { icon: '💧', label: '瀑布' };
  if (txt.includes('湖') || txt.includes('池') || txt.includes('潭')) return { icon: '🏞️', label: '湖泊' };
  if (txt.includes('海') || txt.includes('海岸') || txt.includes('濕地') || txt.includes('燈塔')
      || txt.includes('角') || txt.includes('鼻') || txt.includes('鼻頭')
      || txt.includes('谷') || n.includes('和平島')) return { icon: '🌊', label: '海岸' };
  if (txt.includes('茶園') || txt.includes('梯田')) return { icon: '🍃', label: '茶園' };
  if (txt.includes('山') || txt.includes('峰') || txt.includes('嶺')
      || txt.includes('岩') || txt.includes('崖') || txt.includes('岳')
      || txt.includes('高地') || txt.includes('林')) return { icon: '🏔️', label: '山林' };
  return { icon: '🏔️', label: '山林' };
}

function spotIcon(spot) {
  const info = spotType(spot);
  return L.divIcon({
    className: 'custom-marker',
    html: `<span>${info.icon}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}
```

**Why name + description**: A spot named "望幽谷" (coastal valley) won't match coastal keywords on name alone, but adding its description text catches it. Always pass the full spot object, not just `spot.name`.

**Pitfall**: `spotIcon` now takes the **whole spot object**, not just `spot.name`. Calling `spotIcon(spot.name)` will pass a string and fail because strings don't have a `.description` property. Always call `spotIcon(spot)`.

For restaurants/venues, use alternatives: 🍽️, 🍜, ☕, 🛍️ — adjust the `spotType` function's keywords accordingly.

**Dynamic placeholder emoji**: When a spot has no image, use the type-based emoji instead of a hardcoded icon:

```javascript
const typeInfo = spotType(spot);
const imgHtml = spot.image
  ? `<img class="popup-img" src="${spot.image}" alt="${spot.name}" loading="lazy">`
  : `<div class="popup-img-placeholder">${typeInfo.icon}</div>`;
```

Same pattern applies to sidebar card placeholders — use `${typeInfo.icon}` for richer visual hints.

### Marker with Image Popup

For image-enabled popups, build the HTML conditionally (see dynamic placeholder emoji pattern above):
const popupHtml = `
  ${imgHtml}
  <div class="popup-body">
    <h3>${spot.name}</h3>
    <p class="desc">${spot.description}</p>
    <p>📍 ${spot.address}</p>
    <p>📅 ${spot.year}</p>
  </div>
  <div class="popup-footer">
    <span>📰 ${spot.source}</span>
    <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank">🗺️ 導航</a>
  </div>
`;
marker.bindPopup(popupHtml, { maxWidth: 300, className: '' });
```

Popup CSS:
```css
.leaflet-popup-content-wrapper {
  background: var(--card-bg); color: var(--text); border-radius: 12px;
  border: 1px solid var(--border); padding: 0; overflow: hidden;
}
.leaflet-popup-content { margin: 0; width: 280px !important; }
.popup-img { width: 100%; height: 160px; object-fit: cover; display: block; }
.popup-img-placeholder {
  width: 100%; height: 160px; display: flex;
  align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e); font-size: 3rem;
}
.popup-body { padding: 16px; }
.popup-body h3 { margin: 0 0 6px 0; font-size: 1.1rem; color: var(--accent); }
.popup-footer {
  padding: 12px 16px; border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; font-size: 0.75rem;
  color: var(--text-dim);
}
```

### Initial Map View (fitBounds)

```javascript
const bounds = L.latLngBounds(spots.map(s => [s.lat, s.lng]));
map.fitBounds(bounds, { padding: [50, 50] });
```

**Do NOT** use `map.setView(firstSpot)` — that only shows one location. Always use `fitBounds`.

### City Filter (Dynamic)

```javascript
function populateFilters() {
  const cities = [...new Set(spots.map(s => s.city))].sort();
  const filter = document.getElementById('city-filter');
  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city; opt.textContent = city;
    filter.appendChild(opt);
  });
}
```

### Filter Logic (Search + City)

```javascript
function filterSpots() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const cityTerm = document.getElementById('city-filter').value;
  const filtered = spots.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm) || s.address.toLowerCase().includes(searchTerm);
    const matchesCity = cityTerm === "" || s.city === cityTerm;
    return matchesSearch && matchesCity;
  });
  renderMarkers(filtered);
  renderList(filtered);
  updateStats(filtered);
}

function updateStats(data) {
  const cities = [...new Set(data.map(s => s.city))].sort();
  document.getElementById('sidebar-stats').textContent = `${data.length} 個景點 · ${cities.length} 縣市`;
}
```

### Dark Theme CSS

```css
:root {
  --bg-color: #1a1a1a;
  --sidebar-bg: #252525;
  --text-color: #e0e0e0;
  --accent-color: #e94560;
  --card-bg: #333;
}
body, html { margin: 0; padding: 0; height: 100%; font-family: 'Segoe UI', ...; background: var(--bg-color); color: var(--text-color); overflow: hidden; }
input, select { padding: 8px; border-radius: 4px; border: 1px solid #444; background: #111; color: white; width: 100%; box-sizing: border-box; }
.spot-card { background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 12px; cursor: pointer; border-left: 4px solid var(--accent-color); }
.spot-card:hover { transform: translateX(5px); background: #444; }
.leaflet-popup-content-wrapper { background: var(--card-bg); color: var(--text-color); border-radius: 8px; }
.leaflet-popup-tip { background: var(--card-bg); }
.nav-link { color: #4ecdc4; text-decoration: none; font-weight: bold; }
```

### Responsive Design

Add a `@media` query for mobile (sidebar stacks below map):

```css
@media (max-width: 768px) {
  #sidebar { width: 100%; height: 45vh; }
  #container { flex-direction: column-reverse; }  /* map on top */
  #map { height: 55vh; }
}
```

This keeps the map visible at the top when users open the page on a phone. The sidebar becomes a scrollable list below it.

### Theme Customization

Change the visual theme via CSS variables. Examples:

- **Red (default)**: `--accent: #e94560; --bg: #1a1a1a;`
- **Nature/Emerald**: `--accent: #10b981; --bg: #0f0f12; --accent-glow: rgba(16, 185, 129, 0.3);`
- **Ocean/Blue**: `--accent: #3498db; --bg: #0f172a;`
- **Gold/Warm**: `--accent: #f59e0b; --bg: #1c1917;`

Update the header gradient to match:
```css
.sidebar-header h2 {
  background: linear-gradient(135deg, var(--accent), lighter-shade);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
```

## Geocoding (Data Preparation)

### Nominatim (for accurate addresses)

```python
import urllib.request, urllib.parse, json, time

def geocode(address):
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(address + ' 台灣')}&format=json&limit=1"
    req = urllib.request.Request(url, headers={'User-Agent': 'HermesAgent/1.0'})
    results = json.loads(urllib.request.urlopen(req).read())
    return (float(results[0]['lat']), float(results[0]['lon'])) if results else None
```

**Critical pitfalls:**
- **Must set `User-Agent` header** — Nominatim returns 403 without it (the API now enforces this)
- **Rate limit**: ~1 request/second. Add `time.sleep(1.5)` between calls
- **Taiwan address coverage**: Nomination has poor coverage for Taiwanese addresses. Use three-level fallback:
  1. Full address (most specific)
  2. Street/road name only (remove door number)
  3. City district center (e.g., "新北市鶯歌區")
- **If Nominatim 403 persists**: Switch immediately to city-center coordinates as fallback. Don't retry more than 2 times per address.

### City-Center Fallback (When Nominatim Fails)

When Nominatim returns 403 or empty results for Taiwan addresses, use pre-known city centers:

| City | lat | lng |
|------|-----|-----|
| 台北市 | 25.033 | 121.5654 |
| 新北市 | 25.017 | 121.467 |
| 桃園市 | 24.994 | 121.3045 |
| 新竹市 | 24.814 | 120.967 |
| 苗栗縣 | 24.620 | 120.800 |
| 台中市 | 24.1477 | 120.6736 |
| 彰化縣 | 24.080 | 120.538 |
| 基隆市 | 25.128 | 121.742 |
| 宜蘭縣 | 24.733 | 121.733 |

For better accuracy, use known landmark coordinates for specific spots when the exact address is known (e.g., "台北市信義區市民大道五段50號" = 25.0453, 121.5650).

## GitHub Pages Deployment

```bash
# 1. Create repo
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d '{"name":"<repo-name>","description":"<description>","public":true}'

# 2. Init + push
cd ~/workspace/hermes_project/<project>/
git init
git add index.html spots.json
git commit -m "feat: initial map dashboard"
git remote add origin https://$GITHUB_TOKEN@github.com/<user>/<repo>.git
git branch -M main
git push -u origin main
git remote set-url origin https://github.com/<user>/<repo>.git

# 3. Enable Pages
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/<user>/<repo>/pages \
  -d '{"source":{"branch":"main","path":"/"}}'

# URL: https://<user>.github.io/<repo>/
```

Wait ~1 minute for the initial Pages build, then verify:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://<user>.github.io/<repo>/index.html"
# Should return 200
```

## Data Collection Sources

For Taiwan attractions/restaurants data, effective search patterns:
- `"2025 新景點 台北"` or `"2026 新開幕 台中"`
- `"2026全台14大必去新景點"` (Yahoo/食尚玩家 articles are gold)
- `"連假別再問去哪！2026全台11個新景點"` (TVBS 食尚玩家)
- `"台北新景點13大推介"` (HK01 — detailed location info)
- `"台灣景點2026｜全台12大最新打卡好去處"` (Cosmopolitan)
- `"2026 台北景點哪裡好玩"` (Trip.com)

Extract using `web_extract(url)` then manually compile into JSON format.

## Image Sourcing: Replacing Placeholder Photos

When users report that dashboard images are generic stock photos (e.g., Unsplash) rather than real photos of the locations, use the **Wikipedia API** to find authentic images. This technique works best for well-known natural/geographic features (mountains, lakes, waterfalls, trails) that have Wikipedia pages.

### Strategy (in practice: much lower yield than expected)

**Reality check**: The Wikipedia API (`prop=pageimages`) only returns representative images for ~16-20% of Chinese Wikipedia pages. The `prop=images` alternative picks up SVGs, disambiguation icons, and Commons logos as "first images." Automated image sourcing for 50 spots typically yields only ~8-10 usable images.

**Practical approach**: Use a multi-phase strategy. Start with Wikipedia for easy wins, then fall back to targeted browser-based extraction for the remaining spots. For large datasets (50+ spots), a pragmatic approach is to **fix only the clearly wrong images** (e.g., temple photo for a mountain, Christmas market for a waterfall) rather than trying to replace all images perfectly.

1. **Primary: Chinese Wikipedia API** — Low yield (~16%) but fast and free. Hit rate varies by type: well-known peaks/waterfalls are most likely to have pageimages; minor trails, platforms, and viewpoints generally don't.
2. **Fallback A: Browser-based Bing Images** — Works reliably for any spot with a name. Slow (~30s per spot) but always finds real photos.
3. **Fallback B: Web search** — For spots without Wikipedia pages.

### Wikipedia API Workflow

```python
import json, os, time, urllib.request, urllib.parse

API_BASE = "https://zh.wikipedia.org/w/api.php"

def wiki_api(params):
    params["format"] = "json"
    params["origin"] = "*"
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YourApp/1.0 (your@email.com)"}  # ← CRITICAL: Wikipedia 403 without User-Agent
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

# Step 1: Search for the spot on Chinese Wikipedia
def search_wikipedia(spot_name, city=""):
    data = wiki_api({
        "action": "query", "list": "search",
        "srsearch": f"{spot_name} {city}", "srlimit": 5, "srprop": ""
    })
    results = data.get("query", {}).get("search", [])
    if not results:
        # Fallback: spot name only
        data = wiki_api({
            "action": "query", "list": "search",
            "srsearch": spot_name, "srlimit": 3, "srprop": ""
        })
        results = data.get("query", {}).get("search", [])
    return results[0] if results else None

# Step 2: Get the page's main image
def get_pageimage(pageid):
    data = wiki_api({
        "action": "query", "prop": "pageimages",
        "pageids": pageid, "pithumbsize": 800
    })
    page = data.get("query", {}).get("pages", {}).get(str(pageid), {})
    thumb = page.get("thumbnail")
    return thumb["source"] if thumb else None
```

**Rate limit**: Add `time.sleep(0.3)` between API calls. Wikipedia is generous but don't spam.

#### Wikimedia API Silent Failures & SVG/Icon Pollution

**Silent empty responses**: The Wikimedia API can return empty/incomplete responses (no `query` key at all) under load, without HTTP errors. This usually happens after 5-10 rapid-fire sequential calls. Mitigation:

```python
def safe_wiki_image(pageid, retries=2):
    for attempt in range(retries):
        data = wiki_api({
            "action": "query", "prop": "pageimages" if attempt == 0 else "images",
            "pageids": pageid,
            "pithumbsize": 800 if attempt == 0 else None
        })
        if not data or "query" not in data:
            time.sleep(1.0)  # back off and retry
            continue
        if attempt == 0:  # pageimages
            page = data.get("query", {}).get("pages", {}).get(str(pageid), {})
            thumb = page.get("thumbnail")
            if thumb:
                return thumb["source"]
        else:  # images fallback
            pages = data.get("query", {}).get("pages", {})
            images = pages.get(str(pageid), {}).get("images", [])
            # Filter out SVGs, logos, icons
            real_images = [
                i["title"] for i in images
                if not i["title"].endswith(".svg")
                and not any(x in i["title"].lower() for x in ["logo", "icon", "emoji", "star_", "map_"])
                and i["title"].endswith((".jpg", ".jpeg"))
            ]
            if real_images:
                img_title = real_images[0].replace("File:", "File:")
                # Convert to URL: https://commons.wikimedia.org/wiki/Special:FilePath/{title}
                return f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(img_title.replace('File:', ''))}?width=800"
        time.sleep(0.5)
    return None
```

**SVG/Icon pollution with `prop=images`**: When falling back to `prop=images`, the first 5-10 results are usually SVGs (Commons-logo.svg, Wikipedia-logo.png, map icons, star rating images). You MUST filter them out — the filter pattern above should skip anything that isn't a `.jpg`/`.jpeg` file and anything containing keywords like `logo`, `icon`, `emoji`.

**Wikimedia Commons direct API has separate rate limits**: The Commons API (https://commons.wikimedia.org/w/api.php) returns strict HTTP 429 when rate-limited. Use longer delays (1.0s+) and separate User-Agent.

### Handling Wrong Matches

Wikipedia search sometimes matches the **wrong page** for ambiguous names:

| Spot | Wrong Match | Why |
|------|-------------|-----|
| 金面山剪刀石 (台北) | 臺南水仙宮 (台南廟) | "金面" matched "金面..." in Tainan |
| 碧山露營場天空步道 (內湖) | 陳華 (歌手) | "碧" matched singer's stage name |
| 鱷魚島觀景平台 (坪林) | 觀景山 (中國) | Generic description match |

**Fix strategy:** Pass more specific search terms when the first result is clearly wrong:
```python
specific_searches = {
    "金面山剪刀石": ["金面山 內湖", "金面山步道"],
    "碧山露營場天空步道": ["碧山巖 台北", "碧山露營場"],
}
```

### Spots Without Wikipedia Pages (~20%)

For smaller/lesser-known spots, Wikipedia has no page or no image. Fallback to **web search** + **browser-based blog extraction**:

```python
from hermes_tools import web_search
result = web_search(f"{spot_name} site:.com OR site:.tw 風景 照片", limit=3)
```

#### Browser-Based Image Extraction from Blog Posts

When you find a travel blog post with real photos, use the browser tool to extract image URLs. `web_extract` only returns text content (no `<img>` tags), so you must use the browser directly:

1. **Navigate** to the blog post:
   ```
   browser_navigate(url="https://example.com/blog-post-about-scenic-spot")
   ```

2. **Extract images via browser console** — query for content images (not ads/sidebars/avatars):
   ```js
   // General selector — try article, .entry-content, .post-content, main img first
   Array.from(document.querySelectorAll('article img, .entry-content img, main img, .post-content img'))
     .filter(i => i.naturalWidth > 200)
     .map(i => ({src: i.src || i.getAttribute('data-src') || i.getAttribute('data-lazy-src'), alt: i.alt, w: i.naturalWidth}))
     .slice(0, 15)
   ```

3. **Scroll down for lazy-loaded images**: Some blogs lazy-load images. After scrolling, run the query again.

4. **Pick the best photo**: Usually the first featured image or a landscape-oriented scenic shot. Avoid portrait/selfie photos.

5. **Update the JSON** and add `image_source` for provenance tracking.

**Common blog selector patterns** (the `querySelectorAll` selector to try):

| Blog Platform | Reliable Selector |
|---------------|-------------------|
| WordPress (anise.tw, journey.tw, jamesdiscover.tw) | `article img` or `.entry-content img` |
| Pixnet (rose286866.pixnet.net) | `table img` (old layout) |
| UDN Blog (blog.udn.com) | `img` (filter out avatars/icons) |
| vocus.cc | `article img` or `div[class*="content"] img` |
| Margaret.tw | `.post-content img` or `article img` |
| Cold91.com | `figure img` or `.entry-content img` |

**Filter: exclude non-content images**:
```js
// Exclude avatars, logos, icons, ad images
i.naturalWidth > 300 && !i.src.includes('logo') && !i.src.includes('avatar') && !i.src.includes('icon')
```

**Handling Cloudflare protection**: Some Taiwanese blogs use Cloudflare (maggieblog.tw, duringmyjourney.com). Browser can't bypass these — skip to alternative blog posts. vocus.cc and pixnet.net are usually accessible.

**Existing blog image sourcing reference**: See `references/blog-image-sources.md` for a real-world collection of blog URLs and images used in the scenic-spots-dashboard project.

### Browser-Based Bing Images Extraction

When both Wikipedia and blog posts fail, **Bing Image Search via browser** is the most reliable fallback. It always finds real photos for any named spot, at the cost of ~30s per spot.

**Workflow** (one spot at a time):

1. Navigate to Bing Images:
   ```
   browser_navigate(url="https://www.bing.com/images/search?q=金面山+剪刀石&first=1")
   ```

2. Wait ~3-5 seconds for images to load, then extract via browser console:
   ```js
   Array.from(document.querySelectorAll('a[class*="iusc"]'))
     .map(a => {
       try {
         const d = JSON.parse(a.getAttribute('M'));
         return { url: d.murl, t: d.t, w: d.width, h: d.height };
       } catch(e) { return null; }
     })
     .filter(x => x && x.w > 400 && x.h > 300)
     .slice(0, 10)
   ```

3. Pick the best photo — typically the 2nd or 3rd result is more reliable than the 1st (sponsored). Prefer landscape images with `w/h > 1.0`.

4. Scroll down for more results (Bing lazy-loads):
   ```
   browser_scroll(direction="down")
   ```
   Then re-run the extraction query.

**Critical pitfalls**:
- **Bing's `a[class*="iusc"]` selector** is the only reliable way to extract image URLs. The `murl` field contains the direct image URL; `t` is the title; `w`/`h` are dimensions.
- **Sponsored results** (1st position) may be irrelevant stock photos — skip them.
- **~30s per spot** — not suitable for batch processing 50+ spots in one session. Best for fixing the ~5-10 clearest wrong-image cases.
- **Bing may redirect to Bing.com/captcha** if too many automated requests are detected. If you see a captcha page, wait a few minutes before trying again.
- **Alternative for batch**: For small batches (3-5 spots), this is the most efficient method. For larger batches (9+ spots), it's still viable at ~30s/spot — see `references/blog-image-sources.md` for a batch example of 9 spots fixed in one session.

**健行筆記 as primary source**: In practice, `cdntwrunning.biji.co` (健行筆記) accounts for ~75% of Bing search results for Taiwan hiking/outdoor spots. When extracting from Bing, prefer results from this domain — they're consistently high-quality scenic photos taken by real hikers.

### Updating the Data File

Once you have real image URLs, replace the `image` field in your JSON data and add an `image_source` field for provenance tracking:

```json
{
  "name": "七星山主峰",
  "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Chihsingshan%2C_Tatun_volcanoes.jpg/960px-...jpg",
  "image_source": "Wikipedia: 七星山 (臺北市)"
}
```

The script `scripts/fetch_wikipedia_images.py` automates this batch process — it searches all spots, fetches real images, and updates the JSON file in one run.

## Verification Checklist

- [ ] `data` file (spots.json/restaurants.json) has valid JSON
- [ ] All entries have non-null lat/lng
- [ ] index.html loads without JS console errors
- [ ] Search and city filter work together
- [ ] Map `fitBounds` shows all markers initially
- [ ] Clicking a sidebar card centers map + opens popup
- [ ] Popup shows: name, address, year, description, source, Google Maps nav link
- [ ] GitHub Pages returns HTTP 200
- [ ] `git remote set-url` token stripped after push

## Pitfalls

### Nominatim & Geocoding

- **Nominatim 403**: Always set `User-Agent` header. If 403 persists, use city-center fallback immediately.
- **Taiwan Nominatim coverage**: Taiwanese addresses are poorly covered. Use district-level or city-center fallback rather than retrying.
- **Subagent data quality**: `delegate_task` with gemma-4-26b for data research may produce wrong coordinates, wrong city assignments, or generic descriptions. Always validate and fix manually rather than trusting subagent output blindly. Use verified coordinates from known sources.

### JavaScript Variable Naming Consistency (CRITICAL)

The `spotIcon()` function assigns markers based on name keywords. **Declaring and using a different variable name silently crashes all rendering** — no markers, no cards, no stats, no fitBounds:

```javascript
// ❌ BROKEN — declares 'hasWaterfall' but references 'isWaterfall'
function spotIcon(name) {
  const hasWaterfall = name.includes('瀑布');   // ← declared as 'hasWaterfall'
  const icon = isWaterfall ? '💧' : '🏔️';      // ← referenced as 'isWaterfall' → ReferenceError
  // ...
}

// ✅ CORRECT — names must match
function spotIcon(name) {
  const isWaterfall = name.includes('瀑布');
  const icon = isWaterfall ? '💧' : '🏔️';
  // ...
}
```

**Debugging sign**: If the map tiles load (you can see the dark carto background and zoom controls) but no markers appear, the sidebar shows no cards, and the stats bar is empty — this is almost always a silent JS crash in `renderMarkers()`. Open the browser console first.

**Check order**: When the map loads blank but the filter dropdown is correctly populated (city options appear), the JS crashed AFTER `populateFilters()` — usually in `renderMarkers()` or `spotIcon()`. This is the #1 debugging clue.

### FitBounds vs setView

- **`fitBounds` vs `setView`**: NEVER use `map.setView(spots[0])` — if the first entry happens to be in Taichung and the user is in Taipei, they won't see anything. Always use `L.featureGroup(markers).getBounds().pad(0.15)`.

### Deployment & Caching

- **Static file deploy**: GitHub Pages serves whatever is on `main`. If you forget to push `spots.json`, the map loads with empty data. Verify the JSON is accessible via `curl <pages-url>/spots.json`.
- **GitHub Pages CDN delay**: After pushing changes, the CDN can take 1-10 minutes to propagate. Add a cache-busting query parameter to the fetch() call (`fetch('spots.json?v=' + Date.now())`) to bypass browser cache. Even with that, the CDN edge cache still has its own TTL. Check `raw.githubusercontent.com` or GitHub UI to confirm the file actually has the fix, then ask the user to hard-refresh (`Ctrl+Shift+R`).
- **Verify before reporting fix**: When user reports a bug and you push a fix, always verify the live site shows the fix — not just the GitHub file view. CDN delay is real.

### Rendering

- **Color index stability**: `spots.indexOf(spot)` for card border colors works for initial render but breaks if you re-sort the array. Use `filtered.indexOf(spot)` instead when re-rendering filtered results.
- **Address truncation**: If address is long, don't truncate in the card — show full address. The card is spacious enough.
