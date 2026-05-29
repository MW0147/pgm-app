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

const saveState = (state) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };
const loadState = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };

// ── Small components ─────────────────────────────────────────────────────────

const ShortcutKey = ({ k }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "#1a1f2a", border: "1px solid #2d3748", borderRadius: "4px",
    padding: "1px 6px", fontSize: 10, fontWeight: 600, color: "#9ca3af", minWidth: 20,
  }}>{k}</span>
);

const CameraFeed = ({ cam, isProgram, isPreview, onClick, videoRef, onVideoLoad }) => (
  <div
    onClick={() => cam.connected && onClick(cam.id)}
    style={{
      position: "relative", background: "#0d1117",
      border: isProgram ? "2px solid #ef4444" : isPreview ? "2px solid #22c55e" : "2px solid #1f2937",
      borderRadius: "8px", cursor: cam.connected ? "pointer" : "default",
      overflow: "hidden", height: "100%",
      transition: "border-color 0.15s, box-shadow 0.15s",
      boxShadow: isProgram
        ? "0 0 0 1px rgba(239,68,68,0.15), 0 4px 24px rgba(239,68,68,0.12)"
        : isPreview ? "0 0 0 1px rgba(34,197,94,0.1), 0 4px 24px rgba(34,197,94,0.08)"
        : "0 2px 8px rgba(0,0,0,0.4)",
    }}
  >
    <video
      ref={videoRef}
      autoPlay playsInline muted
      onLoadedMetadata={onVideoLoad}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        objectFit: cam.isPortrait ? "contain" : "cover",
        display: cam.hasStream ? "block" : "none",
        background: "#000",
      }}
    />
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
            <span style={{ fontSize: 10, color: "#2a3545", fontWeight: 500 }}>No signal</span>
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
    <div style={{
      position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: "50%",
      background: isProgram ? "#ef4444" : isPreview ? "#22c55e" : cam.connected ? "#22c55e20" : "#1f2937",
      boxShadow: isProgram ? "0 0 8px rgba(239,68,68,0.8)" : isPreview ? "0 0 8px rgba(34,197,94,0.7)" : "none",
      transition: "background 0.15s, box-shadow 0.15s",
    }} />
  </div>
);

const Monitor = ({ cam, isProgram, videoRef }) => (
  <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, flexShrink: 0 }}>
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
      flex: 1, minHeight: 0, background: "#0d1117",
      border: `2px solid ${isProgram ? "#ef4444" : "#22c55e"}`,
      borderRadius: "8px", position: "relative", overflow: "hidden",
      boxShadow: isProgram ? "0 0 32px rgba(239,68,68,0.12)" : "0 0 24px rgba(34,197,94,0.08)",
    }}>
      <video ref={videoRef} autoPlay playsInline muted style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: cam?.isPortrait ? "contain" : "cover",
        display: cam?.hasStream ? "block" : "none",
        background: "#000",
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

