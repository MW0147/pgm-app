import { useState, useEffect, useRef, useCallback } from "react";
import { PGMWordmark } from "../PGMLogo";

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

const getDirectorSlots = () => {
  try {
    const state = JSON.parse(localStorage.getItem("pgm_show_state"));
    return state?.cameraSlots?.length ? state.cameraSlots : null;
  } catch { return null; }
};

// ── VU Meter ─────────────────────────────────────────────────────────────────
const VUMeter = ({ analyser, active }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!analyser || !active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // RMS level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / bufferLength) / 255;

      const w = canvas.width;
      const h = canvas.height;
      const level = Math.min(1, rms * 3); // scale up for visibility

      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = "#0a0d11";
      ctx.fillRect(0, 0, w, h);

      // Segments from bottom up
      const segments = 20;
      const segH = (h - segments) / segments;
      const filledSegments = Math.round(level * segments);

      for (let i = 0; i < segments; i++) {
        const y = h - (i + 1) * (segH + 1);
        const filled = i < filledSegments;
        if (!filled) {
          ctx.fillStyle = "#1a2535";
        } else if (i >= segments * 0.85) {
          ctx.fillStyle = "#ef4444"; // red top
        } else if (i >= segments * 0.7) {
          ctx.fillStyle = "#f59e0b"; // amber
        } else {
          ctx.fillStyle = "#22c55e"; // green
        }
        ctx.fillRect(1, y, w - 2, segH);
      }
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      width={16}
      height={120}
      style={{ display: "block", borderRadius: "3px", flexShrink: 0 }}
    />
  );
};

