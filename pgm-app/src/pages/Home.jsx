export default function Home() {
  return (
    <div style={{
      minHeight: "100vh", background: "#09090b",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 32, padding: 24,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 14, height: 14, borderRadius: "50%",
          background: "#ef4444", boxShadow: "0 0 12px rgba(239,68,68,0.7)",
        }} />
        <span style={{ fontSize: 28, fontWeight: 800, color: "#f9fafb", letterSpacing: "-0.03em" }}>
          PGM
        </span>
      </div>

      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#6b7280", fontWeight: 500, margin: 0 }}>
          Production Grand Master
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
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
            </div>
            <p style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
              Open on your Mac to switch cameras and manage your production.
            </p>
          </div>
        </a>

        <a href="/camera?id=cam1&name=Cam+1&label=My+Camera" style={{ textDecoration: "none" }}>
          <div style={{
            background: "#0f1117", border: "1px solid #1f2937",
            borderRadius: "12px", padding: "20px 24px",
            cursor: "pointer", transition: "border-color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#374151"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>Camera Page</span>
            </div>
            <p style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
              Open on an iPhone. Share a unique link with each camera operator.
            </p>
          </div>
        </a>
      </div>

      <p style={{ fontSize: 11, color: "#1f2937", fontWeight: 500 }}>PGM Pro · v0.1</p>
    </div>
  );
}
