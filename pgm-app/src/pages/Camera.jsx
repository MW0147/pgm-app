import { useState, useEffect, useRef } from "react";

const SERVER_URL = "wss://pgm-server.up.railway.app";

// STUN + TURN for reliable connectivity across all network types
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const getUrlParam = (key, fallback) => {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get(key) || fallback;
  } catch {
    return fallback;
  }
};

const TALLY_STYLES = {
  idle:    { border: "transparent", glow: "none",                           badge: null,      badgeBg: null,      badgeColor: null  },
  preview: { border: "#22c55e",     glow: "0 0 60px rgba(34,197,94,0.15)", badge: "PREVIEW", badgeBg: "#22c55e", badgeColor: "#000" },
  program: { border: "#ef4444",     glow: "0 0 80px rgba(239,68,68,0.2)",  badge: "LIVE",    badgeBg: "#ef4444", badgeColor: "#fff" },
};

const PulsingDot = ({ color, active }) => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setOn(v => !v), 700);
    return () => clearInterval(t);
  }, [active]);
  return (
    <div style={{
      width: 10, height: 10, borderRadius: "50%",
      background: active && on ? color : "rgba(255,255,255,0.15)",
      boxShadow: active && on ? `0 0 10px ${color}` : "none",
      transition: "background 0.2s, box-shadow 0.2s",
      flexShrink: 0,
    }} />
  );
};

export default function Camera() {
  const camId    = getUrlParam("id",    "cam-" + Math.random().toString(36).slice(2, 7));
  const camName  = getUrlParam("name",  "Cam 1");
  const camLabel = getUrlParam("label", "My Camera");

  const [tally, setTally]         = useState("idle");
  const [hasCamera, setHasCamera] = useState(false);
  const [camError, setCamError]   = useState(null);
  const [wsStatus, setWsStatus]   = useState("connecting");

  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const wsRef     = useRef(null);
  const pcRef     = useRef(null);
  // Queue an offer if it arrives before the camera stream is ready
  const pendingOfferRef = useRef(null);

  const s = TALLY_STYLES[tally];

  // ── Start local camera ─────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setHasCamera(true);
      setCamError(null);
      // Use a short timeout so the video element is in the DOM before we assign
      // srcObject — required on iOS Safari
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);

      // If an offer arrived before the camera was ready, handle it now
      if (pendingOfferRef.current) {
        await handleOffer(pendingOfferRef.current);
        pendingOfferRef.current = null;
      }
    } catch {
      setCamError("Camera access denied. Tap 'Try again' and allow camera access.");
    }
  };

  // ── Handle WebRTC offer from director ──────────────────────────────────
  const handleOffer = async (sdp) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Add local camera tracks so director can see us
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, streamRef.current);
      });
    }

    // Send ICE candidates back to director
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          candidate: e.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("PeerConnection state:", pc.connectionState);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    wsRef.current?.send(JSON.stringify({ type: "sdp-answer", sdp: answer }));
  };

  // ── WebSocket connection ───────────────────────────────────────────────
  useEffect(() => {
    startCamera();

    const connect = () => {
      const ws = new WebSocket(SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
        ws.send(JSON.stringify({
          type: "register",
          role: "camera",
          cameraId: camId,
          name: camName,
          label: camLabel,
        }));
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        setTimeout(connect, 3000);
      };

      ws.onerror = () => setWsStatus("disconnected");

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "sdp-offer": {
            if (!streamRef.current) {
              // Camera not ready yet — queue the offer
              pendingOfferRef.current = msg.sdp;
            } else {
              await handleOffer(msg.sdp);
            }
            break;
          }

          case "ice-candidate": {
            if (pcRef.current && msg.candidate) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch {}
            }
            break;
          }

          case "tally": {
            setTally(msg.state);
            break;
          }
        }
      };
    };

    connect();

    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: "100%", height: "100vh",
      background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>

      {/* Full-screen tally border */}
      <div style={{
        position: "absolute", inset: 0,
        border: `5px solid ${s.border}`,
        pointerEvents: "none", zIndex: 10,
        transition: "border-color 0.15s ease",
        boxShadow: s.glow,
      }} />

      {/* Camera feed */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        {hasCamera ? (
          <video
            ref={videoRef}
            autoPlay playsInline muted
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%", background: "#0d1117",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 16,
          }}>
            {camError ? (
              <>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.25 }}>
                  <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.5"/>
                  <path d="M4.5 4.5l15 15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", maxWidth: 260, lineHeight: 1.6, margin: 0 }}>
                  {camError}
                </p>
                <button onClick={startCamera} style={{
                  background: "#1f2937", border: "1px solid #374151", borderRadius: "8px",
                  color: "#d1d5db", fontSize: 13, fontWeight: 600, padding: "10px 24px",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  Try again
                </button>
              </>
            ) : (
              <p style={{ color: "#374151", fontSize: 13, fontWeight: 500 }}>Starting camera…</p>
            )}
          </div>
        )}
      </div>

      {/* Top bar */}
      <div style={{
        position: "relative", zIndex: 11,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 20px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: wsStatus === "connected" ? "#22c55e" : wsStatus === "connecting" ? "#f59e0b" : "#ef4444",
            boxShadow: wsStatus === "connected" ? "0 0 6px rgba(34,197,94,0.7)" : "none",
            transition: "background 0.3s",
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", letterSpacing: "-0.01em" }}>PGM</span>
        </div>

        {s.badge && (
          <div style={{
            background: s.badgeBg, color: s.badgeColor,
            fontSize: 11, fontWeight: 800, letterSpacing: "0.12em",
            padding: "5px 14px", borderRadius: "6px", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {tally === "program" && <PulsingDot color="#fff" active={true} />}
            {s.badge}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        position: "relative", zIndex: 11, marginTop: "auto",
        padding: "0 20px 40px",
        background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
      }}>
        <p style={{
          fontSize: 28, fontWeight: 700, color: "#f9fafb",
          margin: "0 0 4px", letterSpacing: "-0.02em", lineHeight: 1.1,
        }}>
          {camName}
        </p>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0, fontWeight: 400 }}>
          {camLabel}
        </p>
      </div>
    </div>
  );
}
