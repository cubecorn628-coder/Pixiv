/**
 * index.js — Pixiv Scraper on Cloudflare Workers
 *
 * Routes:
 *  GET /                          → API info
 *  GET /search/illust?q=&offset=  → Search illustrations
 *  GET /search/user?q=&offset=    → Search users
 *  GET /search/novel?q=&offset=   → Search novels
 *  GET /illust/:id                → Illust detail
 *  GET /illust/:id/pages          → Illust pages (multi-page)
 *  GET /illust/:id/related        → Related illusts
 *  GET /ranking?mode=day          → Ranking (day/week/month/…)
 *  GET /recommended               → Recommended illusts
 *  GET /trending-tags             → Trending tags
 *  GET /follow                    → Follow feed
 *  GET /user/:id                  → User profile
 *  GET /user/:id/illusts          → User's illusts
 *  GET /user/:id/bookmarks        → User's bookmarks
 *  GET /proxy?url=                → Image proxy (pximg bypass)
 *  GET /next?url=                 → Fetch next_url pagination
 *
 * Required env secrets (via wrangler secret or CF dashboard):
 *  REFRESH_TOKEN — Pixiv OAuth refresh token
 */

import {
  searchIllust,
  searchUser,
  searchNovel,
  illustDetail,
  illustPages,
  illustRanking,
  illustRecommended,
  illustRelated,
  trendingTags,
  illustFollow,
  userDetail,
  userIllusts,
  userBookmarks,
  proxyImage,
  nextPage,
} from "./pixiv.js";

// -------------------------------------------------------------------
// Response helpers
// -------------------------------------------------------------------
const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function errRes(message, status = 400) {
  return jsonRes({ error: true, message }, status);
}

function optionsRes() {
  return new Response(null, { status: 204, headers: cors });
}

// -------------------------------------------------------------------
// Route matcher (no external deps needed)
// -------------------------------------------------------------------
function matchRoute(method, pathname, routes) {
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method && routeMethod !== "*") continue;
    const keys = [];
    const regexStr = "^" + pattern.replace(/:([^/]+)/g, (_, k) => {
      keys.push(k);
      return "([^/]+)";
    }) + "$";
    const match = pathname.match(new RegExp(regexStr));
    if (match) {
      const params = {};
      keys.forEach((k, i) => (params[k] = decodeURIComponent(match[i + 1])));
      return { handler, params };
    }
  }
  return null;
}

