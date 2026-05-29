import { useState, useEffect, useRef, useCallback } from "react";

const SERVER_URL = "wss://pgm-server.up.railway.app";
const BASE_URL = window.location.origin;
const STORAGE_KEY = "pgm_show_state";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

const generateId = () => "cam-" + Math.random().toString(36).slice(2, 7);

// ── Persist / restore show state ────────────────────────────────────────────
const saveState = (state) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
};
const loadState = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
};

// ── Sub-components ───────────────────────────────────────────────────────────

const ShortcutKey = ({ k }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "#1a1f2a", border: "1px solid #2d3748",
    borderRadius: "4px", padding: "1px 6px",
    fontSize: 10, fontWeight: 600, color: "#9ca3af", minWidth: 20,
  }}>{k}</span>
);

const CameraFeed = ({ cam, isProgram, isPreview, onClick, videoRef }) => (
  <div
    onClick={() => cam.connected && onClick(cam.id)}
    style={{
      position: "relative", background: "#0d1117",
      border: isProgram ? "2px solid #ef4444" : isPreview ? "2px solid #22c55e" : "2px solid #1f2937",
      borderRadius: "8px", cursor: cam.connected ? "pointer" : "default",
      overflow: "hidden", aspectRatio: "16/9", transition: "border-color 0.15s, box-shadow 0.15s",
      boxShadow: isProgram
        ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 24px rgba(239,68,68,0.12)"
        : isPreview ? "0 0 0 1px rgba(34,197,94,0.1), 0 4px 24px rgba(34,197,94,0.08)"
        : "0 2px 8px rgba(0,0,0,0.4)",
    }}
  >
    <video ref={videoRef} autoPlay playsInline muted style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      objectFit: "cover", display: cam.hasStream ? "block" : "none",
    }} />
    {!cam.hasStream && (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
        {cam.connected ? (
          <>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.6)" }} />
            <span style={{ fontSize: 10, color: "#374151", fontWeight: 500 }}>Connecting…</span>
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.15 }}>
              <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.5"/>
              <path d="M4.5 4.5l15 15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 10, color: "#374151", fontWeight: 500 }}>No signal</span>
          </>
        )}
      </div>
    )}
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: "18px 10px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: isProgram ? "#ef4444" : isPreview ? "#22c55e" : "#9ca3af" }}>{cam.name}</span>
      <span style={{ fontSize: 10, color: "#6b7280" }}>{cam.label}</span>
    </div>
    {(isProgram || isPreview) && (
      <div style={{
        position: "absolute", top: 8, left: 8,
        background: isProgram ? "#ef4444" : "#22c55e", color: isProgram ? "#fff" : "#000",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: "4px", textTransform: "uppercase",
      }}>{isProgram ? "PGM" : "PVW"}</div>
    )}
    {cam.connected && (
      <div style={{
        position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: "50%",
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
      <video ref={videoRef} autoPlay playsInline muted style={{
        width: "100%", height: "100%", objectFit: "cover",
        display: cam?.hasStream ? "block" : "none",
      }} />
      {!cam?.hasStream && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: isProgram ? "#3f1a1a" : "#14302a", fontWeight: 500 }}>
            {cam ? `${cam.name} — ${cam.label}` : "No source"}
          </span>
        </div>
      )}
      <div style={{
        position: "absolute", top: 10, left: 10,
        background: isProgram ? "#ef4444" : "#22c55e", color: isProgram ? "#fff" : "#000",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 8px", borderRadius: "4px", textTransform: "uppercase",
      }}>{isProgram ? "PGM" : "PVW"}</div>
    </div>
  </div>
);

