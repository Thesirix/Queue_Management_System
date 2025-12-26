const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const os = require("os");
const dgram = require("dgram");
const path = require("path");
const crypto = require("crypto");

// =======================
// INIT
// =======================
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// =======================
// CONFIG
// =======================
const PORT = process.env.PORT || 3000;
const MAX = 99;

const UDP_PORT = 41234;
const UDP_WHO = "WHO_IS_SERVER";
const UDP_ANNOUNCE = "QUEUE_SERVER_HERE";

const FIND_RETRIES = 4;
const FIND_INTERVAL_MS = 350;
const FIND_TIMEOUT_MS = 1800;
const ANNOUNCE_EVERY_MS = 800;

// =======================
// COULEURS CONSOLE
// =======================
const RESET = "\x1b[0m";
const BLUE = "\x1b[38;5;45m";
const GREEN = "\x1b[32m";
const RED = "\x1b[38;5;196m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

// =======================
// ETAT METIER
// =======================
let numero = 0;
const instanceId = crypto.randomBytes(6).toString("hex");

// =======================
// IP / BROADCAST
// =======================
let cachedLanIPs = [];
let cachedBroadcasts = [];

// Convertit IP → entier
function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return 0;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

// Calcule l’adresse broadcast de l’IP
function computeBroadcast(ip, mask) {
  const i = ipToInt(ip);
  const m = ipToInt(mask);
  if (!i || !m) return null;
  const b = (i & m) | (~m >>> 0);
  return [(b >>> 24) & 255, (b >>> 16) & 255, (b >>> 8) & 255, b & 255].join(
    "."
  );
}

// Détecte les IP LAN (filtre 172.x)
function detectLanIPv4() {
  const nets = os.networkInterfaces();
  cachedLanIPs = [];
  cachedBroadcasts = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== "IPv4" || net.internal) continue;

      const ip = net.address;
      const mask = net.netmask;

      // on exclut les réseaux virtuels 172.x
      if (ip.startsWith("172.")) continue;

      // priorité 192.168 > 10.x
      if (ip.startsWith("192.168.") || ip.startsWith("10.")) {
        cachedLanIPs.push(ip);
        const bc = computeBroadcast(ip, mask);
        if (bc) cachedBroadcasts.push(bc);
      }
    }
  }

  cachedLanIPs = [...new Set(cachedLanIPs)];
  cachedBroadcasts = [...new Set(cachedBroadcasts)];

  cachedBroadcasts.push("255.255.255.255");

  console.log(
    `${CYAN}[DEBUG] IP LAN détectées: ${cachedLanIPs.join(", ")}${RESET}`
  );
  console.log(
    `${CYAN}[DEBUG] Broadcasts: ${cachedBroadcasts.join(", ")}${RESET}`
  );
}

function getPrimaryIp() {
  return cachedLanIPs[0] || "127.0.0.1";
}

// =======================
// FICHIERS STATIQUES
// =======================
app.use(express.static(path.join(__dirname, "public")));

// =======================
// WEBSOCKET
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

    if (cmd === "next") numero = (numero + 1) % (MAX + 1);
    else if (cmd === "prev") numero = (numero - 1 + (MAX + 1)) % (MAX + 1);
    else if (cmd === "reset") numero = 0;
    else if (cmd?.action === "goto") {
      const v = parseInt(cmd.value);
      if (!isNaN(v) && v >= 0 && v <= MAX) numero = v;
    }

    const payload = JSON.stringify({ numero });
    wss.clients.forEach((c) => c.readyState === ws.OPEN && c.send(payload));
  });
});

// =======================
// WEATHER
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

app.get("/weather", async (_, res) => {
  try {
    if (
      weatherCache.data &&
      Date.now() - weatherCache.t < WEATHER_CACHE_TTL_MS
    ) {
      return res.json(weatherCache.data);
    }

    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=43.2965&longitude=5.3698&current_weather=true"
    );
    const j = await r.json();

    weatherCache = {
      t: Date.now(),
      data: {
        city: "Marseille",
        temp: Math.round(j.current_weather.temperature),
        desc: weatherCodeFR[j.current_weather.weathercode] || "météo",
      },
    };

    res.json(weatherCache.data);
  } catch {
    res.status(500).json({ error: "weather_fetch_failed" });
  }
});

// =======================
// AFFICHAGE
// =======================
function afficherLiens(ip) {
  console.log(`ADMIN   : ${BLUE}http://${ip}:${PORT}/admin.html${RESET}`);
  console.log(`DISPLAY : ${BLUE}http://${ip}:${PORT}/display.html${RESET}\n`);
}

