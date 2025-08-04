import React from "react";

export default function ControlPanel({ ws }) {
  const send = (obj) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  const handleMouseMove = (e) => {
    const rect = e.target.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * window.innerWidth);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * window.innerHeight);

    send({
      type: "input",
      inputType: "mouse",
      event: "move",
      x,
      y
    });
  };

  const handleClick = (button) => {
    send({
      type: "input",
      inputType: "mouse",
      event: "click",
      button
    });
  };

  const handleKeyDown = (e) => {
    e.preventDefault();
    send({
      type: "input",
      inputType: "keyboard",
      event: "keydown",
      key: e.key
    });
  };

  const handleKeyUp = (e) => {
    e.preventDefault();
    send({
      type: "input",
      inputType: "keyboard",
      event: "keyup",
      key: e.key
    });
  };

  return (
    <div style={{ marginTop: "1rem", textAlign: "center" }}>
      <div
        onMouseMove={handleMouseMove}
        style={{
          width: "300px",
          height: "200px",
          margin: "0 auto",
          backgroundColor: "#eee",
          border: "1px solid #ccc",
          cursor: "crosshair"
        }}
      >
        <p>Move mouse here</p>
      </div>
      <div style={{ marginTop: "10px" }}>
        <button onClick={() => handleClick("left")}>Left Click</button>
        <button onClick={() => handleClick("right")}>Right Click</button>
      </div>
      <div style={{ marginTop: "10px" }}>
        <input
          type="text"
          placeholder="Type here"
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
        />
      </div>
    </div>
  );
}
