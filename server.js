const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let numero = 0;

app.use(express.static("public"));

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
      numero++;
    } else if (cmd === "prev") {
      if (numero > 0) numero--;
    } else if (cmd === "reset") {
      numero = 0;
    } else if (typeof cmd === "object" && cmd.action === "goto") {
      numero = parseInt(cmd.value) || 0;
    }

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
