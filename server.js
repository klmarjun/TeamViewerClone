// server.js
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const sessions = {}; // code -> { sharer, viewers: [], controlAllowed: bool }

function generateSessionCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g., "A1F4C9"
}

wss.on("connection", (ws) => {
  let sessionCode = null;
  let role = null;

  ws.on("message", (msg, isBinary) => {
    // Binary frames are treated as screen frames from sharer
    if (isBinary) {
      if (role === "sharer" && sessionCode && sessions[sessionCode]) {
        sessions[sessionCode].viewers.forEach((viewer) => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(msg, { binary: true });
          }
        });
      }
      return;
    }

    // Text message
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch (err) {
      console.warn("Invalid JSON received:", msg.toString());
      return;
    }

    // === Sharer starts session ===
    if (data.type === "start-sharing") {
      sessionCode = generateSessionCode();
      role = "sharer";
      sessions[sessionCode] = {
        sharer: ws,
        viewers: [],
        controlAllowed: false,
      };
      ws.send(JSON.stringify({ type: "session-created", code: sessionCode }));
      console.log("Sharer started session:", sessionCode);
      return;
    }

    // === Viewer joins ===
    if (data.type === "join-session") {
      sessionCode = data.code;
      role = "viewer";
      const session = sessions[sessionCode];
      if (session && session.sharer && session.sharer.readyState === WebSocket.OPEN) {
        session.viewers.push(ws);
        ws.send(JSON.stringify({ type: "viewer-joined", success: true }));
        // Notify sharer
        session.sharer.send(JSON.stringify({ type: "viewer-connected" }));
        console.log("Viewer joined session:", sessionCode);
      } else {
        ws.send(JSON.stringify({ type: "viewer-joined", success: false }));
      }
      return;
    }

    // === Viewer requests control ===
    if (data.type === "control-request" && role === "viewer" && sessionCode) {
      const session = sessions[sessionCode];
      if (session && session.sharer && session.sharer.readyState === WebSocket.OPEN) {
        session.sharer.send(JSON.stringify({ type: "control-request" }));
        console.log("Viewer requested control for session:", sessionCode);
      }
      return;
    }

    // === Sharer grants/revokes control ===
    if ((data.type === "control-granted" || data.type === "control-revoke") && role === "sharer" && sessionCode) {
      const session = sessions[sessionCode];
      if (!session) return;

      session.controlAllowed = data.type === "control-granted";
      // Inform viewers of updated control status
      session.viewers.forEach((viewer) => {
        if (viewer.readyState === WebSocket.OPEN) {
          viewer.send(JSON.stringify({
            type: "control-status",
            allowed: true
          }));
        }
      });
      console.log(`Control ${session.controlAllowed ? "granted" : "revoked"} for session:`, sessionCode);
      return;
    }

    // === Viewer input events ===
    if (data.type === "input" && role === "viewer" && sessionCode) {
      console.log("Server received input from viewer:", data); 

      const session = sessions[sessionCode];
      if (!session) return;
      if (session.controlAllowed && session.sharer && session.sharer.readyState === WebSocket.OPEN) {
        console.log("Forwarding input to sharer:", data); 
        session.sharer.send(JSON.stringify({
          type: "input",
          payload: data
        }));
      }
      return;
    }
    // (Future) other message types...
  });

  ws.on("close", () => {
    if (role === "sharer" && sessionCode && sessions[sessionCode]) {
      // Notify viewers and clean up
      sessions[sessionCode].viewers.forEach((v) => {
        if (v.readyState === WebSocket.OPEN) {
          v.send(JSON.stringify({ type: "sharer-disconnected" }));
          v.close();
        }
      });
      delete sessions[sessionCode];
      console.log("Session closed (sharer disconnected):", sessionCode);
    }

    if (role === "viewer" && sessionCode && sessions[sessionCode]) {
      // Remove viewer from list
      const session = sessions[sessionCode];
      session.viewers = session.viewers.filter((v) => v !== ws);
      console.log("Viewer disconnected from session:", sessionCode);
    }
  });
});

server.listen(8080, () => {
  console.log("WebSocket server running on port 8080");
});
