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

// A tile that fills its container — no forced aspect ratio
const FeedTile = ({ cam, label, accent, videoRef, isLarge }) => (
  <div style={{
    position: "relative", background: "#0a0d11", overflow: "hidden",
    border: `2px solid ${accent || "#1a2535"}`,
    borderRadius: isLarge ? "8px" : "6px",
    aspectRatio: "16/9",
    boxShadow: accent ? `0 0 20px ${accent}28` : "none",
    transition: "border-color 0.15s",
  }}>
    <video ref={videoRef} autoPlay playsInline muted style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      objectFit: "contain",
      display: cam?.hasStream ? "block" : "none",
      background: "#000",
    }} />

    {!cam?.hasStream && (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 5 }}>
        {cam?.connected ? (
          <>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
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
      padding: isLarge ? "20px 12px 8px" : "14px 8px 5px",
      background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    }}>
      {label && (
        <span style={{
          fontSize: isLarge ? 10 : 8, fontWeight: 700, letterSpacing: "0.1em",
          color: accent || "#6b7280", textTransform: "uppercase",
          background: accent ? `${accent}22` : "transparent",
          padding: accent ? "2px 6px" : "0", borderRadius: "3px",
        }}>{label}</span>
      )}
      {cam && (
        <span style={{ fontSize: isLarge ? 10 : 8, color: "#4b5563", fontWeight: 500 }}>
          {cam.name}{cam.label ? ` · ${cam.label}` : ""}
        </span>
      )}
    </div>
  </div>
);

export default function Multiviewer() {
  const roomId = getParam("room", null);

  // cameras: merged from room-slots + live status
  const [slots, setSlots]         = useState([]); // { id, name, label } from director config
  const [liveStatus, setLiveStatus] = useState(new Map()); // id -> { connected, hasStream, isPortrait }
  const [tally, setTally]         = useState({}); // cameraId -> "program"|"preview"|"idle"
  const [wsStatus, setWsStatus]   = useState("connecting");
  const [clock, setClock]         = useState(new Date());

  const wsRef           = useRef(null);
  const peerConnections = useRef(new Map());
  const streamsRef      = useRef(new Map());
  const videoRefs       = useRef(new Map());
  const pgmRef          = useRef(null);
  const pvwRef          = useRef(null);

  // Merged view: all slots with live status overlaid
  const cameras = slots.map(slot => ({
    ...slot,
    ...(liveStatus.get(slot.id) || { connected: false, hasStream: false, isPortrait: false }),
  }));

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Update monitors when tally changes
  useEffect(() => {
    Object.entries(tally).forEach(([cameraId, state]) => {
      const stream = streamsRef.current.get(cameraId);
      if (!stream) return;
      if (state === "program" && pgmRef.current) pgmRef.current.srcObject = stream;
      if (state === "preview" && pvwRef.current) pvwRef.current.srcObject = stream;
    });
  }, [tally]);

  const initiatePeerConnection = useCallback(async (cameraId) => {
    peerConnections.current.get(cameraId)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      streamsRef.current.set(cameraId, stream);

      const tile = videoRefs.current.get(cameraId);
      if (tile) tile.srcObject = stream;

      setTally(prev => {
        if (prev[cameraId] === "program" && pgmRef.current) pgmRef.current.srcObject = stream;
        if (prev[cameraId] === "preview" && pvwRef.current) pvwRef.current.srcObject = stream;
        return prev;
      });

      setLiveStatus(prev => {
        const next = new Map(prev);
        next.set(cameraId, { ...(next.get(cameraId) || {}), hasStream: true });
        return next;
      });
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
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const connect = () => {
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        ws.send(JSON.stringify({ type: "register", role: "viewer", roomId }));
      };

      ws.onclose = () => { setWsStatus("disconnected"); setTimeout(connect, 3000); };
      ws.onerror = () => setWsStatus("disconnected");

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {

          case "room-slots":
            // Full camera config from director — show all slots even if disconnected
            setSlots(msg.slots || []);
            break;

          case "camera-connected":
            // Mark as connected; if not in slots yet add it
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

          case "camera-disconnected":
            setLiveStatus(prev => {
              const next = new Map(prev);
              next.set(msg.cameraId, { connected: false, hasStream: false, isPortrait: false });
              return next;
            });
            streamsRef.current.delete(msg.cameraId);
            peerConnections.current.get(msg.cameraId)?.close();
            peerConnections.current.delete(msg.cameraId);
            break;

          case "camera-renamed":
            setSlots(prev => prev.map(s => s.id === msg.cameraId ? { ...s, name: msg.name, label: msg.label } : s));
            break;

          case "tally":
            setTally(prev => ({ ...prev, [msg.cameraId]: msg.state }));
            break;

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

  const programCam = cameras.find(c => tally[c.id] === "program") ?? null;
  const previewCam = cameras.find(c => tally[c.id] === "preview") ?? null;

  const formatClock = (d) => d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  if (!roomId) {
    return (
      <div style={{ height: "100vh", background: "#060810", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#4b5563", fontSize: 13 }}>Open this from the Director Console.</p>
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
        height: 44, background: "#080b10", borderBottom: "1px solid #141a24",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", flexShrink: 0,
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
              {cameras.filter(c => c.connected).length} of {cameras.length} online
            </span>
          </div>
          {/* Bright clock */}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#d1d5db", fontVariantNumeric: "tabular-nums", fontFamily: "monospace", letterSpacing: "0.05em" }}>
            {formatClock(clock)}
          </span>
        </div>
      </header>

      {/* Main — no scroll, everything fits */}
      <main style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10,
      }}>

        {/* Sources — all slots in order, fixed height */}
        {cameras.length > 0 && (
          <section style={{ flexShrink: 0 }}>
            <p style={{ fontSize: 9, fontWeight: 600, color: "#1f2937", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Sources</p>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(cameras.length, 1)}, 1fr)`,
              gap: 6,
            }}>
              {cameras.map(cam => {
                const tallyState = tally[cam.id];
                const accent = tallyState === "program" ? "#ef4444" : tallyState === "preview" ? "#22c55e" : null;
                return (
                  <FeedTile
                    key={cam.id}
                    cam={cam}
                    accent={accent}
                    videoRef={el => el && videoRefs.current.set(cam.id, el)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* PVW + PGM — 16:9 frames, ~25% smaller than full-width, centered */}
        <section style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 16, flexShrink: 0 }}>
          {[
            { cam: previewCam, label: "PVW", accent: "#22c55e", dotColor: "rgba(34,197,94,0.6)", ref: el => { pvwRef.current = el; }, title: "Preview" },
            { cam: programCam, label: "PGM", accent: "#ef4444", dotColor: "rgba(239,68,68,0.6)", ref: el => { pgmRef.current = el; }, title: "Program" },
          ].map(({ cam, label, accent, dotColor, ref, title }) => (
            <div key={label} style={{ width: "38%", display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${dotColor}` }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
              </div>
              <FeedTile cam={cam} label={label} accent={accent} isLarge videoRef={ref} />
            </div>
          ))}
        </section>

      </main>
    </div>
  );
}
