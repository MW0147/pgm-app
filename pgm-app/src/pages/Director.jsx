import { useState, useEffect, useRef, useCallback } from "react";

const SERVER_URL = "wss://pgm-server.up.railway.app";
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ── Subcomponents ────────────────────────────────────────────────────────────

const CameraFeed = ({ cam, isProgram, isPreview, onClick, videoRef }) => (
  <div
    onClick={() => cam.connected && onClick(cam.id)}
    style={{
      position: "relative",
      background: "#0d1117",
      border: isProgram ? "2px solid #ef4444" : isPreview ? "2px solid #22c55e" : "2px solid #1f2937",
      borderRadius: "8px",
      cursor: cam.connected ? "pointer" : "default",
      overflow: "hidden",
      aspectRatio: "16/9",
      transition: "border-color 0.15s, box-shadow 0.15s",
      boxShadow: isProgram
        ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 24px rgba(239,68,68,0.12)"
        : isPreview
        ? "0 0 0 1px rgba(34,197,94,0.1), 0 4px 24px rgba(34,197,94,0.08)"
        : "0 2px 8px rgba(0,0,0,0.4)",
    }}
  >
    {/* Live video */}
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        objectFit: "cover",
        display: cam.hasStream ? "block" : "none",
      }}
    />

    {/* Placeholder when no stream */}
    {!cam.hasStream && (
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6,
      }}>
        {cam.connected ? (
          <>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.6)",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 10, color: "#374151", fontWeight: 500 }}>Connecting…</span>
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.18 }}>
              <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.5"/>
              <path d="M4.5 4.5l15 15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 10, color: "#374151", fontWeight: 500 }}>No signal</span>
          </>
        )}
      </div>
    )}

    {/* Bottom label */}
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: "18px 10px 8px",
      background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
    }}>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: isProgram ? "#ef4444" : isPreview ? "#22c55e" : "#9ca3af",
      }}>{cam.name}</span>
      <span style={{ fontSize: 10, color: "#6b7280" }}>{cam.label}</span>
    </div>

    {/* PGM/PVW badge */}
    {(isProgram || isPreview) && (
      <div style={{
        position: "absolute", top: 8, left: 8,
        background: isProgram ? "#ef4444" : "#22c55e",
        color: isProgram ? "#fff" : "#000",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        padding: "2px 7px", borderRadius: "4px", textTransform: "uppercase",
      }}>
        {isProgram ? "PGM" : "PVW"}
      </div>
    )}

    {/* Tally dot */}
    {cam.connected && (
      <div style={{
        position: "absolute", top: 10, right: 10,
        width: 8, height: 8, borderRadius: "50%",
        background: isProgram ? "#ef4444" : isPreview ? "#22c55e" : "#1f2937",
        boxShadow: isProgram ? "0 0 8px rgba(239,68,68,0.8)" : isPreview ? "0 0 8px rgba(34,197,94,0.7)" : "none",
        transition: "background 0.15s, box-shadow 0.15s",
      }} />
    )}
  </div>
);

const Monitor = ({ cam, isProgram, videoRef }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: isProgram ? "#ef4444" : "#22c55e",
        boxShadow: isProgram ? "0 0 7px rgba(239,68,68,0.7)" : "0 0 7px rgba(34,197,94,0.5)",
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: isProgram ? "#ef4444" : "#22c55e", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {isProgram ? "Program" : "Preview"}
      </span>
    </div>
    <div style={{
      aspectRatio: "16/9", background: "#0d1117",
      border: `2px solid ${isProgram ? "#ef4444" : "#22c55e"}`,
      borderRadius: "8px", position: "relative", overflow: "hidden",
      boxShadow: isProgram ? "0 0 32px rgba(239,68,68,0.12)" : "0 0 24px rgba(34,197,94,0.08)",
    }}>
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ width: "100%", height: "100%", objectFit: "cover", display: cam?.hasStream ? "block" : "none" }}
      />
      {!cam?.hasStream && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 12, color: isProgram ? "#3f1a1a" : "#14302a", fontWeight: 500 }}>
            {cam ? `${cam.name} — ${cam.label}` : "No source"}
          </span>
        </div>
      )}
      <div style={{
        position: "absolute", top: 10, left: 10,
        background: isProgram ? "#ef4444" : "#22c55e",
        color: isProgram ? "#fff" : "#000",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
        padding: "3px 8px", borderRadius: "4px", textTransform: "uppercase",
      }}>
        {isProgram ? "PGM" : "PVW"}
      </div>
    </div>
  </div>
);