// ── Channel Strip ─────────────────────────────────────────────────────────────
const ChannelStrip = ({ cam, volume, muted, solo, isProgram, onVolume, onMute, onSolo, analyser }) => {
  const accent = isProgram ? "#ef4444" : "#374151";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 10, padding: "16px 12px",
      background: "#0f1117",
      border: `1px solid ${isProgram ? "rgba(239,68,68,0.3)" : "#1f2937"}`,
      borderRadius: "10px",
      minWidth: 80, maxWidth: 100,
      boxShadow: isProgram ? "0 0 16px rgba(239,68,68,0.08)" : "none",
      transition: "border-color 0.15s",
      opacity: muted ? 0.5 : 1,
    }}>

      {/* PGM indicator */}
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: isProgram ? "#ef4444" : "#1f2937",
        boxShadow: isProgram ? "0 0 6px rgba(239,68,68,0.8)" : "none",
        transition: "all 0.15s",
      }} />

      {/* VU meter */}
      <VUMeter analyser={analyser} active={!muted} />

      {/* Fader */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
        <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 500 }}>
          {Math.round(volume * 100)}
        </span>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={volume}
          onChange={e => onVolume(parseFloat(e.target.value))}
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",
            height: 100,
            width: 20,
            cursor: "pointer",
            accentColor: isProgram ? "#ef4444" : "#22c55e",
          }}
        />
      </div>

      {/* Solo */}
      <button
        onClick={onSolo}
        style={{
          width: "100%", padding: "4px 0",
          background: solo ? "rgba(245,158,11,0.2)" : "transparent",
          border: `1px solid ${solo ? "#f59e0b" : "#1f2937"}`,
          borderRadius: "4px", color: solo ? "#f59e0b" : "#4b5563",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        S
      </button>

      {/* Mute */}
      <button
        onClick={onMute}
        style={{
          width: "100%", padding: "4px 0",
          background: muted ? "rgba(239,68,68,0.2)" : "transparent",
          border: `1px solid ${muted ? "#ef4444" : "#1f2937"}`,
          borderRadius: "4px", color: muted ? "#ef4444" : "#4b5563",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          cursor: "pointer", fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        M
      </button>

      {/* Channel name */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: isProgram ? "#ef4444" : "#9ca3af", margin: 0 }}>
          {cam.name}
        </p>
        {cam.label && (
          <p style={{ fontSize: 9, color: "#374151", margin: "2px 0 0", lineHeight: 1.2 }}>
            {cam.label}
          </p>
        )}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AudioConsole() {
  const roomId = getParam("room", null);

  const [slots, setSlots]           = useState(() => getDirectorSlots() || []);
  const [liveStatus, setLiveStatus] = useState(new Map());
  const [tally, setTally]           = useState({});
  const [wsStatus, setWsStatus]     = useState("connecting");

  // Per-channel state: volume (0–1), muted, solo
  const [volumes, setVolumes]       = useState({});
  const [mutes, setMutes]           = useState({});
  const [solos, setSolos]           = useState({});
  const [masterVolume, setMasterVolume] = useState(1);
  const [masterMuted, setMasterMuted]   = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const wsRef             = useRef(null);
  const peerConnections   = useRef(new Map());
  const audioCtxRef       = useRef(null);
  const masterGainRef     = useRef(null);
  const gainNodesRef      = useRef(new Map()); // cameraId -> GainNode
  const analyserNodesRef  = useRef(new Map()); // cameraId -> AnalyserNode
  const audioSourcesRef   = useRef(new Map()); // cameraId -> MediaStreamAudioSourceNode

  useEffect(() => { document.title = "Audio | PGM Pro"; }, []);

  const cameras = slots.map(slot => ({
    ...slot,
    ...(liveStatus.get(slot.id) || { connected: false, hasStream: false }),
  }));

  // ── Init AudioContext ──────────────────────────────────────────────────────
  const enableAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const master = ctx.createGain();
    master.gain.value = masterVolume;
    master.connect(ctx.destination);
    masterGainRef.current = master;
    setAudioEnabled(true);
  }, [masterVolume]);

  // ── Wire an incoming stream into the audio graph ───────────────────────────
  const wireAudio = useCallback((cameraId, stream) => {
    const ctx = audioCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    if (audioSourcesRef.current.has(cameraId)) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    const source   = ctx.createMediaStreamSource(stream);
    const gain     = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Initial volume from state
    gain.gain.value = volumes[cameraId] ?? 0.8;

    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(master);

    gainNodesRef.current.set(cameraId, gain);
    analyserNodesRef.current.set(cameraId, analyser);
    audioSourcesRef.current.set(cameraId, source);
  }, [volumes]);

  // ── Volume change ──────────────────────────────────────────────────────────
  const handleVolume = useCallback((cameraId, value) => {
    setVolumes(prev => ({ ...prev, [cameraId]: value }));
    const gain = gainNodesRef.current.get(cameraId);
    if (gain) gain.gain.value = mutes[cameraId] ? 0 : value;
    // Sync to server so director console stays in sync
    wsRef.current?.send(JSON.stringify({
      type: "audio-level", cameraId, volume: value, muted: mutes[cameraId] || false,
    }));
  }, [mutes]);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  const handleMute = useCallback((cameraId) => {
    setMutes(prev => {
      const next = { ...prev, [cameraId]: !prev[cameraId] };
      const gain = gainNodesRef.current.get(cameraId);
      if (gain) gain.gain.value = next[cameraId] ? 0 : (volumes[cameraId] ?? 0.8);
      wsRef.current?.send(JSON.stringify({
        type: "audio-level", cameraId, volume: volumes[cameraId] ?? 0.8, muted: next[cameraId],
      }));
      return next;
    });
  }, [volumes]);

  // ── Solo toggle ───────────────────────────────────────────────────────────
  const handleSolo = useCallback((cameraId) => {
    setSolos(prev => {
      const next = { ...prev, [cameraId]: !prev[cameraId] };
      // When soloing: silence all others, restore when no solos active
      const anySolo = Object.values(next).some(Boolean);
      gainNodesRef.current.forEach((gain, id) => {
        if (mutes[id]) { gain.gain.value = 0; return; }
        gain.gain.value = anySolo ? (next[id] ? (volumes[id] ?? 0.8) : 0) : (volumes[id] ?? 0.8);
      });
      return next;
    });
  }, [volumes, mutes]);

  // ── Master volume ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!masterGainRef.current) return;
    masterGainRef.current.gain.value = masterMuted ? 0 : masterVolume;
  }, [masterVolume, masterMuted]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const initiatePeerConnection = useCallback(async (cameraId) => {
    peerConnections.current.get(cameraId)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    pc.addTransceiver("audio", { direction: "recvonly" });
    // No video transceiver — audio console doesn't need video

    pc.ontrack = (event) => {
      if (event.track.kind !== "audio") return;
      const stream = event.streams[0] || new MediaStream([event.track]);
      setLiveStatus(prev => {
        const next = new Map(prev);
        next.set(cameraId, { ...(next.get(cameraId) || {}), hasStream: true });
        return next;
      });
      if (audioCtxRef.current) wireAudio(cameraId, stream);
      else {
        // Queue for when audio is enabled
        const check = setInterval(() => {
          if (audioCtxRef.current) { wireAudio(cameraId, stream); clearInterval(check); }
        }, 200);
      }
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
  }, [wireAudio]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
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
            if (msg.slots?.length) setSlots(msg.slots);
            break;
          case "camera-connected":
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
              next.set(msg.cameraId, { connected: false, hasStream: false });
              return next;
            });
            peerConnections.current.get(msg.cameraId)?.close();
            peerConnections.current.delete(msg.cameraId);
            break;
          case "camera-renamed":
            setSlots(prev => prev.map(s => s.id === msg.cameraId ? { ...s, name: msg.name, label: msg.label } : s));
            break;
          case "tally":
            setTally(prev => ({ ...prev, [msg.cameraId]: msg.state }));
            break;
          case "audio-level":
            // Sync from director if A1 isn't the one who sent it
            setVolumes(prev => ({ ...prev, [msg.cameraId]: msg.volume }));
            setMutes(prev => ({ ...prev, [msg.cameraId]: msg.muted }));
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
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, [roomId, initiatePeerConnection]);

  const connectedCount = cameras.filter(c => c.connected).length;

  if (!roomId) {
    return (
      <div style={{ height: "100vh", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#4b5563", fontSize: 13 }}>Open from the Director Console.</p>
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh", overflow: "hidden", background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: "#e5e7eb", display: "flex", flexDirection: "column",
    }}>

      {/* Header */}
      <header style={{
        height: 52, flexShrink: 0,
        background: "#0f1117", borderBottom: "1px solid #1f2937",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PGMWordmark height={20} />
          <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, background: "#1f2937", padding: "2px 8px", borderRadius: "4px", marginLeft: 4 }}>
            Audio
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: wsStatus === "connected" ? "#22c55e" : "#f59e0b",
              boxShadow: wsStatus === "connected" ? "0 0 5px rgba(34,197,94,0.6)" : "none",
            }} />
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>
              {connectedCount} of {cameras.length} online
            </span>
          </div>

          {!audioEnabled && (
            <button
              onClick={enableAudio}
              style={{
                background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: "6px", color: "#22c55e",
                fontSize: 11, fontWeight: 600, padding: "6px 14px",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Enable Audio
            </button>
          )}
        </div>
      </header>

      {/* Channel strips */}
      <main style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20,
      }}>

        {cameras.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
              {wsStatus === "connected" ? "Waiting for cameras…" : "Connecting to show…"}
            </p>
          </div>
        ) : (
          <>
            {/* Channel strips */}
            <section style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              {cameras.map(cam => (
                <ChannelStrip
                  key={cam.id}
                  cam={cam}
                  volume={volumes[cam.id] ?? 0.8}
                  muted={mutes[cam.id] || false}
                  solo={solos[cam.id] || false}
                  isProgram={tally[cam.id] === "program"}
                  onVolume={v => handleVolume(cam.id, v)}
                  onMute={() => handleMute(cam.id)}
                  onSolo={() => handleSolo(cam.id)}
                  analyser={analyserNodesRef.current.get(cam.id)}
                />
              ))}

              {/* Master bus */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, padding: "16px 12px",
                background: "#0f1117", border: "1px solid #2a3447",
                borderRadius: "10px", minWidth: 80, maxWidth: 100,
                marginLeft: "auto",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>Master</span>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 500 }}>
                    {Math.round(masterVolume * 100)}
                  </span>
                  <input
                    type="range"
                    min={0} max={1} step={0.01}
                    value={masterVolume}
                    onChange={e => setMasterVolume(parseFloat(e.target.value))}
                    style={{
                      writingMode: "vertical-lr", direction: "rtl",
                      height: 100, width: 20, cursor: "pointer",
                      accentColor: "#9ca3af",
                    }}
                  />
                </div>

                <button
                  onClick={() => setMasterMuted(m => !m)}
                  style={{
                    width: "100%", padding: "4px 0",
                    background: masterMuted ? "rgba(239,68,68,0.2)" : "transparent",
                    border: `1px solid ${masterMuted ? "#ef4444" : "#1f2937"}`,
                    borderRadius: "4px", color: masterMuted ? "#ef4444" : "#4b5563",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  M
                </button>

                <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 600, letterSpacing: "0.05em" }}>MSTR</span>
              </div>
            </section>

            {/* Level legend */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, paddingLeft: 4 }}>
              {[["#22c55e", "Signal"], ["#f59e0b", "Hot"], ["#ef4444", "Clip"]].map(([color, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "2px", background: color }} />
                  <span style={{ fontSize: 10, color: "#374151", fontWeight: 500 }}>{label}</span>
                </div>
              ))}
              <span style={{ fontSize: 10, color: "#1f2937", marginLeft: "auto" }}>PGM Pro · Audio Console</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
