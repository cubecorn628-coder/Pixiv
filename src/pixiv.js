/**
 * pixiv.js — Pixiv App API Client
 * Runs natively on Cloudflare Workers (Web APIs only, no Node.js)
 *
 * References:
 *  - https://github.com/upbit/pixivpy (Python reference impl)
 *  - https://github.com/akameco/pixiv-app-api (JS reference impl)
 *  - https://github.com/pixiv-cat/pixivcat-cloudflare-workers
 */

const APP_API    = "https://app-api.pixiv.net";
const OAUTH_URL  = "https://oauth.secure.pixiv.net/auth/token";
const CLIENT_ID  = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const CLIENT_SEC = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj";

// Pixiv's fake Android UA + headers required for App-API
const HEADERS = {
  "User-Agent":      "PixivAndroidApp/5.0.234 (Android 11; Pixel 5)",
  "App-OS":          "android",
  "App-OS-Version":  "11",
  "App-Version":     "5.0.234",
  "Accept-Language": "en-US",
};

// -------------------------------------------------------------------
// Token cache (in-memory per Worker isolate, ~30min TTL)
// -------------------------------------------------------------------
let _tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken(refreshToken) {
  const now = Date.now();
  if (_tokenCache.accessToken && now < _tokenCache.expiresAt) {
    return _tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SEC,
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
    include_policy: "true",
  });

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth failed [${res.status}]: ${err}`);
  }

  const data = await res.json();
  const token = data.access_token;
  // Cache for 45 min (token valid 60 min, renew early)
  _tokenCache = {
    accessToken: token,
    expiresAt: now + 45 * 60 * 1000,
  };
  return token;
}

// -------------------------------------------------------------------
// Core API request helper
// -------------------------------------------------------------------
async function apiRequest(refreshToken, path, params = {}) {
  const accessToken = await getAccessToken(refreshToken);

  // Build URL
  const url = new URL(APP_API + path);
  // Always include filter=for_android (required by Pixiv)
  url.searchParams.set("filter", "for_android");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      ...HEADERS,
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pixiv API error [${res.status}] ${path}: ${err}`);
  }

  return res.json();
}

// -------------------------------------------------------------------
// Search
// -------------------------------------------------------------------

/**
 * Search illustrations
 * @param {string} refreshToken
 * @param {string} word - search keyword
 * @param {object} opts
 *   searchTarget: partial_match_for_tags | exact_match_for_tags | title_and_caption
 *   sort: date_desc | date_asc | popular_desc (premium only)
 *   startDate: YYYY-MM-DD
 *   endDate: YYYY-MM-DD
 *   offset: pagination offset (30 per page)
 */
export async function searchIllust(refreshToken, word, opts = {}) {
  return apiRequest(refreshToken, "/v1/search/illust", {
    word,
    search_target: opts.searchTarget ?? "partial_match_for_tags",
    sort:          opts.sort        ?? "date_desc",
    start_date:    opts.startDate,
    end_date:      opts.endDate,
    offset:        opts.offset,
  });
}

/**
 * Search users
 * @param {string} refreshToken
 * @param {string} word - username / keyword
 * @param {object} opts - offset
 */
export async function searchUser(refreshToken, word, opts = {}) {
  return apiRequest(refreshToken, "/v1/search/user", {
    word,
    offset: opts.offset,
  });
}

/**
 * Search novels
 */
export async function searchNovel(refreshToken, word, opts = {}) {
  return apiRequest(refreshToken, "/v1/search/novel", {
    word,
    search_target: opts.searchTarget ?? "partial_match_for_tags",
    sort:          opts.sort        ?? "date_desc",
    offset:        opts.offset,
  });
}

// -------------------------------------------------------------------
// Illust
// -------------------------------------------------------------------

/** Get illust detail by ID */
export async function illustDetail(refreshToken, illustId) {
  return apiRequest(refreshToken, "/v1/illust/detail", { illust_id: illustId });
}

/** Get illust pages (multi-page works) */
export async function illustPages(refreshToken, illustId) {
  return apiRequest(refreshToken, "/v1/illust/pages", { illust_id: illustId });
}

/** Daily/Weekly/Monthly ranking */
export async function illustRanking(refreshToken, opts = {}) {
  return apiRequest(refreshToken, "/v1/illust/ranking", {
    mode:   opts.mode   ?? "day",
    date:   opts.date,
    offset: opts.offset,
  });
}

/** Recommended illusts (requires auth) */
export async function illustRecommended(refreshToken, opts = {}) {
  return apiRequest(refreshToken, "/v1/illust/recommended", {
    content_type: opts.contentType ?? "illust",
    include_ranking_label: "true",
    offset: opts.offset,
  });
}

/** Related illusts */
export async function illustRelated(refreshToken, illustId, opts = {}) {
  return apiRequest(refreshToken, "/v2/illust/related", {
    illust_id: illustId,
    offset:    opts.offset,
  });
}

/** Trending tags */
export async function trendingTags(refreshToken) {
  return apiRequest(refreshToken, "/v1/trending-tags/illust");
}

/** Follow feed (new illust from followed users) */
export async function illustFollow(refreshToken, opts = {}) {
  return apiRequest(refreshToken, "/v2/illust/follow", {
    restrict: opts.restrict ?? "public",
    offset:   opts.offset,
  });
}

// -------------------------------------------------------------------
// User
// -------------------------------------------------------------------

/** User profile + stats */
export async function userDetail(refreshToken, userId) {
  return apiRequest(refreshToken, "/v1/user/detail", { user_id: userId });
}

/** User's illustrations */
export async function userIllusts(refreshToken, userId, opts = {}) {
  return apiRequest(refreshToken, "/v1/user/illusts", {
    user_id: userId,
    type:    opts.type   ?? "illust",
    offset:  opts.offset,
  });
}

/** User's bookmarks */
export async function userBookmarks(refreshToken, userId, opts = {}) {
  return apiRequest(refreshToken, "/v1/user/bookmarks/illust", {
    user_id:        userId,
    restrict:       opts.restrict ?? "public",
    max_bookmark_id: opts.maxBookmarkId,
  });
}

// -------------------------------------------------------------------
// Image Proxy
// pximg.net blocks direct access — must proxy with Referer header
// -------------------------------------------------------------------

/**
 * Proxy a pximg.net image URL
 * Returns a Response with correct Content-Type
 */
export async function proxyImage(imageUrl) {
  // Validate it's a pximg URL to prevent open-proxy abuse
  const allowed = ["i.pximg.net", "s.pximg.net", "i2.pixiv.net"];
  let parsed;
  try { parsed = new URL(imageUrl); }
  catch { throw new Error("Invalid image URL"); }

  if (!allowed.some(h => parsed.hostname === h)) {
    throw new Error(`Blocked host: ${parsed.hostname}`);
  }

  const res = await fetch(imageUrl, {
    headers: {
      "Referer":    "https://www.pixiv.net/",
      "User-Agent": HEADERS["User-Agent"],
    },
  });

  if (!res.ok) {
    throw new Error(`Image fetch failed: ${res.status}`);
  }

  return res;
}

// -------------------------------------------------------------------
// Pagination helper — follow next_url
// -------------------------------------------------------------------
export async function nextPage(refreshToken, nextUrl) {
  const accessToken = await getAccessToken(refreshToken);
  const res = await fetch(nextUrl, {
    headers: { ...HEADERS, "Authorization": `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Next page error: ${res.status}`);
  return res.json();
}
