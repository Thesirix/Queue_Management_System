const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let numero = 0;
const MAX = 99; // valeur max du rouleau

// Servir les fichiers statiques
app.use(express.static("public"));

wss.on("connection", (ws) => {
  // envoyer le numéro actuel dès la connexion
  ws.send(JSON.stringify({ numero }));

  ws.on("message", (message) => {
    let cmd;

    try {
      cmd = JSON.parse(message);
    } catch {
      cmd = message.toString();
    }

    if (cmd === "next") {
      numero = (numero + 1) % (MAX + 1); // après 99 revient à 0
    } else if (cmd === "prev") {
      numero = (numero - 1 + (MAX + 1)) % (MAX + 1); // avant 0 revient à 99
    } else if (cmd === "reset") {
      numero = 0;
    } else if (cmd === "repeat") {
      // 👉 ne change rien, rediffuse juste le numéro actuel
      numero = numero;
    } else if (typeof cmd === "object" && cmd.action === "goto") {
      const val = parseInt(cmd.value);
      if (!isNaN(val) && val >= 0 && val <= MAX) {
        numero = val;
      }
    }

    // Diffuser le numéro actuel à tous les clients
    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(JSON.stringify({ numero }));
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
  console.log("👉 Admin :", `http://localhost:${PORT}/admin.html`);
  console.log("👉 Display :", `http://localhost:${PORT}/display.html`);
});
