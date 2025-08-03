import React, { useRef, useState, useEffect } from "react";

// in code
const WS_URL = process.env.REACT_APP_WS_URL || "wss://teamviewerclone-production.up.railway.app";


function App() {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState(null); // "sharer" or "viewer"
  const [code, setCode] = useState("");
  const [sessionCode, setSessionCode] = useState(null);
  const wsRef = useRef(null);

  // Start screen sharing
  const startSharing = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start-sharing" }));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === "session-created") {
        setSessionCode(data.code);
        setMode("sharer");
      }
    };

    const sendFrame = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) ws.send(blob);
      }, "image/jpeg", 0.5);
    };

    setInterval(sendFrame, 100); // ~10 fps
  };

  // Join as viewer
  const joinSession = () => {
    setMode("viewer"); // Force render canvas before using it

    // WebSocket connection will be created inside useEffect when mode === "viewer"
  };

  useEffect(() => {
    if (mode !== "viewer") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.binaryType = "blob";

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join-session", code }));
    };

    ws.onmessage = (msg) => {
      if (msg.data instanceof Blob) {
        const img = new Image();
        img.src = URL.createObjectURL(msg.data);
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(img.src);
        };
      } else {
        const data = JSON.parse(msg.data);
        if (data.type === "viewer-joined" && !data.success) {
          alert("Invalid session code.");
        }
      }
    };

    return () => ws.close(); // cleanup on unmount
  }, [mode, code]);

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2>Remote Screen Share</h2>

      {!mode && (
        <>
          <button onClick={startSharing}>Start Sharing</button>
          <div style={{ margin: "1rem" }}>
            <input
              placeholder="Enter session code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button onClick={joinSession}>Join</button>
          </div>
        </>
      )}

      {mode === "sharer" && (
        <p>
          Your session code: <strong>{sessionCode}</strong>
          <br />
          Share this code with someone to view your screen.
        </p>
      )}

      {mode === "viewer" && (
        <canvas
          ref={canvasRef}
          style={{ border: "1px solid black", maxWidth: "100%" }}
        />
      )}
    </div>
  );
}

export default App;