function afficherServeurDejaActif(ip) {
  console.log("\n===============================");
  console.log(`${RED} SERVEUR DÉJÀ ACTIF ${RESET}`);
  console.log("===============================\n");
  afficherLiens(ip);
  console.log("Appuyez sur Entrée pour fermer...");
}

// =======================
// UDP FIND SERVER
// =======================
function findActiveServer(cb) {
  console.log(`${CYAN}[DEBUG] Recherche serveur existant...${RESET}`);

  const socket = dgram.createSocket("udp4");
  let done = false;

  socket.on("message", (msg, rinfo) => {
    const s = msg.toString();
    if (!s.startsWith(UDP_ANNOUNCE)) return;

    const [, ip, id] = s.split("|");
    if (id === instanceId) return;

    console.log(`${GREEN}[DEBUG] Serveur trouvé: ${ip}${RESET}`);

    done = true;
    socket.close();
    cb(ip);
  });

  socket.bind(() => {
    socket.setBroadcast(true);

    let tries = 0;
    const buf = Buffer.from(UDP_WHO);

    const interval = setInterval(() => {
      if (done) return clearInterval(interval);

      tries++;
      console.log(`${CYAN}[DEBUG] WHO (${tries}/${FIND_RETRIES})${RESET}`);

      cachedBroadcasts.forEach((b) => socket.send(buf, UDP_PORT, b));
      cachedLanIPs.forEach((ip) => socket.send(buf, UDP_PORT, ip));

      if (tries >= FIND_RETRIES) clearInterval(interval);
    }, FIND_INTERVAL_MS);

    setTimeout(() => {
      if (!done) {
        console.log(`${YELLOW}[DEBUG] Aucun serveur détecté${RESET}`);
        socket.close();
        cb(null);
      }
    }, FIND_TIMEOUT_MS);
  });
}

// =======================
// UDP SERVER MODE
// =======================
function startUdpServer(onDetected) {
  console.log(`${CYAN}[DEBUG] Activation UDP (serveur)${RESET}`);

  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("message", (msg, rinfo) => {
    const s = msg.toString();

    if (s === UDP_WHO) {
      const payload = Buffer.from(
        `${UDP_ANNOUNCE}|${getPrimaryIp()}|${instanceId}`
      );
      socket.send(payload, rinfo.port, rinfo.address);
      return;
    }

    if (s.startsWith(UDP_ANNOUNCE)) {
      const [, ip, id] = s.split("|");
      if (id !== instanceId) {
        console.log(
          `${RED}[DEBUG] Autre serveur détecté (${ip}) -> arrêt${RESET}`
        );
        onDetected(ip);
      }
    }
  });

  socket.bind(UDP_PORT, () => {
    socket.setBroadcast(true);
    console.log(`${GREEN}UDP actif sur port ${UDP_PORT}${RESET}`);
  });

  const timer = setInterval(() => {
    const payload = Buffer.from(
      `${UDP_ANNOUNCE}|${getPrimaryIp()}|${instanceId}`
    );
    cachedBroadcasts.forEach((b) => socket.send(payload, UDP_PORT, b));
  }, ANNOUNCE_EVERY_MS);

  return {
    stop() {
      clearInterval(timer);
      socket.close();
    },
  };
}

// =======================
// STOP TOUT
// =======================
function stopAll(udp) {
  try {
    udp?.stop();
  } catch {}
  try {
    wss.close();
  } catch {}
  try {
    server.close();
  } catch {}
}

// =======================
// START
// =======================
console.log(`${CYAN}========================================${RESET}`);
console.log(`${CYAN}     DEMARRAGE DU SYSTEME DE FILE      ${RESET}`);
console.log(`${CYAN}========================================${RESET}\n`);

detectLanIPv4();

findActiveServer((foundIp) => {
  if (foundIp) {
    afficherServeurDejaActif(foundIp);
    process.stdin.resume();
    process.stdin.on("data", () => process.exit(0));
    return;
  }

  console.log(`${GREEN}[DEBUG] Aucun serveur trouvé → lancement${RESET}`);

  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `${GREEN}Le système de file d’attente est en service${RESET}\n`
    );
    cachedLanIPs.forEach(afficherLiens);
  });

  const udp = startUdpServer((ip) => {
    stopAll(udp);
    afficherServeurDejaActif(ip);
    process.stdin.resume();
    process.stdin.on("data", () => process.exit(0));
  });
});
