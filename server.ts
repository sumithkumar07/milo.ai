import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // We must limit body sizing, and use text as it handles streams properly. Wait, JSON covers small objects
  // But for proxying to LLM APIs, we need to pass JSON 
  app.use(express.json({ limit: '10mb' }));

  // API Proxy Route for Custom / OpenAI endpoints to bypass CORS
  app.post("/api/proxy", async (req, res) => {
    try {
      const { targetUrl, headers, body, method } = req.body;
      if (!targetUrl) {
        return res.status(400).json({ error: "Missing targetUrl" });
      }

      const allowedUrls = [
        'api.openai.com',
        'api.anthropic.com',
        'en.wikipedia.org',
        'api.crossref.org',
        'api.groq.com',
        'api.together.xyz',
        'openrouter.ai',
        'api.fireworks.ai',
        'integrate.api.nvidia.com'
      ];
      
      const isAllowed = allowedUrls.some(url => targetUrl.includes(url));
      if (!isAllowed) {
        // Also allow local URLs if needed or just fallback
        if (!targetUrl.startsWith('https://')) {
          return res.status(400).json({ error: "Invalid targetUrl" });
        }
      }

      // Remove sensitive restricted headers if they get forwarded
      const fetchHeaders: any = { ...headers };
      delete fetchHeaders['host'];
      delete fetchHeaders['origin'];
      delete fetchHeaders['referer'];

      const apiRes = await fetch(targetUrl, {
        method: method || "POST",
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Transfer status
      res.status(apiRes.status);
      
      // Transfer allowed headers back 
      apiRes.headers.forEach((val, key) => {
        if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
           res.setHeader(key, val);
        }
      });

      // Stream the response back
      if (apiRes.body) {
        const reader = apiRes.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            if (value) {
              res.write(Buffer.from(value));
            }
          }
        };
        pump().catch(err => {
          console.error("Stream pump error:", err);
          res.end();
        });
      } else {
        const text = await apiRes.text();
        res.send(text);
      }
    } catch (err: any) {
      console.error("Proxy error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

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
