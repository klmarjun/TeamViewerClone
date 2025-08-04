import React, { useRef, useState, useEffect } from "react";
import ControlPanel from "./ControlPanel";

const WS_URL = process.env.REACT_APP_WS_URL || "wss://teamviewerclone-production.up.railway.app";

function App() {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState(null); // "sharer" or "viewer"
  const [code, setCode] = useState("");
  const [sessionCode, setSessionCode] = useState(null);
  const [controlAllowed, setControlAllowed] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);
  const wsRef = useRef(null);
  const inputEnabledRef = useRef(false); // viewer gating
  const localAgentRef = useRef(null); // sharer local agent socket

  // throttle helper
  const throttle = (fn, ms) => {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      }
    };
  };

  // ========== SHARER: start sharing ==========
  const startSharing = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // persistent connection to local Python agent
    const connectLocalAgent = () => {
      const local = new WebSocket("ws://localhost:5001");
      local.onopen = () => {
        console.log("Connected to local control agent");
      };
      local.onclose = () => {
        console.warn("Local agent disconnected, retrying in 1s");
        setTimeout(connectLocalAgent, 1000);
      };
      local.onerror = () => {};
      localAgentRef.current = local;
    };
    connectLocalAgent();

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start-sharing" }));
    };

    ws.onmessage = (msg) => {
      if (typeof msg.data !== "string") return;
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (data.type === "session-created") {
        setSessionCode(data.code);
        setMode("sharer");
      }

      if (data.type === "viewer-connected") {
        console.log("Viewer connected");
      }

      if (data.type === "control-request") {
        setPendingRequest(true);
      }

      if (data.type === "control-status") {
        setControlAllowed(data.allowed);
      }

      if (data.type === "input" && controlAllowed) {
        // forward to persistent local agent
        if (localAgentRef.current && localAgentRef.current.readyState === WebSocket.OPEN) {
          localAgentRef.current.send(JSON.stringify(data.payload));
        }
      }
    };

    // send frames
    const sendFrame = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) ws.send(blob);
      }, "image/jpeg", 0.5);
    };
    setInterval(sendFrame, 100);
  };

  // ========== VIEWER: join ==========
  const joinSession = () => {
    setMode("viewer");
    inputEnabledRef.current = false;
    setControlAllowed(false);
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
        return;
      }

      let data;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (data.type === "viewer-joined" && !data.success) {
        alert("Invalid session code.");
      }

      if (data.type === "control-status") {
        if (data.allowed) {
          inputEnabledRef.current = true;
          setControlAllowed(true);
        } else {
          inputEnabledRef.current = false;
          setControlAllowed(false);
        }
      }
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "control-request" }));
    });

    // Input capture (only after grant)
    const sendInput = (msg) => {
      if (!inputEnabledRef.current) return;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const onMouseMove = throttle((e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      sendInput({
        type: "input",
        inputType: "mouse",
        event: "move",
        x,
        y
      });
    }, 50);

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      sendInput({
        type: "input",
        inputType: "mouse",
        event: "click",
        button: e.button === 0 ? "left" : e.button === 2 ? "right" : "middle",
        x,
        y
      });
    };

    const onKeyDown = (e) => {
      sendInput({
        type: "input",
        inputType: "keyboard",
        event: "keydown",
        key: e.key,
        modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey }
      });
    };

    const onKeyUp = (e) => {
      sendInput({
        type: "input",
        inputType: "keyboard",
        event: "keyup",
        key: e.key,
        modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey }
      });
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      ws.close();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode, code]);

  // Sharer control actions
  const grantControl = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "control-granted" }));
      setControlAllowed(true);
      setPendingRequest(false);
    }
  };

  const revokeControl = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "control-revoke" }));
      setControlAllowed(false);
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2>Remote Screen Share + Control</h2>

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
        <>
          <p>
            Your session code: <strong>{sessionCode}</strong>
            <br />
            Share this code with someone to view/control your screen.
          </p>
          {pendingRequest && !controlAllowed && (
            <div>
              <p>Viewer has requested control.</p>
              <button onClick={grantControl}>Allow Control</button>
              <button onClick={() => setPendingRequest(false)}>Ignore</button>
            </div>
          )}
          {controlAllowed && (
            <div>
              <p>Control is active.</p>
              <button onClick={revokeControl}>Revoke Control</button>
            </div>
          )}
        </>
      )}

      {mode === "viewer" && (
        <div>
          <p>Session: {code}</p>
          <p>{controlAllowed ? "Control granted" : "Waiting for control…"}</p>
          <canvas
            ref={canvasRef}
            style={{ border: "1px solid black", maxWidth: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

export default App;