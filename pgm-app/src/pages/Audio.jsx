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
const VUMeter = ({ analyserRef, active }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;

      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#0a0d11";
      ctx.fillRect(0, 0, w, h);

      if (!analyser || !active) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / bufferLength) / 255;
      const level = Math.min(1, rms * 3);

      const segments = 20;
      const segH = (h - segments) / segments;
      const filledSegments = Math.round(level * segments);

      for (let i = 0; i < segments; i++) {
        const y = h - (i + 1) * (segH + 1);
        if (i < filledSegments) {
          ctx.fillStyle = i >= segments * 0.85 ? "#ef4444" : i >= segments * 0.7 ? "#f59e0b" : "#22c55e";
        } else {
          ctx.fillStyle = "#1a2535";
        }
        ctx.fillRect(1, y, w - 2, segH);
      }
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyserRef, active]);

  return (
    <canvas ref={canvasRef} width={16} height={120}
      style={{ display: "block", borderRadius: "3px", flexShrink: 0 }} />
  );
};

// ── Channel Strip ─────────────────────────────────────────────────────────────
const ChannelStrip = ({ cam, volume, muted, solo, isProgram, onVolume, onMute, onSolo, analyserRef }) => {
  const accent = isProgram ? "#ef4444" : "#374151";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 10, padding: "16px 12px",
      background: "#0f1117",
      border: `1px solid ${isProgram ? "rgba(239,68,68,0.3)" : "#1f2937"}`,
      borderRadius: "10px", minWidth: 80, maxWidth: 100,
      boxShadow: isProgram ? "0 0 16px rgba(239,68,68,0.08)" : "none",
      transition: "border-color 0.15s, opacity 0.15s",
      opacity: muted ? 0.5 : 1,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: isProgram ? "#ef4444" : "#1f2937",
        boxShadow: isProgram ? "0 0 6px rgba(239,68,68,0.8)" : "none",
        transition: "all 0.15s",
      }} />

      <VUMeter analyserRef={analyserRef} active={!muted} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
        <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 500 }}>{Math.round(volume * 100)}</span>
        <input type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolume(parseFloat(e.target.value))}
          style={{ writingMode: "vertical-lr", direction: "rtl", height: 100, width: 20, cursor: "pointer", accentColor: isProgram ? "#ef4444" : "#22c55e" }} />
      </div>

      <button onClick={onSolo} style={{
        width: "100%", padding: "4px 0",
        background: solo ? "rgba(245,158,11,0.2)" : "transparent",
        border: `1px solid ${solo ? "#f59e0b" : "#1f2937"}`,
        borderRadius: "4px", color: solo ? "#f59e0b" : "#4b5563",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
      }}>S</button>

      <button onClick={onMute} style={{
        width: "100%", padding: "4px 0",
        background: muted ? "rgba(239,68,68,0.2)" : "transparent",
        border: `1px solid ${muted ? "#ef4444" : "#1f2937"}`,
        borderRadius: "4px", color: muted ? "#ef4444" : "#4b5563",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
      }}>M</button>

      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: isProgram ? "#ef4444" : "#9ca3af", margin: 0 }}>{cam.name}</p>
        {cam.label && <p style={{ fontSize: 9, color: "#374151", margin: "2px 0 0", lineHeight: 1.2 }}>{cam.label}</p>}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AudioConsole() {
  const roomId = getParam("room", null);

  const [slots, setSlots]         = useState(() => getDirectorSlots() || []);
  const [liveStatus, setLiveStatus] = useState(new Map());
  const [tally, setTally]         = useState({});
  const [wsStatus, setWsStatus]   = useState("connecting");
  const [audioEnabled, setAudioEnabled] = useState(false);

  // UI state — only for rendering
  const [volumes, setVolumes]         = useState({});     // cameraId -> 0–1
  const [mutes, setMutes]             = useState({});     // cameraId -> bool
  const [solos, setSolos]             = useState({});     // cameraId -> bool
  const [masterVolume, setMasterVolume] = useState(1);
  const [masterMuted, setMasterMuted]   = useState(false);

  // Refs — always current values, safe to use inside stable callbacks
  const volumesRef      = useRef({});
  const mutesRef        = useRef({});
  const solosRef        = useRef({});
  const masterVolumeRef = useRef(1);
  const masterMutedRef  = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);
  useEffect(() => { mutesRef.current = mutes; }, [mutes]);
  useEffect(() => { solosRef.current = solos; }, [solos]);
  useEffect(() => { masterVolumeRef.current = masterVolume; }, [masterVolume]);
  useEffect(() => { masterMutedRef.current = masterMuted; }, [masterMuted]);

  // Audio graph refs — never change, no dependency issues
  const wsRef            = useRef(null);
  const peerConnections  = useRef(new Map()); // cameraId -> RTCPeerConnection
  const pendingStreams    = useRef(new Map()); // cameraId -> MediaStream (arrived before audio enabled)
  const audioCtxRef      = useRef(null);
  const masterGainRef    = useRef(null);
  const gainNodesRef     = useRef(new Map());    // cameraId -> GainNode
  const analyserRefs     = useRef(new Map());    // cameraId -> { current: AnalyserNode }
  const audioSourcesRef  = useRef(new Map());    // cameraId -> source node

  useEffect(() => { document.title = "Audio | PGM Pro"; }, []);

  const cameras = slots.map(slot => ({
    ...slot,
    ...(liveStatus.get(slot.id) || { connected: false, hasStream: false }),
  }));

  // ── Recalculate all gain values (called after any mix change) ────────────
  const recalcGains = useCallback(() => {
    const anySolo = Object.values(solosRef.current).some(Boolean);
    gainNodesRef.current.forEach((gain, id) => {
      if (mutesRef.current[id]) { gain.gain.value = 0; return; }
      const vol = volumesRef.current[id] ?? 0.8;
      gain.gain.value = anySolo ? (solosRef.current[id] ? vol : 0) : vol;
    });
  }, []); // no deps — reads from refs only

  // ── Master gain ───────────────────────────────────────────────────────────
  const recalcMaster = useCallback(() => {
    if (!masterGainRef.current) return;
    masterGainRef.current.gain.value = masterMutedRef.current ? 0 : masterVolumeRef.current;
  }, []);

  // ── Wire a stream into the audio graph ───────────────────────────────────
  // Stable — no state dependencies, reads from refs
  const wireAudio = useCallback((cameraId, stream) => {
    const ctx    = audioCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    if (audioSourcesRef.current.has(cameraId)) return;

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    const source   = ctx.createMediaStreamSource(stream);
    const gain     = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Set initial gain from current ref values
    const vol = volumesRef.current[cameraId] ?? 0.8;
    gain.gain.value = mutesRef.current[cameraId] ? 0 : vol;

    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(master);

    gainNodesRef.current.set(cameraId, gain);
    audioSourcesRef.current.set(cameraId, source);

    // Create a stable ref object for the analyser (for VUMeter)
    if (!analyserRefs.current.has(cameraId)) {
      analyserRefs.current.set(cameraId, { current: analyser });
    } else {
      analyserRefs.current.get(cameraId).current = analyser;
    }
  }, []); // stable — no state deps

  // ── Enable AudioContext (requires user gesture) ───────────────────────────
  const enableAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx    = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = masterVolumeRef.current;
    master.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    setAudioEnabled(true);

    // Wire any streams that arrived before audio was enabled
    pendingStreams.current.forEach((stream, cameraId) => wireAudio(cameraId, stream));
    pendingStreams.current.clear();
  }, [wireAudio]);

  // ── Volume change ─────────────────────────────────────────────────────────
  const handleVolume = useCallback((cameraId, value) => {
    setVolumes(prev => ({ ...prev, [cameraId]: value }));
    volumesRef.current = { ...volumesRef.current, [cameraId]: value };
    recalcGains();
    wsRef.current?.send(JSON.stringify({
      type: "audio-level", cameraId, volume: value, muted: mutesRef.current[cameraId] || false,
    }));
  }, [recalcGains]);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  const handleMute = useCallback((cameraId) => {
    const next = !mutesRef.current[cameraId];
    setMutes(prev => ({ ...prev, [cameraId]: next }));
    mutesRef.current = { ...mutesRef.current, [cameraId]: next };
    recalcGains();
    wsRef.current?.send(JSON.stringify({
      type: "audio-level", cameraId, volume: volumesRef.current[cameraId] ?? 0.8, muted: next,
    }));
  }, [recalcGains]);

  // ── Solo toggle ───────────────────────────────────────────────────────────
  const handleSolo = useCallback((cameraId) => {
    const next = !solosRef.current[cameraId];
    setSolos(prev => ({ ...prev, [cameraId]: next }));
    solosRef.current = { ...solosRef.current, [cameraId]: next };
    recalcGains();
  }, [recalcGains]);

  // ── Master volume ─────────────────────────────────────────────────────────
  const handleMasterVolume = useCallback((value) => {
    setMasterVolume(value);
    masterVolumeRef.current = value;
    recalcMaster();
  }, [recalcMaster]);

  const handleMasterMute = useCallback(() => {
    const next = !masterMutedRef.current;
    setMasterMuted(next);
    masterMutedRef.current = next;
    recalcMaster();
  }, [recalcMaster]);

  // ── WebRTC — stable, no state deps ───────────────────────────────────────
  const initiatePeerConnection = useCallback(async (cameraId) => {
    peerConnections.current.get(cameraId)?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current.set(cameraId, pc);

    // Audio only — no video needed for audio console
    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (event) => {
      if (event.track.kind !== "audio") return;
      const stream = event.streams[0] || new MediaStream([event.track]);
      setLiveStatus(prev => {
        const next = new Map(prev);
        next.set(cameraId, { ...(next.get(cameraId) || {}), hasStream: true });
        return next;
      });
      if (audioCtxRef.current) {
        wireAudio(cameraId, stream);
      } else {
        // Queue until user enables audio
        pendingStreams.current.set(cameraId, stream);
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
  }, [wireAudio]); // wireAudio is also stable

  // ── WebSocket — depends only on roomId and initiatePeerConnection ─────────
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
            // Sync from server (could be from another audio console instance)
            setVolumes(prev => ({ ...prev, [msg.cameraId]: msg.volume }));
            volumesRef.current = { ...volumesRef.current, [msg.cameraId]: msg.volume };
            setMutes(prev => ({ ...prev, [msg.cameraId]: msg.muted }));
            mutesRef.current = { ...mutesRef.current, [msg.cameraId]: msg.muted };
            recalcGains();
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
  }, [roomId, initiatePeerConnection, recalcGains]);

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
        height: 52, flexShrink: 0, background: "#0f1117", borderBottom: "1px solid #1f2937",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
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
            <button onClick={enableAudio} style={{
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: "6px", color: "#22c55e", fontSize: 11, fontWeight: 600,
              padding: "6px 14px", cursor: "pointer", fontFamily: "inherit",
            }}>
              Enable Audio
            </button>
          )}
        </div>
      </header>

      {/* Body */}
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
                  analyserRef={analyserRefs.current.get(cam.id) || { current: null }}
                />
              ))}

              {/* Master bus */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, padding: "16px 12px", background: "#0f1117",
                border: "1px solid #2a3447", borderRadius: "10px",
                minWidth: 80, maxWidth: 100, marginLeft: "auto",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>Master</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 500 }}>{Math.round(masterVolume * 100)}</span>
                  <input type="range" min={0} max={1} step={0.01} value={masterVolume}
                    onChange={e => handleMasterVolume(parseFloat(e.target.value))}
                    style={{ writingMode: "vertical-lr", direction: "rtl", height: 100, width: 20, cursor: "pointer", accentColor: "#9ca3af" }} />
                </div>
                <button onClick={handleMasterMute} style={{
                  width: "100%", padding: "4px 0",
                  background: masterMuted ? "rgba(239,68,68,0.2)" : "transparent",
                  border: `1px solid ${masterMuted ? "#ef4444" : "#1f2937"}`,
                  borderRadius: "4px", color: masterMuted ? "#ef4444" : "#4b5563",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}>M</button>
                <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 600, letterSpacing: "0.05em" }}>MSTR</span>
              </div>
            </section>

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
