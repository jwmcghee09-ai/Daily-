export default function Loading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "20px",
        background:
          "radial-gradient(circle at 80% 10%, rgba(255,75,51,0.13) 0%, transparent 34%)," +
          "radial-gradient(circle at 16% 88%, rgba(255,75,51,0.08) 0%, transparent 30%)," +
          "linear-gradient(145deg,#050506 0%,#0b0b0f 52%,#060607 100%)",
        zIndex: 9999,
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', 'Courier New', monospace",
          fontSize: "1.05rem",
          fontWeight: 500,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          background: "linear-gradient(90deg, #ff6240, #ff4b33, #ff8c70, #ff4b33, #ff6240)",
          backgroundSize: "300% 100%",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: "spectre-shimmer 2.4s ease-in-out infinite",
        }}
      >
        Spectre
      </span>

      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        style={{ animation: "spectre-spin 1s linear infinite" }}
      >
        <circle cx="16" cy="16" r="13" stroke="rgba(255,75,51,0.15)" strokeWidth="2.5" />
        <path
          d="M16 3 A13 13 0 0 1 29 16"
          stroke="#ff4b33"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      <style>{`
        @keyframes spectre-shimmer {
          0%   { background-position: 100% 50%; }
          50%  { background-position: 0%   50%; }
          100% { background-position: 100% 50%; }
        }
        @keyframes spectre-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
