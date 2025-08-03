// server.js
const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = {}; // code -> { sharer, viewers }

function generateSessionCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g., "A1F4C9"
}

wss.on("connection", (ws) => {
  let sessionCode = null;
  let role = null;

  ws.on("message", (msg, isBinary) => {
    if (isBinary) {
      // Sharer sending screen frame
      if (role === "sharer" && sessionCode && sessions[sessionCode]) {
        sessions[sessionCode].viewers.forEach((viewer) => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(msg, { binary: true });
          }
        });
      }
      return;
    }

    const data = JSON.parse(msg.toString());

    if (data.type === "start-sharing") {
      sessionCode = generateSessionCode();
      role = "sharer";
      sessions[sessionCode] = { sharer: ws, viewers: [] };
      ws.send(JSON.stringify({ type: "session-created", code: sessionCode }));
      console.log("Sharer started session:", sessionCode);
    }

    if (data.type === "join-session") {
      sessionCode = data.code;
      role = "viewer";
      const session = sessions[sessionCode];
      if (session && session.sharer.readyState === WebSocket.OPEN) {
        session.viewers.push(ws);
        ws.send(JSON.stringify({ type: "viewer-joined", success: true }));
        console.log("Viewer joined session:", sessionCode);
      } else {
        ws.send(JSON.stringify({ type: "viewer-joined", success: false }));
      }
    }
  });

  ws.on("close", () => {
    if (role === "sharer" && sessions[sessionCode]) {
      sessions[sessionCode].viewers.forEach((v) => v.close());
      delete sessions[sessionCode];
      console.log("Session closed:", sessionCode);
    }
  });
});

server.listen(8080, () => {
  console.log("WebSocket server running on port 8080");
});