// ── Camera Management Drawer ─────────────────────────────────────────────────
const CameraDrawer = ({ open, onClose, cameraSlots, onAdd, onUpdate, onRemove }) => {
  const [copied, setCopied] = useState(null);

  const getLink = (cam) => {
    const params = new URLSearchParams({ id: cam.id, name: cam.name, label: cam.label });
    return `${BASE_URL}/camera?${params.toString()}`;
  };

  const copyLink = async (cam) => {
    await navigator.clipboard.writeText(getLink(cam));
    setCopied(cam.id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 40, backdropFilter: "blur(2px)",
        }} />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
        background: "#0f1117", borderLeft: "1px solid #1f2937",
        zIndex: 50, display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.4)" : "none",
      }}>
        {/* Drawer header */}
        <div style={{
          padding: "18px 20px", borderBottom: "1px solid #1f2937",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Camera Setup</p>
            <p style={{ fontSize: 11, color: "#4b5563", margin: "2px 0 0", fontWeight: 500 }}>
              Share links with your operators
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #1f2937", borderRadius: "6px",
            color: "#6b7280", fontSize: 16, width: 32, height: 32,
            cursor: "pointer", fontFamily: "inherit", display: "flex",
            alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>×</button>
        </div>

        {/* Camera list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {cameraSlots.map((cam, i) => (
            <div key={cam.id} style={{
              background: "#080b0f", border: "1px solid #1f2937",
              borderRadius: "10px", padding: "14px",
            }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={cam.name}
                  onChange={e => onUpdate(i, "name", e.target.value)}
                  placeholder="Camera name"
                  style={{
                    flex: 1, background: "#0f1117", border: "1px solid #1f2937",
                    borderRadius: "6px", color: "#f9fafb", fontSize: 12, fontWeight: 600,
                    padding: "7px 10px", fontFamily: "inherit", outline: "none",
                  }}
                />
                <input
                  value={cam.label}
                  onChange={e => onUpdate(i, "label", e.target.value)}
                  placeholder="Label"
                  style={{
                    flex: 1, background: "#0f1117", border: "1px solid #1f2937",
                    borderRadius: "6px", color: "#f9fafb", fontSize: 12,
                    padding: "7px 10px", fontFamily: "inherit", outline: "none",
                  }}
                />
                {cameraSlots.length > 1 && (
                  <button onClick={() => onRemove(i)} style={{
                    background: "transparent", border: "1px solid #1f2937",
                    borderRadius: "6px", color: "#4b5563", fontSize: 14,
                    padding: "0 10px", cursor: "pointer", fontFamily: "inherit",
                  }}>×</button>
                )}
              </div>

              <div style={{ display: "flex", gap: 7 }}>
                <div style={{
                  flex: 1, background: "#0a0d11", border: "1px solid #1a2535",
                  borderRadius: "6px", padding: "7px 10px",
                  fontSize: 10, color: "#374151", fontFamily: "monospace",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {getLink(cam)}
                </div>
                <button onClick={() => copyLink(cam)} style={{
                  background: copied === cam.id ? "rgba(34,197,94,0.1)" : "#1a2030",
                  border: `1px solid ${copied === cam.id ? "#22c55e" : "#2a3447"}`,
                  borderRadius: "6px", color: copied === cam.id ? "#22c55e" : "#9ca3af",
                  fontSize: 10, fontWeight: 600, padding: "0 12px",
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
                }}>
                  {copied === cam.id ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          ))}

          <button onClick={onAdd} style={{
            background: "transparent", border: "1px dashed #1f2937",
            borderRadius: "8px", color: "#4b5563", fontSize: 12, fontWeight: 600,
            padding: "12px", cursor: "pointer", fontFamily: "inherit",
            transition: "border-color 0.15s, color 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#6b7280"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; e.currentTarget.style.color = "#4b5563"; }}
          >
            + Add camera
          </button>
        </div>

        {/* Drawer footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #1f2937", flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: "#374151", margin: 0, lineHeight: 1.6 }}>
            Each link is unique. Send it to your camera operator — they open it in Safari on their iPhone.
          </p>
        </div>
      </div>
    </>
  );
};

// ── Main Director Component ──────────────────────────────────────────────────
export default function Director() {
  // Restore persisted state
  const saved = loadState();

  const [cameras, setCameras] = useState([]); // live connected cameras
  const [cameraSlots, setCameraSlots] = useState(   // configured camera slots
    saved.cameraSlots || [
      { id: generateId(), name: "Cam 1", label: "Stage Left" },
      { id: generateId(), name: "Cam 2", label: "Centre Stage" },
      { id: generateId(), name: "Cam 3", label: "Stage Right" },
    ]
  );
  const [program, setProgram] = useState(saved.program || null);
  const [preview, setPreview] = useState(saved.preview || null);
  const [streaming, setStreaming] = useState(false);
  const [duration, setDuration] = useState(0);
  const [livePulse, setLivePulse] = useState(true);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const wsRef = useRef(null);
  const peerConnections = useRef(new Map());
  const videoRefs = useRef(new Map());
  const monitorRefs = useRef({ program: null, preview: null });

  // ── Persist state on every change ──────────────────────────────────────
  useEffect(() => {
    saveState({ program, preview, cameraSlots });
  }, [program, preview, cameraSlots]);

  // ── Warn before page close during a live show ───────────────────────────
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (streaming || cameras.some(c => c.connected)) {
        e.preventDefault();
        e.returnValue = "You have an active show. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [streaming, cameras]);

  // ── sendTally ───────────────────────────────────────────────────────────
  const sendTally = useCallback((cameraId, state) => {
    wsRef.current?.send(JSON.stringify({ type: "tally", cameraId, state }));
  }, []);

  // ── Update monitor video when program/preview changes ──────────────────
  const updateMonitorStream = useCallback((cameraId, role) => {
    const pc = peerConnections.current.get(cameraId);
    if (!pc) return;
    const videoTrack = pc.getReceivers().find(r => r.track?.kind === "video")?.track;
    const el = monitorRefs.current[role];
    if (videoTrack && el) {
      el.srcObject = new MediaStream([videoTrack]);
    }
  }, []);

  useEffect(() => { if (program) updateMonitorStream(program, "program"); }, [program, updateMonitorStream]);
  useEffect(() => { if (preview) updateMonitorStream(preview, "preview"); }, [preview, updateMonitorStream]);

  // ── WebRTC peer connection ──────────────────────────────────────────────
  const initiatePeerConnection = useCallback(async (cameraId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (event) => {
      console.log(`[PGM] Track received from ${cameraId}`);
      const stream = event.streams[0] || new MediaStream([event.track]);

      setCameras(prev => prev.map(c => c.id === cameraId ? { ...c, hasStream: true } : c));

      const tileVideo = videoRefs.current.get(cameraId);
      if (tileVideo) tileVideo.srcObject = stream;

      setProgram(prog => {
        if (prog === cameraId && monitorRefs.current.program) monitorRefs.current.program.srcObject = stream;
        return prog;
      });
      setPreview(prev => {
        if (prev === cameraId && monitorRefs.current.preview) monitorRefs.current.preview.srcObject = stream;
        return prev;
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[PGM] ${cameraId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed") pc.restartIce();
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[PGM] ${cameraId} ICE: ${pc.iceConnectionState}`);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ice-candidate", to: cameraId, candidate: e.candidate }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log(`[PGM] Sending offer to ${cameraId}`);
    wsRef.current?.send(JSON.stringify({ type: "sdp-offer", to: cameraId, sdp: offer }));
  }, []);

  // ── WebSocket ───────────────────────────────────────────────────────────
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

              // Restore persisted assignments or auto-assign
              const saved = loadState();
              if (saved.program === msg.cameraId) {
                setTimeout(() => sendTally(msg.cameraId, "program"), 500);
              } else if (saved.preview === msg.cameraId) {
                setTimeout(() => sendTally(msg.cameraId, "preview"), 500);
              } else {
                // Auto-assign if no saved state
                if (!saved.program && updated.length === 1) {
                  setProgram(msg.cameraId);
                  setTimeout(() => sendTally(msg.cameraId, "program"), 500);
                } else if (!saved.preview && updated.length === 2) {
                  setPreview(msg.cameraId);
                  setTimeout(() => sendTally(msg.cameraId, "preview"), 500);
                }
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
  }, [initiatePeerConnection, sendTally]);

  // ── Cut ─────────────────────────────────────────────────────────────────
  const handleCut = useCallback(() => {
    if (!preview) return;
    const newProgram = preview;
    const newPreview = program;
    setProgram(newProgram);
    setPreview(newPreview);
    sendTally(newProgram, "program");
    if (newPreview) sendTally(newPreview, "preview");
    cameras.forEach(cam => {
      if (cam.id !== newProgram && cam.id !== newPreview) sendTally(cam.id, "idle");
    });
  }, [program, preview, cameras, sendTally]);

  // ── Camera click → preview ───────────────────────────────────────────────
  const handleCameraClick = useCallback((id) => {
    if (id === program) return;
    const oldPreview = preview;
    setPreview(id);
    sendTally(id, "preview");
    if (oldPreview && oldPreview !== program) sendTally(oldPreview, "idle");
  }, [program, preview, sendTally]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
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

  // ── Stream timer ─────────────────────────────────────────────────────────
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

  // ── Camera slot management ───────────────────────────────────────────────
  const addCameraSlot = () => {
    setCameraSlots(prev => [...prev, { id: generateId(), name: `Cam ${prev.length + 1}`, label: "" }]);
  };
  const updateCameraSlot = (i, field, value) => {
    setCameraSlots(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };
  const removeCameraSlot = (i) => {
    setCameraSlots(prev => prev.filter((_, idx) => idx !== i));
  };

  const connectedCount = cameras.filter(c => c.connected).length;
  const programCam = cameras.find(c => c.id === program) ?? null;
  const previewCam = cameras.find(c => c.id === preview) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: "#e5e7eb", display: "flex", flexDirection: "column",
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <CameraDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cameraSlots={cameraSlots}
        onAdd={addCameraSlot}
        onUpdate={updateCameraSlot}
        onRemove={removeCameraSlot}
      />

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

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

          {/* Stream timer */}
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

          {/* Cameras button */}
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              background: "#1a2030", border: "1px solid #2a3447",
              borderRadius: "6px", color: "#d1d5db",
              fontSize: 11, fontWeight: 600, padding: "6px 14px",
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cameras
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Sources grid */}
        <section>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
            Sources {cameras.length === 0 && (
              <span style={{ color: "#374151", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                — open <button onClick={() => setDrawerOpen(true)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline", padding: 0 }}>Cameras</button> to get links for your operators
              </span>
            )}
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
              background: "#0f1117", border: "1px dashed #1f2937", borderRadius: "8px", padding: "32px",
              display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2 }}>
                <path d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p style={{ fontSize: 13, color: "#374151", margin: 0, fontWeight: 500 }}>Waiting for cameras to connect</p>
            </div>
          )}
        </section>

        {/* Monitors + switcher */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 88px 1fr", gap: 16, alignItems: "start" }}>
          <Monitor cam={previewCam} isProgram={false} videoRef={el => { monitorRefs.current.preview = el; }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 32 }}>
            {[{ label: "Cut", action: handleCut }, { label: "Auto", action: handleCut }].map(btn => (
              <button key={btn.label} onClick={btn.action} style={{
                width: "100%", background: "#1a2030", border: "1px solid #2a3447",
                borderRadius: "6px", color: "#d1d5db", fontSize: 11, fontWeight: 600,
                letterSpacing: "0.06em", padding: "10px 0", cursor: "pointer",
                fontFamily: "inherit", textTransform: "uppercase", outline: "none",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#1f2840"}
                onMouseLeave={e => e.currentTarget.style.background = "#1a2030"}
              >{btn.label}</button>
            ))}
            <div style={{ height: 1, background: "#1f2937", margin: "4px 0" }} />
            <button onClick={() => setStreaming(s => !s)} style={{
              width: "100%", background: streaming ? "#1f1215" : "#1a2030",
              border: `1px solid ${streaming ? "#3f1a1a" : "#2a3447"}`,
              borderRadius: "6px", color: streaming ? "#ef4444" : "#d1d5db",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
              padding: "10px 0", cursor: "pointer", fontFamily: "inherit",
              textTransform: "uppercase", outline: "none", transition: "all 0.15s",
            }}>
              {streaming ? "Stop" : "Stream"}
            </button>
          </div>

          <Monitor cam={programCam} isProgram={true} videoRef={el => { monitorRefs.current.program = el; }} />
        </section>

        {/* Status bar */}
        <section style={{
          background: "#0f1117", border: "1px solid #1f2937", borderRadius: "8px",
          padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
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
                <span style={{ fontSize: 11, fontWeight: 500, color: program === cam.id ? "#ef4444" : preview === cam.id ? "#22c55e" : cam.connected ? "#6b7280" : "#1f2937" }}>
                  {cam.name}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {[["Space", "Cut"], ["1–4", "Preview"], ["S", "Stream"]].map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <ShortcutKey k={key} /><span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
