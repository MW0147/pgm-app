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

const FeedTile = ({ cam, label, accent, videoRef, large = false }) => (
  <div style={{
    position: "relative", background: "#0a0d11",
    border: `2px solid ${accent || "#1f2937"}`,
    borderRadius: large ? "8px" : "6px",
    overflow: "hidden",
    aspectRatio: "16/9",
    boxShadow: accent ? `0 0 24px ${accent}28` : "none",
    transition: "border-color 0.15s",
  }}>
    <video ref={videoRef} autoPlay playsInline muted style={{
      width: "100%", height: "100%",
      objectFit: cam?.isPortrait ? "contain" : "cover",
      display: cam?.hasStream ? "block" : "none",
      background: "#000",
    }} />

    {!cam?.hasStream && (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
        {cam?.connected ? (
          <>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
            <span style={{ fontSize: 10, color: "#374151", fontWeight: 500 }}>Connecting…</span>
          </>
        ) : (
          <span style={{ fontSize: 10, color: "#1f2937", fontWeight: 500 }}>No signal</span>
        )}
      </div>
    )}

    {/* Bottom label */}
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: large ? "24px 12px 10px" : "16px 8px 6px",
      background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
    }}>
      {label && (
        <span style={{
          fontSize: large ? 11 : 9, fontWeight: 700, letterSpacing: "0.1em",
          color: accent || "#6b7280", textTransform: "uppercase",
          background: accent ? `${accent}22` : "transparent",
          padding: accent ? "2px 7px" : "0", borderRadius: "4px",
        }}>{label}</span>
      )}
      {cam && (
        <span style={{ fontSize: large ? 11 : 9, color: "#4b5563", fontWeight: 500 }}>
          {cam.name}{cam.label ? ` · ${cam.label}` : ""}
        </span>
      )}
    </div>
  </div>
);

export default function Multiviewer() {
  const roomId = getParam("room", null);

  const [cameras, setCameras]   = useState([]); // { id, name, label, connected, hasStream, isPortrait }
  const [tally, setTally]       = useState({}); // cameraId -> "program"|"preview"|"idle"
  const [wsStatus, setWsStatus] = useState("connecting");
  const [viewerId, setViewerId] = useState(null);
  const [clock, setClock]       = useState(new Date());

  const wsRef           = useRef(null);
  const peerConnections = useRef(new Map());
  const streamsRef      = useRef(new Map());
  const videoRefs       = useRef(new Map());       // cameraId -> tile video el
  const pgmRef          = useRef(null);
  const pvwRef          = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const applyStream = useCallback((cameraId) => {
    const stream = streamsRef.current.get(cameraId);
    if (!stream) return;
    const tile = videoRefs.current.get(cameraId);
    if (tile) tile.srcObject = stream;
    // Update monitors if needed
    const t = tally[cameraId];
    if (t === "program" && pgmRef.current) pgmRef.current.srcObject = stream;
    if (t === "preview" && pvwRef.current) pvwRef.current.srcObject = stream;
  }, [tally]);

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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      streamsRef.current.set(cameraId, stream);

      // Detect portrait
      const track = event.track;
      if (track.getSettings) {
        const { width, height } = track.getSettings();
        const isPortrait = height > width;
        setCameras(prev => prev.map(c => c.id === cameraId ? { ...c, hasStream: true, isPortrait } : c));
      } else {
        setCameras(prev => prev.map(c => c.id === cameraId ? { ...c, hasStream: true } : c));
      }

      const tile = videoRefs.current.get(cameraId);
      if (tile) tile.srcObject = stream;

      // Update monitors
      setTally(prev => {
        if (prev[cameraId] === "program" && pgmRef.current) pgmRef.current.srcObject = stream;
        if (prev[cameraId] === "preview" && pvwRef.current) pvwRef.current.srcObject = stream;
        return prev;
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[PGM Multiviewer] ${cameraId}: ${pc.connectionState}`);
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

          case "viewer-assigned":
            setViewerId(msg.viewerId);
            break;

          case "camera-connected":
            setCameras(prev => {
              const exists = prev.find(c => c.id === msg.cameraId);
              if (exists) return prev.map(c => c.id === msg.cameraId ? { ...c, connected: true, name: msg.name, label: msg.label } : c);
              return [...prev, { id: msg.cameraId, name: msg.name, label: msg.label, connected: true, hasStream: false, isPortrait: false }];
            });
            await initiatePeerConnection(msg.cameraId);
            break;

          case "camera-disconnected":
            setCameras(prev => prev.map(c => c.id === msg.cameraId ? { ...c, connected: false, hasStream: false } : c));
            peerConnections.current.get(msg.cameraId)?.close();
            peerConnections.current.delete(msg.cameraId);
            streamsRef.current.delete(msg.cameraId);
            break;

          case "camera-renamed":
            setCameras(prev => prev.map(c => c.id === msg.cameraId ? { ...c, name: msg.name, label: msg.label } : c));
            break;

          case "tally":
            setTally(prev => ({ ...prev, [msg.cameraId]: msg.state }));
            break;

          case "sdp-answer":
            const pc = peerConnections.current.get(msg.from);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            break;

          case "ice-candidate":
            const pcIce = peerConnections.current.get(msg.from);
            if (pcIce && msg.candidate) {
              try { await pcIce.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
            }
            break;
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

  const formatClock = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  if (!roomId) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#ef4444", fontSize: 14, fontWeight: 600 }}>No room ID specified</p>
          <p style={{ color: "#374151", fontSize: 12, marginTop: 8 }}>Open the Multiviewer from the Director Console.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#060810",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: "#e5e7eb", display: "flex", flexDirection: "column",
    }}>
      {/* Top bar */}
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
            <span style={{ fontSize: 10, color: "#4b5563", fontWeight: 500 }}>
              {cameras.filter(c => c.connected).length} camera{cameras.filter(c => c.connected).length !== 1 ? "s" : ""}
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
            {formatClock(clock)}
          </span>
        </div>
      </header>

      <main style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Camera grid */}
        {cameras.length > 0 && (
          <section>
            <p style={{ fontSize: 10, fontWeight: 600, color: "#2a3545", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Sources</p>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(cameras.length, 4)}, 1fr)`,
              gap: 8,
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

        {/* PVW + PGM monitors */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
          <FeedTile
            cam={previewCam}
            label="Preview"
            accent="#22c55e"
            large
            videoRef={el => { pvwRef.current = el; }}
          />
          <FeedTile
            cam={programCam}
            label="Program"
            accent="#ef4444"
            large
            videoRef={el => { pgmRef.current = el; }}
          />
        </section>

        {/* No cameras yet */}
        {cameras.length === 0 && (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: wsStatus === "connected" ? "#22c55e" : "#f59e0b" }} />
            <p style={{ fontSize: 13, color: "#374151", margin: 0, fontWeight: 500 }}>
              {wsStatus === "connected" ? "Waiting for cameras to connect…" : "Connecting to show…"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
