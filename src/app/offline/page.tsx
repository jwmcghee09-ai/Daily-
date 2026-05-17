export default function OfflinePage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SPECTRE — Offline</title>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:#05050a;color:#f8f8fb;font-family:'DM Sans',system-ui,sans-serif;
            display:flex;align-items:center;justify-content:center;min-height:100dvh;text-align:center;padding:2rem}
          .mark{width:64px;height:64px;margin:0 auto 1.5rem}
          h1{font-size:1.5rem;font-weight:700;margin-bottom:.5rem}
          p{color:#8a86a8;font-size:.95rem;line-height:1.6;max-width:320px;margin:0 auto 1.5rem}
          a{display:inline-block;padding:.6rem 1.4rem;background:#ff4e2a;color:#fff;
            border-radius:8px;font-weight:600;font-size:.9rem;text-decoration:none}
        `}</style>
      </head>
      <body>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="SPECTRE" className="mark" />
          <h1>You&apos;re offline</h1>
          <p>SPECTRE needs a connection to fetch live prices and run analysis. Reconnect and try again.</p>
          <a href="/dashboard">Retry</a>
        </div>
      </body>
    </html>
  );
}