// ── Camera Drawer ─────────────────────────────────────────────────────────────
const CameraDrawer = ({ open, onClose, cameraSlots, roomId, onAdd, onUpdate, onRemove }) => {
  const [copied, setCopied] = useState(null);

  const getLink = (cam) => {
    const params = new URLSearchParams({ room: roomId, id: cam.id, name: cam.name, label: cam.label });
    return `${BASE_URL}/camera?${params.toString()}`;
  };

  const copyLink = async (cam) => {
    await navigator.clipboard.writeText(getLink(cam));
    setCopied(cam.id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40, backdropFilter: "blur(2px)" }} />}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
        background: "#0f1117", borderLeft: "1px solid #1f2937",
        zIndex: 50, display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.4)" : "none",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Camera Setup</p>
            {roomId && (
              <p style={{ fontSize: 10, color: "#374151", margin: "3px 0 0", fontFamily: "monospace" }}>
                Room: <span style={{ color: "#4b5563" }}>{roomId}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #1f2937", borderRadius: "6px", color: "#6b7280", fontSize: 16, width: 32, height: 32, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {cameraSlots.map((cam, i) => (
            <div key={cam.id} style={{ background: "#080b0f", border: "1px solid #1f2937", borderRadius: "10px", padding: "14px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input value={cam.name} onChange={e => onUpdate(i, "name", e.target.value)} placeholder="Camera name"
                  style={{ flex: 1, background: "#0f1117", border: "1px solid #1f2937", borderRadius: "6px", color: "#f9fafb", fontSize: 12, fontWeight: 600, padding: "7px 10px", fontFamily: "inherit", outline: "none" }} />
                <input value={cam.label} onChange={e => onUpdate(i, "label", e.target.value)} placeholder="Label"
                  style={{ flex: 1, background: "#0f1117", border: "1px solid #1f2937", borderRadius: "6px", color: "#f9fafb", fontSize: 12, padding: "7px 10px", fontFamily: "inherit", outline: "none" }} />
                {cameraSlots.length > 1 && (
                  <button onClick={() => onRemove(i)} style={{ background: "transparent", border: "1px solid #1f2937", borderRadius: "6px", color: "#4b5563", fontSize: 14, padding: "0 10px", cursor: "pointer", fontFamily: "inherit" }}>×</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <div style={{ flex: 1, background: "#0a0d11", border: "1px solid #1a2535", borderRadius: "6px", padding: "7px 10px", fontSize: 10, color: "#374151", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {roomId ? getLink(cam) : "Connecting to server…"}
                </div>
                <button onClick={() => copyLink(cam)} disabled={!roomId} style={{
                  background: copied === cam.id ? "rgba(34,197,94,0.1)" : "#1a2030",
                  border: `1px solid ${copied === cam.id ? "#22c55e" : "#2a3447"}`,
                  borderRadius: "6px", color: copied === cam.id ? "#22c55e" : "#9ca3af",
                  fontSize: 10, fontWeight: 600, padding: "0 12px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
                }}>{copied === cam.id ? "Copied!" : "Copy"}</button>
              </div>
            </div>
          ))}
          <button onClick={onAdd} style={{
            background: "transparent", border: "1px dashed #1f2937", borderRadius: "8px",
            color: "#4b5563", fontSize: 12, fontWeight: 600, padding: "12px",
            cursor: "pointer", fontFamily: "inherit",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#6b7280"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; e.currentTarget.style.color = "#4b5563"; }}
          >+ Add camera</button>
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid #1f2937", flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: "#374151", margin: 0, lineHeight: 1.6 }}>
            Each link is unique to this show. Send via iMessage to your camera operators.
          </p>
        </div>
      </div>
    </>
  );
};

// ── Main Director ─────────────────────────────────────────────────────────────
export default function Director() {
  const saved = loadState();

  const [cameraSlots, setCameraSlots] = useState(saved.cameraSlots || [
    { id: generateId(), name: "Cam 1", label: "Stage Left" },
    { id: generateId(), name: "Cam 2", label: "Centre Stage" },
    { id: generateId(), name: "Cam 3", label: "Stage Right" },
  ]);
  const [liveStatuses, setLiveStatuses] = useState(new Map()); // cameraId -> { connected, hasStream, isPortrait }
  const [program, setProgram] = useState(saved.program || null);
  const [preview, setPreview] = useState(saved.preview || null);
  const [streaming, setStreaming] = useState(false);
  const [duration, setDuration] = useState(0);
  const [livePulse, setLivePulse] = useState(true);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [roomId, setRoomId] = useState(saved.roomId || null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const wsRef = useRef(null);
  const peerConnections = useRef(new Map());
  const videoRefs = useRef(new Map());
  const monitorRefs = useRef({ program: null, preview: null });
  const streamsRef = useRef(new Map()); // cameraId -> MediaStream (source of truth for streams)

  // ── Merged view: slots + live status ───────────────────────────────────────
  const mergedCameras = cameraSlots.map(slot => ({
    ...slot,
    ...(liveStatuses.get(slot.id) || { connected: false, hasStream: false, isPortrait: false }),
  }));

  // ── Persist state ──────────────────────────────────────────────────────────
  useEffect(() => {
    saveState({ program, preview, cameraSlots, roomId });
  }, [program, preview, cameraSlots, roomId]);

  // ── Sync slot config to server so multiviewer can see all cameras ───────────
  useEffect(() => {
    if (roomId && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "set-slots", slots: cameraSlots }));
    }
  }, [cameraSlots, roomId]);

  // ── Warn on refresh during live show ──────────────────────────────────────
  useEffect(() => {
    const onBeforeUnload = (e) => {
      const anyConnected = Array.from(liveStatuses.values()).some(s => s.connected);
      if (streaming || anyConnected) {
        e.preventDefault();
        e.returnValue = "You have an active show. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [streaming, liveStatuses]);

  // ── sendTally ──────────────────────────────────────────────────────────────
  const sendTally = useCallback((cameraId, state) => {
    wsRef.current?.send(JSON.stringify({ type: "tally", cameraId, state }));
  }, []);

  // ── Apply stream to a monitor video element ────────────────────────────────
  const applyStreamToMonitor = useCallback((cameraId, role) => {
    const stream = streamsRef.current.get(cameraId);
    const el = monitorRefs.current[role];
    if (stream && el) {
      el.srcObject = stream;
    }
  }, []);

  // Re-apply streams whenever program/preview changes
  useEffect(() => { if (program) applyStreamToMonitor(program, "program"); }, [program, applyStreamToMonitor]);
  useEffect(() => { if (preview) applyStreamToMonitor(preview, "preview"); }, [preview, applyStreamToMonitor]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const initiatePeerConnection = useCallback(async (cameraId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (event) => {
      console.log(`[PGM] Track received from ${cameraId}`);
      const stream = event.streams[0] || new MediaStream([event.track]);

      // Store stream as source of truth
      streamsRef.current.set(cameraId, stream);

      // Update tile video element
      const tileVideo = videoRefs.current.get(cameraId);
      if (tileVideo) tileVideo.srcObject = stream;

      // Update monitors if this camera is currently assigned
      applyStreamToMonitor(cameraId, "program");
      applyStreamToMonitor(cameraId, "preview");

      // Mark as having a stream
      setLiveStatuses(prev => {
        const next = new Map(prev);
        next.set(cameraId, { ...(next.get(cameraId) || {}), connected: true, hasStream: true });
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[PGM] ${cameraId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed") pc.restartIce();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ice-candidate", to: cameraId, candidate: e.candidate }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current?.send(JSON.stringify({ type: "sdp-offer", to: cameraId, sdp: offer }));
  }, [applyStreamToMonitor]);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        // Rejoin existing room or create a new one
        const savedRoom = loadState().roomId;
        ws.send(JSON.stringify({ type: "register", role: "director", roomId: savedRoom || undefined }));
      };

      ws.onclose = () => { setWsStatus("disconnected"); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus("disconnected");

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {

          case "room-assigned": {
            setRoomId(msg.roomId);
            // Send current slot config to server immediately
            const currentSlots = loadState().cameraSlots || [];
            if (currentSlots.length > 0) {
              ws.send(JSON.stringify({ type: "set-slots", slots: currentSlots }));
            }
            break;
          }

          case "camera-connected": {
            setLiveStatuses(prev => {
              const next = new Map(prev);
              next.set(msg.cameraId, { ...(next.get(msg.cameraId) || {}), connected: true, hasStream: false });
              return next;
            });

            // Send tally if this camera has a saved role
            const s = loadState();
            if (s.program === msg.cameraId) setTimeout(() => sendTally(msg.cameraId, "program"), 500);
            else if (s.preview === msg.cameraId) setTimeout(() => sendTally(msg.cameraId, "preview"), 500);

            await initiatePeerConnection(msg.cameraId);
            break;
          }

          case "camera-disconnected": {
            setLiveStatuses(prev => {
              const next = new Map(prev);
              next.set(msg.cameraId, { connected: false, hasStream: false, isPortrait: false });
              return next;
            });
            streamsRef.current.delete(msg.cameraId);
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

  // ── Cut ────────────────────────────────────────────────────────────────────
  const handleCut = useCallback(() => {
    if (!preview) return;
    const newProgram = preview;
    const newPreview = program;
    setProgram(newProgram);
    setPreview(newPreview);
    sendTally(newProgram, "program");
    if (newPreview) sendTally(newPreview, "preview");
    mergedCameras.forEach(cam => {
      if (cam.id !== newProgram && cam.id !== newPreview) sendTally(cam.id, "idle");
    });
  }, [program, preview, mergedCameras, sendTally]);

  // ── Camera click → preview ────────────────────────────────────────────────
  const handleCameraClick = useCallback((id) => {
    if (id === program) return;
    const oldPreview = preview;
    setPreview(id);
    sendTally(id, "preview");
    if (oldPreview && oldPreview !== program) sendTally(oldPreview, "idle");
  }, [program, preview, sendTally]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); handleCut(); }
      const num = parseInt(e.key);
      if (num >= 1 && num <= mergedCameras.length) {
        const cam = mergedCameras[num - 1];
        if (cam?.connected && cam.id !== program) handleCameraClick(cam.id);
      }
      if (e.key === "s" || e.key === "S") setStreaming(s => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCut, handleCameraClick, mergedCameras, program]);

  // ── Stream timer ──────────────────────────────────────────────────────────
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

  // ── Camera slot management ─────────────────────────────────────────────────
  const addCameraSlot = () => {
    setCameraSlots(prev => [...prev, { id: generateId(), name: `Cam ${prev.length + 1}`, label: "" }]);
  };

  const updateCameraSlot = (i, field, value) => {
    setCameraSlots(prev => {
      const updated = prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c);
      // Send rename to camera page if it's connected
      const slot = updated[i];
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "rename", cameraId: slot.id, name: slot.name, label: slot.label }));
      }
      return updated;
    });
  };

  const removeCameraSlot = (i) => {
    const slot = cameraSlots[i];
    // Close peer connection
    peerConnections.current.get(slot.id)?.close();
    peerConnections.current.delete(slot.id);
    streamsRef.current.delete(slot.id);
    // Clear program/preview if needed
    if (program === slot.id) setProgram(null);
    if (preview === slot.id) setPreview(null);
    // Remove from live statuses
    setLiveStatuses(prev => { const next = new Map(prev); next.delete(slot.id); return next; });
    // Remove slot
    setCameraSlots(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Vertical video detection ──────────────────────────────────────────────
  const handleVideoLoad = useCallback((cameraId, videoEl) => {
    if (!videoEl) return;
    const isPortrait = videoEl.videoHeight > videoEl.videoWidth;
    setLiveStatuses(prev => {
      const next = new Map(prev);
      next.set(cameraId, { ...(next.get(prev) || next.get(cameraId) || {}), isPortrait });
      return next;
    });
  }, []);

  const connectedCount = Array.from(liveStatuses.values()).filter(s => s.connected).length;
  const programCam = mergedCameras.find(c => c.id === program) ?? null;
  const previewCam = mergedCameras.find(c => c.id === preview) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100vh", overflow: "hidden", background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: "#e5e7eb", display: "flex", flexDirection: "column",
    }}>
      <CameraDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cameraSlots={cameraSlots}
        roomId={roomId}
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
          <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, background: "#1f2937", padding: "2px 8px", borderRadius: "4px", marginLeft: 4 }}>Director</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: wsStatus === "connected" ? "#22c55e" : wsStatus === "connecting" ? "#f59e0b" : "#ef4444",
              boxShadow: wsStatus === "connected" ? "0 0 6px rgba(34,197,94,0.6)" : "none",
            }} />
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>
              {wsStatus === "connected" ? `${connectedCount} of ${cameraSlots.length} cameras` : wsStatus === "connecting" ? "Connecting…" : "Disconnected"}
            </span>
          </div>

          {streaming && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", padding: "4px 12px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: livePulse ? "#ef4444" : "rgba(239,68,68,0.3)", transition: "background 0.2s" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{formatTime(duration)}</span>
            </div>
          )}

          <button
            onClick={() => roomId && window.open(`${window.location.origin}/multiviewer?room=${roomId}`, "_blank")}
            disabled={!roomId}
            title={roomId ? "Open Multiviewer" : "Connecting…"}
            style={{
              background: "#1a2030", border: "1px solid #2a3447", borderRadius: "6px", color: roomId ? "#d1d5db" : "#374151",
              fontSize: 11, fontWeight: 600, padding: "6px 14px", cursor: roomId ? "pointer" : "default",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
              transition: "color 0.15s",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Multiviewer
          </button>
          <button onClick={() => setDrawerOpen(true)} style={{
            background: "#1a2030", border: "1px solid #2a3447", borderRadius: "6px", color: "#d1d5db",
            fontSize: 11, fontWeight: 600, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cameras
          </button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>

        {/* Sources — always shows all slots in order */}
        <section>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
            Sources
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, height: "18vh" }}>
            {mergedCameras.map(cam => (
              <CameraFeed
                key={cam.id}
                cam={cam}
                isProgram={program === cam.id}
                isPreview={preview === cam.id}
                onClick={handleCameraClick}
                videoRef={el => el && videoRefs.current.set(cam.id, el)}
                onVideoLoad={(e) => handleVideoLoad(cam.id, e.target)}
              />
            ))}
          </div>
        </section>

        {/* Monitors + switcher */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 88px 1fr", gap: 12, flex: 1, minHeight: 0 }}>
          <Monitor cam={previewCam} isProgram={false} videoRef={el => { monitorRefs.current.preview = el; }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
            {[{ label: "Cut", action: handleCut }, { label: "Auto", action: handleCut }].map(btn => (
              <button key={btn.label} onClick={btn.action} style={{
                width: "100%", background: "#1a2030", border: "1px solid #2a3447", borderRadius: "6px",
                color: "#d1d5db", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                padding: "10px 0", cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", outline: "none",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#1f2840"}
                onMouseLeave={e => e.currentTarget.style.background = "#1a2030"}
              >{btn.label}</button>
            ))}
            <div style={{ height: 1, background: "#1f2937", margin: "4px 0" }} />
            <button onClick={() => setStreaming(s => !s)} style={{
              width: "100%", background: streaming ? "#1f1215" : "#1a2030",
              border: `1px solid ${streaming ? "#3f1a1a" : "#2a3447"}`, borderRadius: "6px",
              color: streaming ? "#ef4444" : "#d1d5db", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.06em", padding: "10px 0", cursor: "pointer",
              fontFamily: "inherit", textTransform: "uppercase", outline: "none", transition: "all 0.15s",
            }}>{streaming ? "Stop" : "Stream"}</button>
          </div>

          <Monitor cam={programCam} isProgram={true} videoRef={el => { monitorRefs.current.program = el; }} />
        </section>

        {/* Status bar */}
        <section style={{ background: "#0f1117", border: "1px solid #1f2937", borderRadius: "8px", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 20 }}>
            {mergedCameras.map(cam => (
              <div key={cam.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: program === cam.id ? "#ef4444" : preview === cam.id ? "#22c55e" : cam.connected ? "#22c55e30" : "#1f2937",
                  boxShadow: program === cam.id ? "0 0 6px rgba(239,68,68,0.7)" : preview === cam.id ? "0 0 6px rgba(34,197,94,0.5)" : "none",
                  transition: "all 0.15s",
                }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: program === cam.id ? "#ef4444" : preview === cam.id ? "#22c55e" : cam.connected ? "#6b7280" : "#2a3545" }}>
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
