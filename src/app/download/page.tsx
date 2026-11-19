import Link from "next/link";

export const metadata = {
  title: "Download SPECTRE",
  description:
    "Get SPECTRE as a desktop app for macOS and Windows — your whole portfolio-intelligence "
    + "workspace in a native window. Or use it in your browser.",
};

const REPO = "jwmcghee09-ai/Daily-";
const REL = `https://github.com/${REPO}/releases`;
const DL = (asset: string) => `${REL}/latest/download/${asset}`;

const CSS = `
.dl-page{--bg:#0e0e11;--card:#17171b;--border:#2a2a31;--text:#f1f1f3;--muted:#9a9aa5;--primary:#e0231c;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--font-geist-sans),"DM Sans",sans-serif;
  display:flex;flex-direction:column;align-items:center;padding:64px 20px 80px;position:relative;overflow-x:clip}
.dl-page::before{content:"";position:absolute;inset:0 0 auto;height:620px;pointer-events:none;
  background:radial-gradient(ellipse 60% 70% at 50% 0%,rgba(224,35,28,.20),transparent 70%)}
.dl-inner{position:relative;width:100%;max-width:720px;text-align:center}
.dl-icon{width:96px;height:96px;border-radius:22px;display:block;margin:0 auto 26px;box-shadow:0 24px 60px -20px rgba(224,35,28,.5)}
.dl-kicker{font-family:var(--font-geist-mono),monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.dl-title{font-family:var(--font-space-grotesk),"Space Grotesk",sans-serif;font-size:clamp(34px,6vw,54px);font-weight:600;line-height:1.08;margin:14px 0 16px;letter-spacing:-.01em}
.dl-title span{color:var(--primary)}
.dl-sub{font-size:16px;line-height:1.7;color:var(--muted);max-width:520px;margin:0 auto 36px}
.dl-buttons{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:14px}
.dl-btn{display:inline-flex;align-items:center;gap:10px;padding:0 22px;height:54px;border-radius:10px;font-size:15px;font-weight:600;
  text-decoration:none;border:1px solid transparent;background:var(--primary);color:#fff;transition:opacity .15s,transform .15s}
.dl-btn:hover{opacity:.92;transform:translateY(-1px)}
.dl-btn.outline{background:transparent;border-color:var(--border);color:var(--text)}
.dl-btn small{display:block;font-size:11px;font-weight:400;opacity:.75;letter-spacing:.02em}
.dl-btn svg{width:20px;height:20px;flex:none}
.dl-btn.primary-os{box-shadow:0 10px 30px -10px rgba(224,35,28,.6)}
.dl-alt{font-family:var(--font-geist-mono),monospace;font-size:12px;color:var(--muted);margin-top:8px}
.dl-alt a{color:var(--muted);text-decoration:underline;text-underline-offset:3px}
.dl-alt a:hover{color:var(--primary)}
.dl-note{margin-top:40px;padding-top:26px;border-top:1px solid var(--border);display:grid;gap:12px;text-align:left}
.dl-note-row{display:flex;gap:12px;font-size:13.5px;line-height:1.6;color:var(--muted)}
.dl-note-row b{color:var(--text);font-weight:600}
.dl-note-row svg{width:17px;height:17px;flex:none;color:var(--primary);margin-top:2px}
.dl-back{margin-top:40px;font-family:var(--font-geist-mono),monospace;font-size:12px;color:var(--muted);text-decoration:none}
.dl-back:hover{color:var(--primary)}
@media (max-width:520px){.dl-btn{width:100%;justify-content:center}}
`;

function MacIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 1.43c.09 1.02-.32 2.02-.98 2.74-.7.77-1.84 1.36-2.92 1.27-.11-.99.37-2.02 1-2.68.7-.74 1.92-1.3 2.9-1.33ZM19.9 17.1c-.52 1.2-.77 1.74-1.44 2.8-.94 1.48-2.26 3.32-3.9 3.33-1.46.02-1.83-.95-3.81-.94-1.98.01-2.4.96-3.85.94-1.64-.02-2.9-1.68-3.84-3.16C.44 15.8-.03 10.9 1.6 8.3 2.75 6.45 4.57 5.36 6.28 5.36c1.74 0 2.84.96 4.28.96 1.4 0 2.25-.96 4.27-.96 1.52 0 3.14.83 4.29 2.27-3.77 2.07-3.16 7.45.78 9.47Z"/></svg>
  );
}
function WinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.1 10.4 4v7.4H3V5.1Zm0 13.8L10.4 20v-7.3H3v6.2Zm8.3 1.2L21 21.3V12.7h-9.7v7.4Zm0-16.3v7.5H21V2.6l-9.7 1.2Z"/></svg>
  );
}
function Dot() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}

export default function DownloadPage() {
  return (
    <main className="dl-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dl-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/spectre-app-icon.png" alt="SPECTRE app icon" className="dl-icon" width={96} height={96} />
        <div className="dl-kicker">The desktop app</div>
        <h1 className="dl-title">Download <span>SPECTRE</span>.</h1>
        <p className="dl-sub">
          Your whole portfolio-intelligence workspace in a native window — the same SPECTRE you use in
          the browser, always a click away in your dock or taskbar.
        </p>

        <div className="dl-buttons">
          <a className="dl-btn primary-os" id="dl-mac-arm" href={DL("SPECTRE-mac-arm64.dmg")}>
            <MacIcon /><span>Download for Mac<small>Apple Silicon · .dmg</small></span>
          </a>
          <a className="dl-btn outline" id="dl-win" href={DL("SPECTRE-win-x64.exe")}>
            <WinIcon /><span>Download for Windows<small>Windows 10/11 · .exe</small></span>
          </a>
        </div>
        <p className="dl-alt">
          Mac on Intel? <a href={DL("SPECTRE-mac-x64.dmg")}>Download the Intel build</a> · <a href={REL}>All versions &amp; releases</a>
        </p>

        <div className="dl-note">
          <div className="dl-note-row"><Dot /><span><b>It&rsquo;s the same account.</b> Sign in once and your holdings, risk, research and AI analyst are all there — nothing re-imports.</span></div>
          <div className="dl-note-row"><Dot /><span><b>Connect your AI from the app too.</b> The desktop app runs the full dashboard, including the connect-your-AI panel on the AI tab.</span></div>
          <div className="dl-note-row"><Dot /><span><b>Unsigned for now.</b> macOS and Windows show a one-time &ldquo;unidentified developer&rdquo; prompt — open it anyway (right-click → Open on Mac). Signed builds are on the roadmap.</span></div>
        </div>

        <Link className="dl-back" href="/dashboard">
          Prefer the browser? Open SPECTRE in your browser &rsaquo;
        </Link>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var p=(navigator.userAgent||'')+' '+(navigator.platform||'');var mac=/Mac/i.test(p),win=/Win/i.test(p);var m=document.getElementById('dl-mac-arm'),w=document.getElementById('dl-win');if(win&&w&&m){w.classList.add('primary-os');w.classList.remove('outline');m.classList.add('outline');m.classList.remove('primary-os');}else if(mac&&m){m.classList.add('primary-os');}}catch(e){}})();`,
        }}
      />
    </main>
  );
}
