import { useState, useEffect, useRef, useCallback } from "react";

const SERVER_URL = "wss://pgm-server.up.railway.app";
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

const getParam = (key, fallback) => {
  try { return new URLSearchParams(window.location.search).get(key) || fallback; } catch { return fallback; }
};

const slotsCacheKey = (roomId) => `pgm_mv_slots_${roomId}`;

// Load cached slots for this specific room — empty array if none
const loadCachedSlots = (roomId) => {
  try {
    const cached = JSON.parse(localStorage.getItem(slotsCacheKey(roomId)));
    return cached?.length ? cached : [];
  } catch { return []; }
};

// ── Camera tile — always 16:9 frame ─────────────────────────────────────────
const Tile = ({ cam, accent, videoRef, label }) => (
  <div style={{
    position: "relative",
    background: "#080b0f",
    border: `2px solid ${accent || "#1a2535"}`,
    borderRadius: "6px",
    overflow: "hidden",
    aspectRatio: "16/9",
    boxShadow: accent ? `0 0 16px ${accent}30` : "none",
    transition: "border-color 0.15s",
  }}>
    {/* Video — always contained within 16:9 frame */}
    <video ref={videoRef} autoPlay playsInline muted style={{
      position: "absolute", inset: 0,
      width: "100%", height: "100%",
      objectFit: "contain",
      display: cam?.hasStream ? "block" : "none",
      background: "#000",
    }} />

    {/* No signal / connecting state */}
    {!cam?.hasStream && (
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 5,
      }}>
        {cam?.connected ? (
          <>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
            <span style={{ fontSize: 9, color: "#374151", fontWeight: 500 }}>Connecting…</span>
          </>
        ) : (
          <span style={{ fontSize: 9, color: "#1f2937", fontWeight: 500 }}>No signal</span>
        )}
      </div>
    )}

    {/* Bottom label */}
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: "14px 8px 5px",
      background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
    }}>
      {label && (
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
          color: accent, textTransform: "uppercase",
          background: `${accent}22`, padding: "2px 5px", borderRadius: "3px",
        }}>{label}</span>
      )}
      {cam && (
        <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 500, marginLeft: "auto" }}>
          {cam.name}{cam.label ? ` · ${cam.label}` : ""}
        </span>
      )}
    </div>
  </div>
);

