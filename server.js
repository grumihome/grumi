import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();

// Nur diese Webseiten dürfen den Server nutzen (mehrere mit Komma trennen).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://grumihome.github.io")
  .split(",")
  .map((origin) => origin.trim());

// Obergrenzen für alle Anfragen zusammen, damit die API-Kosten begrenzt bleiben.
// Bewusst nicht pro Gerät: In der Schule teilen sich alle Schüler eine IP-Adresse.
const limits = [
  { max: Number(process.env.LIMIT_PER_MINUTE) || 30, windowMs: 60 * 1000, count: 0, start: Date.now() },
  { max: Number(process.env.LIMIT_PER_DAY) || 500, windowMs: 24 * 60 * 60 * 1000, count: 0, start: Date.now() }
];

const MAX_MESSAGE_LENGTH = 2000;

function limitReached() {
  const now = Date.now();
  for (const limit of limits) {
    if (now - limit.start >= limit.windowMs) {
      limit.start = now;
      limit.count = 0;
    }
  }
  if (limits.some((limit) => limit.count >= limit.max)) {
    return true;
  }
  limits.forEach((limit) => limit.count++);
  return false;
}

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

app.get("/", (req, res) => {
  res.send("GRUMI Backend läuft.");
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!allowedOrigins.includes(req.get("origin"))) {
      return res.status(403).json({
        error: "Zugriff nur über die Schulseite erlaubt."
      });
    }

    const { message } = req.body ?? {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Keine Nachricht übergeben."
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Die Nachricht ist zu lang (höchstens ${MAX_MESSAGE_LENGTH} Zeichen).`
      });
    }

    if (limitReached()) {
      return res.status(429).json({
        error: "Gerade sind zu viele Anfragen unterwegs. Bitte versuche es später noch einmal."
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: message
        }
      ]
    });

    res.json({
      answer: response.content[0].text
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Fehler bei der KI-Anfrage."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
