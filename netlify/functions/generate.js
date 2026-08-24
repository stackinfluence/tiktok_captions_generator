// TikTok Caption Generator - serverless function
// Holds the Anthropic API key server-side. Never expose the key to the browser.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

exports.handler = async function (event) {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed." })
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Server is not configured. Missing API key." })
    };
  }

  let topic = "";
  let tone = "";
  try {
    const parsed = JSON.parse(event.body || "{}");
    topic = (parsed.topic || "").toString().slice(0, 200).trim();
    tone = (parsed.tone || "").toString().slice(0, 40).trim();
  } catch (e) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Invalid request." })
    };
  }

  if (!topic) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Please describe your video." })
    };
  }
  if (!tone) tone = "Relatable";

  const systemPrompt =
    "You are a TikTok caption writer. Given a video description and a tone, write captions that fit how real creators post on TikTok.\n\n" +
    "Rules:\n" +
    "- Write exactly 5 distinct captions. Vary the angle across them (a hook, a question, a bold line, a relatable line, a short punchy one).\n" +
    "- Keep each caption short and native to TikTok, roughly 1 to 2 lines. Most captions on the platform are brief.\n" +
    "- Match the requested tone closely.\n" +
    "- Do NOT put hashtags inside the captions. Hashtags are returned separately.\n" +
    "- Emoji are allowed sparingly where they fit the tone, but do not overload.\n" +
    "- Then provide 8 to 12 relevant hashtags as a separate set. Mix broad and specific tags for the topic. Each hashtag starts with # and contains no spaces.\n" +
    "- Do not use em dashes.\n\n" +
    "Respond with ONLY a JSON object, no preamble, no markdown, no code fences. Exact shape:\n" +
    '{"captions": ["...", "...", "...", "...", "..."], "hashtags": ["#tag1", "#tag2"]}';

  const userPrompt =
    "Video description: " + topic + "\n" +
    "Tone: " + tone;

  let apiJson;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });

    apiJson = await resp.json();

    if (!resp.ok) {
      const msg = (apiJson && apiJson.error && apiJson.error.message)
        ? apiJson.error.message
        : "The generator is busy. Try again in a moment.";
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: msg })
      };
    }
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not reach the generator. Try again." })
    };
  }

  // Extract text from the model response
  let raw = "";
  if (apiJson && Array.isArray(apiJson.content)) {
    raw = apiJson.content
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("\n");
  }

  const parsed = parseModelOutput(raw);
  if (!parsed) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Could not read the generated captions. Please try again." })
    };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(parsed)
  };
};

// Strip accidental code fences, parse JSON, with a line-split fallback.
function parseModelOutput(text) {
  if (!text) return null;
  let cleaned = text.trim();

  // Remove ```json ... ``` or ``` ... ``` fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Primary: direct JSON parse
  try {
    const obj = JSON.parse(cleaned);
    const out = normalize(obj);
    if (out) return out;
  } catch (e) {
    // fall through
  }

  // Secondary: grab the first {...} block and parse it
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      const out = normalize(obj);
      if (out) return out;
    } catch (e) {
      // fall through
    }
  }

  // Fallback: pull captions and hashtags heuristically from lines
  const lines = cleaned.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  const captions = [];
  const hashtags = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // collect hashtags from any line
    const tagsInLine = line.match(/#[A-Za-z0-9_]+/g);
    if (tagsInLine && line.replace(/#[A-Za-z0-9_\s]+/g, "").trim().length < 3) {
      for (let t = 0; t < tagsInLine.length; t++) hashtags.push(tagsInLine[t]);
      continue;
    }
    // strip leading list markers / numbering / quotes
    line = line.replace(/^[-*0-9.)\]\s"']+/, "").replace(/["']+$/, "").trim();
    if (line && !/^hashtags?:/i.test(line) && !/^captions?:/i.test(line) && line.charAt(0) !== "#") {
      captions.push(line);
    }
  }

  if (captions.length >= 1) {
    return {
      captions: captions.slice(0, 5),
      hashtags: hashtags.slice(0, 12)
    };
  }

  return null;
}

function normalize(obj) {
  if (!obj || !Array.isArray(obj.captions)) return null;
  const captions = obj.captions
    .map(function (c) { return (c == null ? "" : String(c)).trim(); })
    .filter(Boolean)
    .slice(0, 5);
  if (!captions.length) return null;

  let hashtags = [];
  if (Array.isArray(obj.hashtags)) {
    hashtags = obj.hashtags
      .map(function (h) {
        let tag = (h == null ? "" : String(h)).trim();
        if (tag && tag.charAt(0) !== "#") tag = "#" + tag;
        return tag.replace(/\s+/g, "");
      })
      .filter(function (t) { return t.length > 1; })
      .slice(0, 12);
  }

  return { captions: captions, hashtags: hashtags };
}
