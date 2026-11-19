import Link from "next/link";
import InstallButton from "./install-button";

export const metadata = {
  title: "Get the SPECTRE app",
  description:
    "Install SPECTRE as an app — your whole portfolio-intelligence workspace in its own window, "
    + "on your dock, taskbar or home screen. Or use it in your browser.",
};

const CSS = `
.dl-page{--bg:#0e0e11;--card:#17171b;--border:#2a2a31;--text:#f1f1f3;--muted:#9a9aa5;--primary:#e0231c;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--font-geist-sans),"DM Sans",sans-serif;
  display:flex;flex-direction:column;align-items:center;padding:64px 20px 80px;position:relative;overflow-x:clip}
.dl-page::before{content:"";position:absolute;inset:0 0 auto;height:620px;pointer-events:none;
  background:radial-gradient(ellipse 60% 70% at 50% 0%,rgba(224,35,28,.20),transparent 70%)}
.dl-inner{position:relative;width:100%;max-width:680px;text-align:center}
.dl-icon{width:96px;height:96px;border-radius:22px;display:block;margin:0 auto 26px;box-shadow:0 24px 60px -20px rgba(224,35,28,.5)}
.dl-kicker{font-family:var(--font-geist-mono),monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.dl-title{font-family:var(--font-space-grotesk),"Space Grotesk",sans-serif;font-size:clamp(34px,6vw,54px);font-weight:600;line-height:1.08;margin:14px 0 16px;letter-spacing:-.01em}
.dl-title span{color:var(--primary)}
.dl-sub{font-size:16px;line-height:1.7;color:var(--muted);max-width:520px;margin:0 auto 34px}
.dl-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:0 26px;height:56px;border-radius:11px;font-size:16px;font-weight:600;
  text-decoration:none;border:1px solid transparent;background:var(--primary);color:#fff;cursor:pointer;transition:opacity .15s,transform .15s;box-shadow:0 12px 34px -12px rgba(224,35,28,.6)}
.dl-btn:hover{opacity:.93;transform:translateY(-1px)}
.dl-btn svg{width:20px;height:20px;flex:none}
.dl-hint{margin-top:16px;font-size:13.5px;line-height:1.6;color:var(--muted)}
.dl-hint b{color:var(--text);font-weight:600}
.dl-hint code{font-family:var(--font-geist-mono),monospace;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:5px;padding:1px 6px;font-size:12px}
.dl-note{margin-top:40px;padding-top:26px;border-top:1px solid var(--border);display:grid;gap:12px;text-align:left}
.dl-note-row{display:flex;gap:12px;font-size:13.5px;line-height:1.6;color:var(--muted)}
.dl-note-row b{color:var(--text);font-weight:600}
.dl-note-row svg{width:17px;height:17px;flex:none;color:var(--primary);margin-top:2px}
.dl-back{margin-top:34px;font-family:var(--font-geist-mono),monospace;font-size:12px;color:var(--muted);text-decoration:none;display:inline-block}
.dl-back:hover{color:var(--primary)}
@media (max-width:520px){.dl-btn{width:100%}}
`;

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
        <div className="dl-kicker">The SPECTRE app</div>
        <h1 className="dl-title">Install <span>SPECTRE</span>.</h1>
        <p className="dl-sub">
          Add SPECTRE to your Mac, Windows PC or phone and it runs in its own window — on your dock,
          taskbar or home screen, a click away. Same account, same everything.
        </p>

        <InstallButton />

        <div className="dl-note">
          <div className="dl-note-row"><Dot /><span><b>It runs like a real app.</b> Its own window, your dock/taskbar icon, full-screen — no browser tabs or address bar.</span></div>
          <div className="dl-note-row"><Dot /><span><b>Nothing to re-import.</b> Sign in once and your holdings, risk, research and AI analyst are all there.</span></div>
          <div className="dl-note-row"><Dot /><span><b>Works everywhere.</b> macOS, Windows, iPhone and Android — installed from your browser, no app store, no setup.</span></div>
        </div>

        <Link className="dl-back" href="/dashboard">Prefer the browser? Open SPECTRE in your browser &rsaquo;</Link>
      </div>
    </main>
  );
}
