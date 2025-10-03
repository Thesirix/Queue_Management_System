const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let numero = 0;
const MAX = 99;

// --------- Fichiers statiques ---------
app.use(express.static("public"));

// --------- WebSocket ---------
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ numero }));

  ws.on("message", (message) => {
    let cmd;
    try {
      cmd = JSON.parse(message);
    } catch {
      cmd = message.toString();
    }

    if (cmd === "next") {
      numero = (numero + 1) % (MAX + 1);
    } else if (cmd === "prev") {
      numero = (numero - 1 + (MAX + 1)) % (MAX + 1);
    } else if (cmd === "reset") {
      numero = 0;
    } else if (typeof cmd === "object" && cmd.action === "goto") {
      const val = parseInt(cmd.value);
      if (!isNaN(val) && val >= 0 && val <= MAX) numero = val;
    } else if (typeof cmd === "object" && cmd.action === "repeat") {
      // rien à changer ici, le Display gère la répétition à réception
    }

    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(JSON.stringify({ numero }));
      }
    });
  });
});

// --------- /weather (Open-Meteo, pas de clé) ---------
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let weatherCache = { t: 0, data: null };

// Codes Open-Meteo -> description FR courte
const weatherCodeFR = {
  0: "ciel dégagé",
  1: "peu nuageux",
  2: "partiellement nuageux",
  3: "couvert",
  45: "brouillard",
  48: "brouillard givrant",
  51: "bruine légère",
  53: "bruine",
  55: "bruine forte",
  56: "bruine verglaçante légère",
  57: "bruine verglaçante forte",
  61: "pluie faible",
  63: "pluie",
  65: "pluie forte",
  66: "pluie verglaçante faible",
  67: "pluie verglaçante forte",
  71: "neige faible",
  73: "neige",
  75: "neige forte",
  77: "grains de neige",
  80: "averses faibles",
  81: "averses",
  82: "averses fortes",
  85: "averses de neige faibles",
  86: "averses de neige fortes",
  95: "orage",
  96: "orage grêle",
  97: "orage grêle fort",
};

app.get("/weather", async (req, res) => {
  try {
    // Par défaut : Marseille. Tu peux définir des variables d'env sur Render :
    // WEATHER_CITY, WEATHER_LAT, WEATHER_LON
    const city = process.env.WEATHER_CITY || "Marseille";
    const lat = Number(process.env.WEATHER_LAT || "43.2965");
    const lon = Number(process.env.WEATHER_LON || "5.3698");

    if (
      weatherCache.data &&
      Date.now() - weatherCache.t < WEATHER_CACHE_TTL_MS
    ) {
      return res.json(weatherCache.data);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo status ${r.status}`);
    const j = await r.json();

    const cw = j.current_weather;
    const desc = weatherCodeFR[cw.weathercode] || "météo";

    const payload = {
      city,
      temp: Math.round(cw.temperature),
      desc,
    };

    weatherCache = { t: Date.now(), data: payload };
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: "weather_fetch_failed" });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
  console.log("👉 Admin :", `http://localhost:${PORT}/admin.html`);
  console.log("👉 Display :", `http://localhost:${PORT}/display.html`);
});