// -------------------------------------------------------------------
// Worker fetch handler
// -------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const { method } = request;
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // CORS preflight
    if (method === "OPTIONS") return optionsRes();

    // Require GET only
    if (method !== "GET") return errRes("Method not allowed", 405);

    // Validate env
    if (!env.REFRESH_TOKEN) {
      return errRes("REFRESH_TOKEN not configured. Set it via: wrangler secret put REFRESH_TOKEN", 500);
    }

    const RT = env.REFRESH_TOKEN;

    // Shorthand query parser
    const q      = (k) => searchParams.get(k);
    const qNum   = (k) => parseInt(q(k)) || undefined;

    // -------------------------------------------------------------------
    // Route table
    // -------------------------------------------------------------------
    const routes = [
      // Root — API index
      ["GET", "/", async () => jsonRes({
        name: "Pixiv Scraper — Cloudflare Workers",
        version: "1.0.0",
        endpoints: [
          "GET /search/illust?q=&offset=&sort=&target=&start_date=&end_date=",
          "GET /search/user?q=&offset=",
          "GET /search/novel?q=&offset=&sort=&target=",
          "GET /illust/:id",
          "GET /illust/:id/pages",
          "GET /illust/:id/related?offset=",
          "GET /ranking?mode=day|week|month|day_male|day_female|week_rookie|day_r18&date=YYYY-MM-DD&offset=",
          "GET /recommended?offset=",
          "GET /trending-tags",
          "GET /follow?restrict=public|private&offset=",
          "GET /user/:id",
          "GET /user/:id/illusts?type=illust|manga&offset=",
          "GET /user/:id/bookmarks?restrict=public&max_bookmark_id=",
          "GET /proxy?url=<pximg_url>",
          "GET /next?url=<next_url_from_previous_response>",
        ],
        notes: [
          "sort=popular_desc requires Pixiv Premium",
          "Illustrations: 30 per page, use /next for pagination",
          "/proxy rewrites pximg.net URLs (Referer bypass)",
        ],
      })],

      // ---- Search ----
      ["GET", "/search/illust", async () => {
        const word = q("q");
        if (!word) return errRes("Missing ?q= parameter");
        const data = await searchIllust(RT, word, {
          searchTarget: q("target")   ?? undefined,
          sort:         q("sort")     ?? undefined,
          startDate:    q("start_date") ?? undefined,
          endDate:      q("end_date")   ?? undefined,
          offset:       qNum("offset"),
        });
        return jsonRes(data);
      }],

      ["GET", "/search/user", async () => {
        const word = q("q");
        if (!word) return errRes("Missing ?q= parameter");
        const data = await searchUser(RT, word, { offset: qNum("offset") });
        return jsonRes(data);
      }],

      ["GET", "/search/novel", async () => {
        const word = q("q");
        if (!word) return errRes("Missing ?q= parameter");
        const data = await searchNovel(RT, word, {
          searchTarget: q("target") ?? undefined,
          sort:         q("sort")   ?? undefined,
          offset:       qNum("offset"),
        });
        return jsonRes(data);
      }],

      // ---- Illust ----
      ["GET", "/illust/:id", async ({ params }) => {
        const data = await illustDetail(RT, params.id);
        return jsonRes(data);
      }],

      ["GET", "/illust/:id/pages", async ({ params }) => {
        const data = await illustPages(RT, params.id);
        return jsonRes(data);
      }],

      ["GET", "/illust/:id/related", async ({ params }) => {
        const data = await illustRelated(RT, params.id, { offset: qNum("offset") });
        return jsonRes(data);
      }],

      ["GET", "/ranking", async () => {
        const data = await illustRanking(RT, {
          mode:   q("mode")   ?? "day",
          date:   q("date")   ?? undefined,
          offset: qNum("offset"),
        });
        return jsonRes(data);
      }],

      ["GET", "/recommended", async () => {
        const data = await illustRecommended(RT, { offset: qNum("offset") });
        return jsonRes(data);
      }],

      ["GET", "/trending-tags", async () => {
        const data = await trendingTags(RT);
        return jsonRes(data);
      }],

      ["GET", "/follow", async () => {
        const data = await illustFollow(RT, {
          restrict: q("restrict") ?? "public",
          offset:   qNum("offset"),
        });
        return jsonRes(data);
      }],

      // ---- User ----
      ["GET", "/user/:id", async ({ params }) => {
        const data = await userDetail(RT, params.id);
        return jsonRes(data);
      }],

      ["GET", "/user/:id/illusts", async ({ params }) => {
        const data = await userIllusts(RT, params.id, {
          type:   q("type")   ?? "illust",
          offset: qNum("offset"),
        });
        return jsonRes(data);
      }],

      ["GET", "/user/:id/bookmarks", async ({ params }) => {
        const data = await userBookmarks(RT, params.id, {
          restrict:      q("restrict")        ?? "public",
          maxBookmarkId: qNum("max_bookmark_id"),
        });
        return jsonRes(data);
      }],

      // ---- Image Proxy ----
      ["GET", "/proxy", async () => {
        const imgUrl = q("url");
        if (!imgUrl) return errRes("Missing ?url= parameter");
        const imgRes = await proxyImage(imgUrl);

        // Forward image with CORS header added
        const headers = new Headers(imgRes.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        // Cache aggressively — Pixiv images are immutable
        headers.set("Cache-Control", "public, max-age=604800, immutable");
        return new Response(imgRes.body, { status: imgRes.status, headers });
      }],

      // ---- Pagination ----
      ["GET", "/next", async () => {
        const nextUrl = q("url");
        if (!nextUrl) return errRes("Missing ?url= parameter");
        if (!nextUrl.startsWith("https://app-api.pixiv.net/")) {
          return errRes("next_url must start with https://app-api.pixiv.net/");
        }
        const data = await nextPage(RT, nextUrl);
        return jsonRes(data);
      }],
    ];

    // -------------------------------------------------------------------
    // Dispatch
    // -------------------------------------------------------------------
    const route = matchRoute(method, pathname, routes);
    if (!route) return errRes(`Not found: ${pathname}`, 404);

    try {
      return await route.handler(route);
    } catch (e) {
      console.error("[pixiv-worker]", e.message);
      // Expose auth errors differently
      if (e.message.includes("OAuth")) {
        return errRes(`Auth error: ${e.message}. Check REFRESH_TOKEN secret.`, 401);
      }
      return errRes(e.message, 502);
    }
  },
};
