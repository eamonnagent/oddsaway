/**
 * OddsAway Email Capture Worker
 * POST /subscribe  — stores email in D1, validates, deduplicates
 */

const ALLOWED_ORIGINS = [
  "https://oddsaway.co",
  "https://www.oddsaway.co",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function isValidEmail(email) {
  // RFC-ish: local@domain.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    // Handle CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only handle POST /subscribe
    if (request.method !== "POST" || url.pathname !== "/subscribe") {
      return json({ error: "Not found" }, 404, origin);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, origin);
    }

    const email = (body.email || "").trim().toLowerCase();

    // Validate
    if (!email) {
      return json({ error: "Email is required" }, 400, origin);
    }
    if (!isValidEmail(email)) {
      return json({ error: "Please enter a valid email address" }, 400, origin);
    }
    if (email.length > 320) {
      return json({ error: "Email address is too long" }, 400, origin);
    }

    // Check for duplicate
    const existing = await env.DB.prepare(
      "SELECT id FROM emails WHERE email = ?1"
    )
      .bind(email)
      .first();

    if (existing) {
      // Treat duplicate as success — no need to scare the user
      return json({ success: true, message: "You're already on the list!" }, 200, origin);
    }

    // Insert
    await env.DB.prepare(
      "INSERT INTO emails (email, created_at) VALUES (?1, ?2)"
    )
      .bind(email, new Date().toISOString())
      .run();

    return json(
      { success: true, message: "You're on the list! Check your inbox soon." },
      201,
      origin
    );
  },
};
