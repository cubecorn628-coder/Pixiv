# Pixiv Scraper — Cloudflare Workers

Pixiv App API wrapper yang jalan di Cloudflare Workers edge network.  
Zero server, zero cost (CF free tier), deploy dalam 2 menit.

---

## Features

| Endpoint | Deskripsi |
|---|---|
| `GET /search/illust` | Cari ilustrasi by keyword |
| `GET /search/user` | Cari user by nama |
| `GET /search/novel` | Cari novel |
| `GET /illust/:id` | Detail ilustrasi |
| `GET /illust/:id/pages` | Semua halaman (multi-page work) |
| `GET /illust/:id/related` | Ilustrasi terkait |
| `GET /ranking` | Ranking harian/mingguan/bulanan |
| `GET /recommended` | Rekomendasi ilustrasi |
| `GET /trending-tags` | Tag trending |
| `GET /follow` | Feed dari user yang di-follow |
| `GET /user/:id` | Profil user |
| `GET /user/:id/illusts` | Ilustrasi milik user |
| `GET /user/:id/bookmarks` | Bookmarks user |
| `GET /proxy` | Image proxy (bypass pximg Referer block) |
| `GET /next` | Pagination — follow `next_url` |

---

## Setup

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Dapat Refresh Token

Pixiv pakai OAuth2. Kamu butuh `refresh_token`.

**Cara termudah** — pakai script dari upbit/pixivpy:

```bash
# Install pixivpy
pip install pixivpy3

# Jalankan helper script
python -c "
import webbrowser, secrets
code_verifier = secrets.token_urlsafe(32)
code_challenge = code_verifier  # simplified, lihat link di bawah
print('code_verifier:', code_verifier)
"
```

Atau pakai tool GUI: https://github.com/eggplants/get-pixivpy-token

Setelah dapat token:

```bash
wrangler secret put REFRESH_TOKEN
# Paste token kamu, Enter
```

### 3. Deploy

```bash
npm install
npm run deploy
```

Worker kamu bakal live di:
`https://pixiv-scraper.<username>.workers.dev`

---

## API Usage

### Search Ilustrasi

```
GET /search/illust?q=hatsune+miku&offset=0
```

Query params:
- `q` — keyword (**required**)
- `target` — `partial_match_for_tags` (default) | `exact_match_for_tags` | `title_and_caption`
- `sort` — `date_desc` (default) | `date_asc` | `popular_desc` *(premium only)*
- `start_date` — `YYYY-MM-DD`
- `end_date` — `YYYY-MM-DD`
- `offset` — pagination (30 per page)

### Search User

```
GET /search/user?q=wlop&offset=0
```

### Detail Ilustrasi

```
GET /illust/59580629
GET /illust/59580629/pages
GET /illust/59580629/related
```

### Ranking

```
GET /ranking?mode=day
GET /ranking?mode=week&offset=30
GET /ranking?mode=day_r18&date=2024-01-01
```

`mode` options: `day`, `week`, `month`, `day_male`, `day_female`, `week_original`,
`week_rookie`, `day_manga`, `day_r18`, `day_male_r18`, `day_female_r18`, `week_r18`, `week_r18g`

### User Profile + Karyanya

```
GET /user/471355
GET /user/471355/illusts?type=illust&offset=0
GET /user/471355/illusts?type=manga
GET /user/471355/bookmarks
```

### Image Proxy

Pixiv blocks direct image access dari luar `pixiv.net`.
Gunakan `/proxy` untuk tampilin gambar di app kamu:

```
GET /proxy?url=https://i.pximg.net/img-original/img/2021/06/01/00/00/00/90000000_p0.jpg
```

Response: raw image bytes + CORS header + cache 7 hari.

### Pagination

Setiap response ada `next_url` field.
Gunakan `/next` untuk ambil halaman berikutnya:

```
GET /next?url=https://app-api.pixiv.net/v1/search/illust?word=...&offset=30
```

---

## Response Format

```json
{
  "illusts": [
    {
      "id": 90000000,
      "title": "Some Art",
      "type": "illust",
      "image_urls": {
        "square_medium": "https://i.pximg.net/..._square1200.jpg",
        "medium": "https://i.pximg.net/..._master1200.jpg",
        "large": "https://i.pximg.net/..._master1200.jpg"
      },
      "caption": "...",
      "user": {
        "id": 12345,
        "name": "ArtistName",
        "account": "artist_account",
        "profile_image_urls": { "medium": "https://i.pximg.net/..." }
      },
      "tags": [{ "name": "tag1" }, { "name": "tag2" }],
      "page_count": 1,
      "width": 1200,
      "height": 1800,
      "total_view": 50000,
      "total_bookmarks": 3000,
      "create_date": "2024-01-01T00:00:00+09:00"
    }
  ],
  "next_url": "https://app-api.pixiv.net/v1/search/illust?...&offset=30"
}
```

---

## Token Authentication Notes

- Token di-cache in-memory per Worker isolate (~45 menit)
- Refresh otomatis saat expired
- `refresh_token` sendiri tidak expire (kecuali di-revoke manual atau password berubah)

---

## Local Dev

```bash
# Buat .dev.vars untuk local secret
echo "REFRESH_TOKEN=your_token_here" > .dev.vars

npm run dev
# Worker live di http://localhost:8787
```

---

## License

MIT — gunakan sesukamu, tapi jangan spam Pixiv API ya 🙏
