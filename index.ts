import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WERTIFIX_PROMPT, SELLER_RESPONSE_ANALYSIS_PROMPT } from './prompts';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const JINA_API_KEY = process.env.JINA_API_KEY || '';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// URL Cleaning function - nutzt die SEO-Subdomain gegen den 403-Fehler
const cleanUrlFromTracking = (url: string): string => {
  if (!url) return url;
  try {
    let finalUrl = url;
    if (url.includes("mobile.de")) {
      finalUrl = url.replace(/https?:\/\/(m\.|www\.)mobile\.de/, "https://suchen.mobile.de");
    }
    return finalUrl;
  } catch {
    return url;
  }
};

// ScraperAPI Fetcher (Optimiert für Speed: render=false)
const fetchFromScraperAPI = async (url: string): Promise<{ text: string, imageUrl: string | null }> => {
  if (!SCRAPER_API_KEY) throw new Error("ScraperAPI Key fehlt.");

  // render=false macht das Scraping extrem schnell, premium=true nutzt gute Proxys
  const apiReq = `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=false&premium=true&country_code=de`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s Timeout

  try {
    const resp = await fetch(apiReq, { signal: controller.signal });
    if (!resp.ok) {
      clearTimeout(timeoutId);
      throw new Error(`ScraperAPI Blockiert (${resp.status})`);
    }

    const html = await resp.text();

    // Jina nur noch zum Umwandeln von HTML in Markdown
    const jinaResp = await fetch(`https://r.jina.ai/${url}`, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${JINA_API_KEY}`,
        "Content-Type": "text/html",
        "X-Return-Format": "markdown"
      },
      body: html,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!jinaResp.ok) throw new Error(`Jina conversion error: ${jinaResp.status}`);

    const rawText = await jinaResp.text();
    
    if (rawText.length < 500) {
        throw new Error("Bot-Schutz erkannt. Text zu kurz.");
    }

    const imgMatch = rawText.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    return { text: rawText, imageUrl };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error("Scraping Timeout (25s)");
    throw error;
  }
};

// Jina Fallback Fetcher (für Nicht-mobile.de Seiten)
const fetchFromJina = async (url: string): Promise<{ text: string, imageUrl: string | null }> => {
  if (!JINA_API_KEY) throw new Error("Jina API Key fehlt.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const jinaResp = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "Authorization": `Bearer ${JINA_API_KEY}`,
        "X-Return-Format": "markdown"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!jinaResp.ok) throw new Error(`Jina API Error: ${jinaResp.status}`);
    
    const rawText = await jinaResp.text();
    const imgMatch = rawText.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    return { text: rawText, imageUrl };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Haupt-Scraping-Route
app.post('/api/scrape', async (req, res) => {
  try {
    const { url: rawUrl } = req.body;
    if (!rawUrl) return res.status(400).json({ error: 'URL ist erforderlich' });

    const cleanUrl = cleanUrlFromTracking(rawUrl);
    let scrapeResult;
    
    // mobile.de -> Immer erst ScraperAPI
    if (cleanUrl.includes('mobile.de')) {
      scrapeResult = await fetchFromScraperAPI(cleanUrl);
    } else {
      // Andere Seiten -> Erst Jina versuchen, dann ScraperAPI Fallback
      try {
        scrapeResult = await fetchFromJina(cleanUrl);
      } catch (e) {
        scrapeResult = await fetchFromScraperAPI(cleanUrl);
      }
    }

    res.json(scrapeResult);
  } catch (e: any) {
    console.error("Scrape Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// KI-Analyse Route (DeepSeek v3.2)
app.post('/api/valuation', async (req, res) => {
  try {
    const { adText = '' } = req.body;
    if (!OPENROUTER_API_KEY) return res.status(400).json({ error: 'OPENROUTER_API_KEY fehlt' });
    
    const currentDate = new Date().toLocaleDateString('de-DE');
    const systemPrompt = WERTIFIX_PROMPT.replace('[CURRENT_DATE_PLACEHOLDER]', currentDate);
    const content = `ANZEIGENTEXT:\n${adText}`;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        temperature: 0.2,
        max_tokens: 2200
      })
    });

    if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? 'Fehler bei der KI-Antwort';
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Seller Analysis Route
app.post('/api/seller-analysis', async (req, res) => {
  try {
    const { originalReport = '', sellerResponse = '' } = req.body;
    if (!OPENROUTER_API_KEY) return res.status(400).json({ error: 'OPENROUTER_API_KEY fehlt' });
    
    const systemPrompt = SELLER_RESPONSE_ANALYSIS_PROMPT
      .replace('[ORIGINAL_REPORT_PLACEHOLDER]', originalReport)
      .replace('[SELLER_RESPONSE_PLACEHOLDER]', sellerResponse);
      
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Analysiere die Verkäufer-Antwort.' }
        ],
        temperature: 0.2,
        max_tokens: 1600
      })
    });

    if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? 'Keine Analyse möglich.';
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, '0.0.0.0', () => console.log(`Wertifix Proxy-Server läuft auf Port ${port} (WLAN-fähig)`));