const ShortcutKey = ({ k }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "#1a1f2a", border: "1px solid #2d3748",
    borderRadius: "4px", padding: "1px 6px",
    fontSize: 10, fontWeight: 600, color: "#9ca3af", minWidth: 20,
  }}>{k}</span>
);

// ── Main component ───────────────────────────────────────────────────────────

export default function Director() {
  const [cameras, setCameras] = useState([]);
  const [program, setProgram] = useState(null);
  const [preview, setPreview] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [duration, setDuration] = useState(0);
  const [livePulse, setLivePulse] = useState(true);
  const [wsStatus, setWsStatus] = useState("connecting"); // connecting | connected | disconnected

  const wsRef = useRef(null);
  const peerConnections = useRef(new Map()); // cameraId -> RTCPeerConnection
  const videoRefs = useRef(new Map());       // cameraId -> video element (grid tiles)
  const monitorRefs = useRef({ program: null, preview: null }); // monitor video elements

  // ── WebRTC: initiate connection to a camera ────────────────────────────────
  const initiatePeerConnection = useCallback(async (cameraId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    // Tell peer connection we want to RECEIVE video (modern Unified Plan API)
    pc.addTransceiver("video", { direction: "recvonly" });

    // When we receive the camera's video track
    pc.ontrack = (event) => {
      console.log(`[PGM] Track received from ${cameraId}`, event.track.kind);
      const stream = event.streams[0] || new MediaStream([event.track]);

      setCameras(prev => prev.map(c => c.id === cameraId ? { ...c, hasStream: true } : c));

      const tileVideo = videoRefs.current.get(cameraId);
      if (tileVideo) tileVideo.srcObject = stream;

      setProgram(prog => {
        if (prog === cameraId && monitorRefs.current.program) {
          monitorRefs.current.program.srcObject = stream;
        }
        return prog;
      });
      setPreview(prev => {
        if (prev === cameraId && monitorRefs.current.preview) {
          monitorRefs.current.preview.srcObject = stream;
        }
        return prev;
      });
    };

    // Log connection state changes to help debug
    pc.onconnectionstatechange = () => {
      console.log(`[PGM] ${cameraId} connection: ${pc.connectionState}`);
      if (pc.connectionState === "failed") {
        console.warn(`[PGM] Connection failed for ${cameraId} — retrying ICE`);
        pc.restartIce();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[PGM] ${cameraId} ICE: ${pc.iceConnectionState}`);
    };

    // Send ICE candidates to the camera via signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          to: cameraId,
          candidate: event.candidate,
        }));
      }
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log(`[PGM] Sending offer to ${cameraId}`);
    wsRef.current?.send(JSON.stringify({
      type: "sdp-offer",
      to: cameraId,
      sdp: offer,
    }));
  }, []);

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        ws.send(JSON.stringify({ type: "register", role: "director" }));
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        // Retry after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = () => setWsStatus("disconnected");

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "camera-connected": {
            setCameras(prev => {
              const exists = prev.find(c => c.id === msg.cameraId);
              if (exists) return prev.map(c => c.id === msg.cameraId ? { ...c, connected: true } : c);
              const updated = [...prev, { id: msg.cameraId, name: msg.name, label: msg.label, connected: true, hasStream: false }];
              // Auto-assign first camera to program, second to preview
              // and immediately send tally state to the phone
              if (updated.length === 1) {
                setProgram(msg.cameraId);
                setTimeout(() => sendTally(msg.cameraId, "program"), 500);
              }
              if (updated.length === 2) {
                setPreview(msg.cameraId);
                setTimeout(() => sendTally(msg.cameraId, "preview"), 500);
              }
              return updated;
            });
            await initiatePeerConnection(msg.cameraId);
            break;
          }

          case "camera-disconnected": {
            setCameras(prev => prev.map(c => c.id === msg.cameraId ? { ...c, connected: false, hasStream: false } : c));
            peerConnections.current.get(msg.cameraId)?.close();
            peerConnections.current.delete(msg.cameraId);
            break;
          }

          case "sdp-answer": {
            const pc = peerConnections.current.get(msg.from);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            break;
          }

          case "ice-candidate": {
            const pc = peerConnections.current.get(msg.from);
            if (pc && msg.candidate) {
              try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
            }
            break;
          }
        }
      };
    };

    connect();
    return () => {
      wsRef.current?.close();
      peerConnections.current.forEach(pc => pc.close());
    };
  }, [initiatePeerConnection]);

  // ── Update monitor video sources when program/preview changes ─────────────
  useEffect(() => {
    if (program !== null) {
      const pc = peerConnections.current.get(program);
      if (pc) {
        const receivers = pc.getReceivers();
        const videoReceiver = receivers.find(r => r.track?.kind === "video");
        if (videoReceiver && monitorRefs.current.program) {
          const stream = new MediaStream([videoReceiver.track]);
          monitorRefs.current.program.srcObject = stream;
        }
      }
    }
  }, [program]);

  useEffect(() => {
    if (preview !== null) {
      const pc = peerConnections.current.get(preview);
      if (pc) {
        const receivers = pc.getReceivers();
        const videoReceiver = receivers.find(r => r.track?.kind === "video");
        if (videoReceiver && monitorRefs.current.preview) {
          const stream = new MediaStream([videoReceiver.track]);
          monitorRefs.current.preview.srcObject = stream;
        }
      }
    }
  }, [preview]);

  // ── Send tally updates to cameras ─────────────────────────────────────────
  const sendTally = useCallback((cameraId, state) => {
    wsRef.current?.send(JSON.stringify({ type: "tally", cameraId, state }));
  }, []);

  // ── Cut ────────────────────────────────────────────────────────────────────
  const handleCut = useCallback(() => {
    if (preview === null) return;
    const newProgram = preview;
    const newPreview = program;

    setProgram(newProgram);
    setPreview(newPreview);

    sendTally(newProgram, "program");
    if (newPreview !== null) sendTally(newPreview, "preview");

    // Set all other cameras to idle
    cameras.forEach(cam => {
      if (cam.id !== newProgram && cam.id !== newPreview) {
        sendTally(cam.id, "idle");
      }
    });
  }, [program, preview, cameras, sendTally]);

  // ── Camera click → set preview ─────────────────────────────────────────────
  const handleCameraClick = useCallback((id) => {
    if (id === program) return;
    const oldPreview = preview;
    setPreview(id);
    sendTally(id, "preview");
    if (oldPreview !== null && oldPreview !== program) sendTally(oldPreview, "idle");
  }, [program, preview, sendTally]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); handleCut(); }
      const num = parseInt(e.key);
      if (num >= 1 && num <= cameras.length) {
        const cam = cameras[num - 1];
        if (cam?.connected && cam.id !== program) handleCameraClick(cam.id);
      }
      if (e.key === "s" || e.key === "S") setStreaming(s => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCut, handleCameraClick, cameras, program]);

  // ── Stream timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    let t;
    if (streaming) t = setInterval(() => setDuration(d => d + 1), 1000);
    else setDuration(0);
    return () => clearInterval(t);
  }, [streaming]);

  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(() => setLivePulse(p => !p), 900);
    return () => clearInterval(t);
  }, [streaming]);

  const formatTime = s => {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const connectedCount = cameras.filter(c => c.connected).length;
  const programCam = cameras.find(c => c.id === program) ?? null;
  const previewCam = cameras.find(c => c.id === preview) ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: "#e5e7eb", display: "flex", flexDirection: "column",
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Header */}
      <header style={{
        height: 52, background: "#0f1117", borderBottom: "1px solid #1f2937",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px rgba(239,68,68,0.6)" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", letterSpacing: "-0.01em" }}>PGM</span>
          <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, background: "#1f2937", padding: "2px 8px", borderRadius: "4px", marginLeft: 4 }}>
            Director
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Server status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: wsStatus === "connected" ? "#22c55e" : wsStatus === "connecting" ? "#f59e0b" : "#ef4444",
              boxShadow: wsStatus === "connected" ? "0 0 6px rgba(34,197,94,0.6)" : "none",
            }} />
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>
              {wsStatus === "connected" ? `${connectedCount} camera${connectedCount !== 1 ? "s" : ""}` : wsStatus === "connecting" ? "Connecting…" : "Disconnected"}
            </span>
          </div>

          {streaming && (
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: "6px", padding: "4px 12px",
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: livePulse ? "#ef4444" : "rgba(239,68,68,0.3)",
                transition: "background 0.2s",
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                {formatTime(duration)}
              </span>
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Camera grid */}
        <section>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
            Sources {cameras.length === 0 && <span style={{ color: "#374151", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— waiting for cameras to connect</span>}
          </p>
          {cameras.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {cameras.map(cam => (
                <CameraFeed
                  key={cam.id}
                  cam={cam}
                  isProgram={program === cam.id}
                  isPreview={preview === cam.id}
                  onClick={handleCameraClick}
                  videoRef={el => el && videoRefs.current.set(cam.id, el)}
                />
              ))}
            </div>
          ) : (
            <div style={{
              background: "#0f1117", border: "1px dashed #1f2937",
              borderRadius: "8px", padding: "32px",
              display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2 }}>
                <path d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p style={{ fontSize: 13, color: "#374151", margin: 0, fontWeight: 500 }}>Open the camera page on your iPhones to connect</p>
            </div>
          )}
        </section>

        {/* Monitors + switcher */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 88px 1fr", gap: 16, alignItems: "start" }}>
          <Monitor
            cam={previewCam}
            isProgram={false}
            videoRef={el => { monitorRefs.current.preview = el; }}
          />

          {/* Switcher buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 32 }}>
            {[
              { label: "Cut", action: handleCut },
              { label: "Auto", action: handleCut },
            ].map(btn => (
              <button key={btn.label} onClick={btn.action} style={{
                width: "100%", background: "#1a2030", border: "1px solid #2a3447",
                borderRadius: "6px", color: "#d1d5db", fontSize: 11, fontWeight: 600,
                letterSpacing: "0.06em", padding: "10px 0", cursor: "pointer",
                fontFamily: "inherit", textTransform: "uppercase", outline: "none",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#1f2840"}
                onMouseLeave={e => e.currentTarget.style.background = "#1a2030"}
              >
                {btn.label}
              </button>
            ))}

            <div style={{ height: 1, background: "#1f2937", margin: "4px 0" }} />

            <button
              onClick={() => setStreaming(s => !s)}
              style={{
                width: "100%",
                background: streaming ? "#1f1215" : "#1a2030",
                border: `1px solid ${streaming ? "#3f1a1a" : "#2a3447"}`,
                borderRadius: "6px",
                color: streaming ? "#ef4444" : "#d1d5db",
                fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                padding: "10px 0", cursor: "pointer",
                fontFamily: "inherit", textTransform: "uppercase", outline: "none",
                transition: "all 0.15s",
              }}
            >
              {streaming ? "Stop" : "Stream"}
            </button>
          </div>

          <Monitor
            cam={programCam}
            isProgram={true}
            videoRef={el => { monitorRefs.current.program = el; }}
          />
        </section>

        {/* Status bar */}
        <section style={{
          background: "#0f1117", border: "1px solid #1f2937",
          borderRadius: "8px", padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", gap: 20 }}>
            {cameras.map(cam => (
              <div key={cam.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: program === cam.id ? "#ef4444" : preview === cam.id ? "#22c55e" : cam.connected ? "#1f2937" : "#111418",
                  boxShadow: program === cam.id ? "0 0 6px rgba(239,68,68,0.7)" : preview === cam.id ? "0 0 6px rgba(34,197,94,0.5)" : "none",
                  transition: "all 0.15s",
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: program === cam.id ? "#ef4444" : preview === cam.id ? "#22c55e" : cam.connected ? "#6b7280" : "#1f2937",
                }}>{cam.name}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <ShortcutKey k="Space" /><span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>Cut</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <ShortcutKey k="1–4" /><span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>Preview</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <ShortcutKey k="S" /><span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>Stream</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
