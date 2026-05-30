import { PGMLogoFull } from "../PGMLogo";
import { useState } from "react";

const BASE_URL = window.location.origin;

const generateId = () => "cam-" + Math.random().toString(36).slice(2, 7);

export default function Home() {
  const [cameras, setCameras] = useState([
    { id: generateId(), name: "Cam 1", label: "Stage Left" },
  ]);
  const [copied, setCopied] = useState(null);

  const addCamera = () => {
    setCameras(prev => [...prev, { id: generateId(), name: `Cam ${prev.length + 1}`, label: "" }]);
  };

  const updateCamera = (index, field, value) => {
    setCameras(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const removeCamera = (index) => {
    setCameras(prev => prev.filter((_, i) => i !== index));
  };

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
    <div style={{
      minHeight: "100vh", background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 32, padding: 24,
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center" }}>
        <PGMLogoFull height={52} />
      </div>

      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Director Console */}
        <a href="/director" style={{ textDecoration: "none" }}>
          <div style={{
            background: "#0f1117", border: "1px solid #1f2937",
            borderRadius: "12px", padding: "20px 24px",
            cursor: "pointer", transition: "border-color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#374151"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.6)" }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>Director Console</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#4b5563" }}>Open on Mac →</span>
            </div>
            <p style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
              Switch cameras, manage tally lights, and stream your production.
            </p>
          </div>
        </a>

        {/* Camera Links */}
        <div style={{
          background: "#0f1117", border: "1px solid #1f2937",
          borderRadius: "12px", padding: "20px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>Camera Links</span>
            <span style={{ fontSize: 12, color: "#4b5563", marginLeft: 4 }}>Share with each operator</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cameras.map((cam, i) => (
              <div key={cam.id} style={{
                background: "#080b0f", border: "1px solid #1f2937",
                borderRadius: "8px", padding: "12px 14px",
              }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    value={cam.name}
                    onChange={e => updateCamera(i, "name", e.target.value)}
                    placeholder="Name (e.g. Cam 1)"
                    style={{
                      flex: 1, background: "#0f1117", border: "1px solid #1f2937",
                      borderRadius: "6px", color: "#f9fafb", fontSize: 12,
                      fontWeight: 600, padding: "7px 10px", fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  <input
                    value={cam.label}
                    onChange={e => updateCamera(i, "label", e.target.value)}
                    placeholder="Label (e.g. Stage Left)"
                    style={{
                      flex: 1, background: "#0f1117", border: "1px solid #1f2937",
                      borderRadius: "6px", color: "#f9fafb", fontSize: 12,
                      padding: "7px 10px", fontFamily: "inherit", outline: "none",
                    }}
                  />
                  {cameras.length > 1 && (
                    <button
                      onClick={() => removeCamera(i)}
                      style={{
                        background: "transparent", border: "1px solid #1f2937",
                        borderRadius: "6px", color: "#4b5563", fontSize: 14,
                        padding: "0 10px", cursor: "pointer", fontFamily: "inherit",
                        lineHeight: 1,
                      }}
                    >×</button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{
                    flex: 1, background: "#0a0d11", border: "1px solid #1a2535",
                    borderRadius: "6px", padding: "7px 10px",
                    fontSize: 10, color: "#374151", fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {getLink(cam)}
                  </div>
                  <button
                    onClick={() => copyLink(cam)}
                    style={{
                      background: copied === cam.id ? "rgba(34,197,94,0.1)" : "#1a2030",
                      border: `1px solid ${copied === cam.id ? "#22c55e" : "#2a3447"}`,
                      borderRadius: "6px", color: copied === cam.id ? "#22c55e" : "#9ca3af",
                      fontSize: 11, fontWeight: 600, padding: "0 14px",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s", whiteSpace: "nowrap",
                    }}
                  >
                    {copied === cam.id ? "Copied!" : "Copy link"}
                  </button>
                  <a
                    href={getLink(cam)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "#1a2030", border: "1px solid #2a3447",
                      borderRadius: "6px", color: "#9ca3af",
                      fontSize: 11, fontWeight: 600, padding: "0 14px",
                      textDecoration: "none", display: "flex", alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addCamera}
            style={{
              width: "100%", marginTop: 10,
              background: "transparent", border: "1px dashed #1f2937",
              borderRadius: "8px", color: "#4b5563",
              fontSize: 12, fontWeight: 600, padding: "10px",
              cursor: "pointer", fontFamily: "inherit",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#6b7280"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; e.currentTarget.style.color = "#4b5563"; }}
          >
            + Add camera
          </button>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "#1f2937", fontWeight: 500 }}>PGM Pro · v0.1</p>
    </div>
  );
}
