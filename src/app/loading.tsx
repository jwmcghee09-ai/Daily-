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
        gap: "28px",
        background:
          "radial-gradient(circle at 84% 12%, rgba(255,75,51,0.14) 0%, transparent 32%)," +
          "radial-gradient(circle at 18% 88%, rgba(255,75,51,0.09) 0%, transparent 30%)," +
          "linear-gradient(145deg,#050506 0%,#0b0b0f 52%,#060607 100%)",
        zIndex: 9999,
      }}
    >
      {/* Spectre logo mark */}
      <svg width="52" height="52" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lg" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FF624B" />
            <stop offset="1" stopColor="#CF2E17" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="48" height="48" rx="14" fill="url(#lg)" />
        <path d="M17 18.5H38.5L31.8 25.2H23.6V31.6H35.5L28.8 38.3H17V18.5Z" fill="#FFF6F4" />
        <path d="M17 35.8L23.2 29.7H32.8L26.6 35.8H17Z" fill="#FFD8D1" />
      </svg>

      {/* Spinner ring */}
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: "spectre-spin 0.9s linear infinite" }}
      >
        <circle cx="18" cy="18" r="15" stroke="rgba(255,75,51,0.18)" strokeWidth="3" />
        <path
          d="M18 3 A15 15 0 0 1 33 18"
          stroke="#ff4b33"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      <style>{`
        @keyframes spectre-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