// ── Monitor — always 16:9 frame, slightly smaller than half-width ────────────
const Monitor = ({ cam, isProgram, videoRef }) => {
  const accent = isProgram ? "#ef4444" : "#22c55e";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${accent}99` }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {isProgram ? "Program" : "Preview"}
        </span>
      </div>
      <div style={{
        position: "relative",
        background: "#080b0f",
        border: `2px solid ${accent}`,
        borderRadius: "8px",
        overflow: "hidden",
        aspectRatio: "16/9",
        boxShadow: `0 0 24px ${accent}20`,
      }}>
        <video ref={videoRef} autoPlay playsInline muted style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain", background: "#000",
          display: cam?.hasStream ? "block" : "none",
        }} />
        {!cam?.hasStream && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: isProgram ? "#2a0a0a" : "#0a1a0a", fontWeight: 500 }}>
              {cam ? `${cam.name}${cam.label ? ` — ${cam.label}` : ""}` : "No source"}
            </span>
          </div>
        )}
        {/* Badge */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: accent, color: isProgram ? "#fff" : "#000",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
          padding: "2px 7px", borderRadius: "4px", textTransform: "uppercase",
        }}>{isProgram ? "PGM" : "PVW"}</div>
      </div>
    </div>
  );
};

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Multiviewer() {
  const roomId = getParam("room", null);

  // Slots: all configured cameras (from director config)
  // Start with room-specific cached slots so grid persists across refreshes
  const [slots, setSlots] = useState(() => loadCachedSlots(roomId || ""));

  // Live status per camera id
  const [liveStatus, setLiveStatus] = useState(new Map());

  // Tally: cameraId -> "program" | "preview" | "idle"
  const [tally, setTally] = useState({});

  const [wsStatus, setWsStatus] = useState("connecting");
  const [clock, setClock] = useState(new Date());

  const wsRef           = useRef(null);
  const peerConnections = useRef(new Map());
  const streamsRef      = useRef(new Map());
  const tileRefs        = useRef(new Map()); // cameraId -> tile video el
  const pgmRef          = useRef(null);
  const pvwRef          = useRef(null);

  // Merged view: always show ALL slots, overlay live status
  const cameras = slots.map(slot => ({
    ...slot,
    ...(liveStatus.get(slot.id) || { connected: false, hasStream: false }),
  }));

  const programCam = cameras.find(c => tally[c.id] === "program") ?? null;
  const previewCam = cameras.find(c => tally[c.id] === "preview") ?? null;

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Apply stream to a video element ───────────────────────────────────────
  const applyStream = useCallback((cameraId) => {
    const stream = streamsRef.current.get(cameraId);
    if (!stream) return;
    const tile = tileRefs.current.get(cameraId);
    if (tile) tile.srcObject = stream;
    // Update monitors if assigned
    setTally(prev => {
      if (prev[cameraId] === "program" && pgmRef.current) pgmRef.current.srcObject = stream;
      if (prev[cameraId] === "preview" && pvwRef.current) pvwRef.current.srcObject = stream;
      return prev;
    });
  }, []);

  // Reapply to monitors when tally changes
  useEffect(() => {
    Object.entries(tally).forEach(([cameraId, state]) => {
      const stream = streamsRef.current.get(cameraId);
      if (!stream) return;
      if (state === "program" && pgmRef.current) pgmRef.current.srcObject = stream;
      if (state === "preview" && pvwRef.current) pvwRef.current.srcObject = stream;
    });
  }, [tally]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const initiatePeerConnection = useCallback(async (cameraId) => {
    peerConnections.current.get(cameraId)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      streamsRef.current.set(cameraId, stream);
      setLiveStatus(prev => {
        const next = new Map(prev);
        next.set(cameraId, { ...(next.get(cameraId) || {}), hasStream: true });
        return next;
      });
      // Apply stream after state updates
      setTimeout(() => applyStream(cameraId), 50);
    };

    pc.onconnectionstatechange = () => {
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
  }, [applyStream]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const connect = () => {
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        // Clear any stale generic cache from old versions
        try { localStorage.removeItem("pgm_mv_slots"); } catch {}
        ws.send(JSON.stringify({ type: "register", role: "viewer", roomId }));
      };

      ws.onclose = () => { setWsStatus("disconnected"); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus("disconnected");

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {

          // Full slot config from director — replace all slots
          case "room-slots": {
            if (msg.slots?.length) {
              setSlots(msg.slots);
              try { localStorage.setItem(slotsCacheKey(roomId), JSON.stringify(msg.slots)); } catch {}
            }
            break;
          }

          // A camera came online — update its live status
          case "camera-connected": {
            // If this camera isn't in our slot list yet, add it
            setSlots(prev => {
              const exists = prev.find(s => s.id === msg.cameraId);
              if (!exists) return [...prev, { id: msg.cameraId, name: msg.name, label: msg.label }];
              return prev;
            });
            setLiveStatus(prev => {
              const next = new Map(prev);
              next.set(msg.cameraId, { ...(next.get(msg.cameraId) || {}), connected: true });
              return next;
            });
            await initiatePeerConnection(msg.cameraId);
            break;
          }

          case "camera-disconnected": {
            setLiveStatus(prev => {
              const next = new Map(prev);
              next.set(msg.cameraId, { connected: false, hasStream: false });
              return next;
            });
            streamsRef.current.delete(msg.cameraId);
            peerConnections.current.get(msg.cameraId)?.close();
            peerConnections.current.delete(msg.cameraId);
            break;
          }

          case "camera-renamed": {
            setSlots(prev => prev.map(s => s.id === msg.cameraId ? { ...s, name: msg.name, label: msg.label } : s));
            break;
          }

          case "tally": {
            setTally(prev => ({ ...prev, [msg.cameraId]: msg.state }));
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
  }, [roomId, initiatePeerConnection]);

  const connectedCount = cameras.filter(c => c.connected).length;

  const formatClock = (d) => d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  if (!roomId) {
    return (
      <div style={{ height: "100vh", background: "#060810", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#4b5563", fontSize: 13 }}>Open from the Director Console.</p>
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh", overflow: "hidden", background: "#060810",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: "#e5e7eb", display: "flex", flexDirection: "column",
    }}>

      {/* Header */}
      <header style={{
        height: 44, flexShrink: 0,
        background: "#080b10", borderBottom: "1px solid #141a24",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.6)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", letterSpacing: "-0.01em" }}>PGM</span>
          <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, background: "#141a24", padding: "2px 8px", borderRadius: "4px", marginLeft: 2 }}>Multiviewer</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: wsStatus === "connected" ? "#22c55e" : "#f59e0b",
              boxShadow: wsStatus === "connected" ? "0 0 5px rgba(34,197,94,0.6)" : "none",
            }} />
            <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>
              {connectedCount} of {cameras.length} online
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#d1d5db", fontVariantNumeric: "tabular-nums", fontFamily: "monospace", letterSpacing: "0.05em" }}>
            {formatClock(clock)}
          </span>
        </div>
      </header>

      {/* Body — no scroll, everything fits */}
      <main style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 12,
      }}>

        {/* Sources — always 4 columns, always all slots, 16:9 tiles */}
        <section style={{ flexShrink: 0 }}>
          <p style={{ fontSize: 9, fontWeight: 600, color: "#1f2937", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            Sources
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
          }}>
            {/* Always show 4 slots — pad with empties if fewer configured */}
            {[...cameras, ...Array(Math.max(0, 4 - cameras.length)).fill(null)].map((cam, i) => {
              const tallyState = cam ? tally[cam.id] : null;
              const accent = tallyState === "program" ? "#ef4444" : tallyState === "preview" ? "#22c55e" : null;
              return (
                <Tile
                  key={cam?.id || `empty-${i}`}
                  cam={cam}
                  accent={accent}
                  label={tallyState === "program" ? "PGM" : tallyState === "preview" ? "PVW" : null}
                  videoRef={el => cam && el && tileRefs.current.set(cam.id, el)}
                />
              );
            })}
          </div>
        </section>

        {/* PVW + PGM — 16:9 frames, centred, ~38% wide each */}
        <section style={{
          flex: 1, minHeight: 0,
          display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 16,
        }}>
          <div style={{ width: "38%", minWidth: 0 }}>
            <Monitor cam={previewCam} isProgram={false} videoRef={el => { pvwRef.current = el; }} />
          </div>
          <div style={{ width: "38%", minWidth: 0 }}>
            <Monitor cam={programCam} isProgram={true} videoRef={el => { pgmRef.current = el; }} />
          </div>
        </section>

      </main>
    </div>
  );
}
