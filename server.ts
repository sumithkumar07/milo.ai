import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.set('trust proxy', true);

  app.post("/api/proxy", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
      }

      const { targetUrl, headers, body, method } = req.body;
      console.log(`[Proxy Request] ${method || 'POST'} ${targetUrl}`);
      if (!targetUrl) {
        return res.status(400).json({ error: "Missing targetUrl" });
      }

      const defaultHosts = [
        'api.openai.com', 'api.anthropic.com', 'en.wikipedia.org',
        'api.crossref.org', 'api.groq.com', 'api.together.xyz',
        'openrouter.ai', 'api.fireworks.ai', 'integrate.api.nvidia.com',
        'html.duckduckgo.com', 'duckduckgo.com', 'localhost'
      ];
      const allowedHosts = process.env.MILO_PROXY_ALLOWED_HOSTS
        ? process.env.MILO_PROXY_ALLOWED_HOSTS.split(',').map(h => h.trim()).filter(Boolean)
        : defaultHosts;

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        return res.status(400).json({ error: "Invalid targetUrl" });
      }

      const allowHttp = process.env.MILO_ALLOW_HTTP === 'true';
      if (parsedUrl.protocol !== 'https:' && !(allowHttp && parsedUrl.protocol === 'http:')) {
        return res.status(400).json({ error: "Only HTTPS URLs allowed" });
      }

      const isAllowed = allowedHosts.includes(parsedUrl.hostname);
      if (!isAllowed) {
        return res.status(403).json({ error: `Target host not allowed: ${parsedUrl.hostname}` });
      }

      const fetchHeaders: any = { ...headers };
      // Standard browser User-Agent to avoid blocks
      fetchHeaders['user-agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
      delete fetchHeaders['host'];
      delete fetchHeaders['origin'];
      delete fetchHeaders['referer'];
      
      // Ensure we don't send accept-encoding that Node fetch can't handle or that would break piping
      delete fetchHeaders['accept-encoding'];

      const apiRes = await fetch(targetUrl, {
        method: method || "POST",
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      res.status(apiRes.status);

      const contentType = apiRes.headers.get('content-type') || '';
      const isStream = contentType.includes('text/event-stream') || contentType.includes('stream');

      // Forward headers but skip those that conflict with our response
      apiRes.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (!['transfer-encoding', 'connection', 'content-encoding', 'content-length'].includes(lower)) {
          res.setHeader(key, val);
        }
      });

      if (isStream) {
        if (apiRes.body) {
          const reader = apiRes.body.getReader();
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { res.end(); break; }
              if (value) res.write(Buffer.from(value));
            }
          };
          pump().catch(err => {
            console.error("Stream pump error:", err);
            res.end();
          });
        }
      } else {
        const buffer = Buffer.from(await apiRes.arrayBuffer());
        res.setHeader('Content-Length', buffer.length);
        res.end(buffer);
      }
    } catch (err: any) {
      console.error("Proxy error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/fetch-url", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
      }

      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing url" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }

      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ error: "Only HTTP/HTTPS URLs allowed" });
      }

      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MILO/1.0' }
      });

      if (!pageRes.ok) {
        return res.status(pageRes.status).json({ error: `Failed to fetch URL: ${pageRes.statusText}` });
      }

      const html = await pageRes.text();
      const content = extractCleanText(html);
      res.json({ url, content, status: pageRes.status });
    } catch (err: any) {
      console.error("Fetch URL error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  function extractCleanText(html: string): string {
    // Remove script, style, noscript, nav, footer, header elements
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<menu[\s\S]*?<\/menu>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:h[1-6]|p|div|li|tr|blockquote|pre|article|section|figure|figcaption|details|summary)[^>]*>/gi, '\n')
      .replace(/<\/?(?:a|strong|b|em|i|u|span|code|kbd|var|samp|abbr|cite|dfn|sub|sup|small|mark|q|time|del|ins)[^>]*>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ');

    // Clean up whitespace
    text = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 8000);

    return text;
  }

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
