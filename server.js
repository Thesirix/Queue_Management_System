const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const os = require("os");

const app = express();
const server = http.createServer(app);

// =======================
// WEBSOCKET SERVER
// =======================
const wss = new WebSocketServer({ server });

// =======================
// ETAT METIER
// =======================
let numero = 0;
const MAX = 99;

// =======================
// FICHIERS STATIQUES
// =======================
app.use(express.static("public"));

// =======================
// WEBSOCKET LOGIQUE
// =======================
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
      if (!isNaN(val) && val >= 0 && val <= MAX) {
        numero = val;
      }
    } else if (typeof cmd === "object" && cmd.action === "repeat") {
      // géré côté display
    }

    const payload = JSON.stringify({ numero });

    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(payload);
      }
    });
  });
});

// =======================
// GESTION ERREUR WEBSOCKET
// =======================
wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    afficherServeurDejaLance();
    process.exit(0);
  } else {
    console.error(err);
    process.exit(1);
  }
});

// =======================
// WEATHER (Open-Meteo)
// =======================
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
let weatherCache = { t: 0, data: null };

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
    if (!r.ok) throw new Error("open-meteo");

    const j = await r.json();
    const cw = j.current_weather;

    const payload = {
      city,
      temp: Math.round(cw.temperature),
      desc: weatherCodeFR[cw.weathercode] || "météo",
    };

    weatherCache = { t: Date.now(), data: payload };
    res.json(payload);
  } catch {
    res.status(500).json({ error: "weather_fetch_failed" });
  }
});

// =======================
// IP LAN UNIQUEMENT
// =======================
function getLanIPv4() {
  const nets = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (
        net.family === "IPv4" &&
        !net.internal &&
        (net.address.startsWith("192.168.") || net.address.startsWith("10."))
      ) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// =======================
// MESSAGE SERVEUR DEJA LANCE
// =======================
function afficherServeurDejaLance() {
  console.log("\n===============================");
  console.log(" SERVEUR DEJA EN ROUTE");
  console.log("===============================\n");
  console.log("⚠️ Le serveur est déjà démarré sur ce poste.");
  console.log("Merci de fermer cette fenêtre.\n");
  console.log("👉 Utilisez les liens affichés dans la première fenêtre");
  console.log("ℹ️ Une seule instance du serveur est autorisée\n");
}

// =======================
// GESTION ERREUR HTTP
// =======================
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    afficherServeurDejaLance();
    process.exit(0);
  } else {
    console.error(err);
    process.exit(1);
  }
});

// =======================
// DEMARRAGE SERVEUR
// =======================
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLanIPv4();

  console.log("\n===============================");
  console.log(" Systeme de file d'Attente");
  console.log("===============================\n");

  if (ips.length === 0) {
    console.log(`LOCAL ONLY : http://localhost:${PORT}`);
    console.log(`ADMIN      : http://localhost:${PORT}/admin.html`);
    console.log(`DISPLAY    : http://localhost:${PORT}/display.html`);
  } else {
    ips.forEach((ip) => {
      console.log("👉 LIENS A COPIER POUR LES AGENTS\n");
      console.log(`ADMIN     : http://${ip}:${PORT}/admin.html`);
      console.log(`DISPLAY 1 : http://${ip}:${PORT}/display.html\n`);
    });
  }

  console.log("ℹ️ Ne pas fermer cette fenêtre");
});
