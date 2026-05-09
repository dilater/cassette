import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { addWatchedFolder, setTraktCredentials, traktStartDeviceAuth } from "../lib/tauri";

interface Props {
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4;

export default function OnboardingView({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 2
  const [folders, setFolders] = useState<string[]>([]);

  // Step 3 Trakt
  const [traktExpanded, setTraktExpanded] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [traktConnecting, setTraktConnecting] = useState(false);
  const [deviceAuth, setDeviceAuth] = useState<{ user_code: string; verification_url: string } | null>(null);
  const [traktUsername, setTraktUsername] = useState<string | null>(null);
  const [traktError, setTraktError] = useState<string | null>(null);

  // Step 4: auto-advance after 2 seconds
  useEffect(() => {
    if (step !== 4) return;
    const t = setTimeout(onComplete, 2000);
    return () => clearTimeout(t);
  }, [step, onComplete]);

  // Trakt auth events
  useEffect(() => {
    const ul1 = listen<{ username?: string }>("trakt:auth-complete", (ev) => {
      setDeviceAuth(null);
      setTraktConnecting(false);
      setTraktUsername(ev.payload.username ?? "your account");
    });
    const ul2 = listen<{ reason: string }>("trakt:auth-failed", (ev) => {
      setDeviceAuth(null);
      setTraktConnecting(false);
      setTraktError(ev.payload.reason);
    });
    return () => { ul1.then((f) => f()); ul2.then((f) => f()); };
  }, []);

  async function handleAddFolder() {
    const sel = await open({ directory: true, multiple: false });
    if (!sel) return;
    const path = typeof sel === "string" ? sel : (sel as string[])[0];
    if (!path) return;
    await addWatchedFolder(path);
    setFolders((prev) => [...prev, path]);
  }

  async function handleTraktConnect() {
    if (!clientId || !clientSecret) return;
    setTraktError(null);
    setTraktConnecting(true);
    try {
      await setTraktCredentials(clientId, clientSecret);
      const result = await traktStartDeviceAuth();
      setDeviceAuth(result);
    } catch (e) {
      setTraktConnecting(false);
      setTraktError(String(e));
    }
  }

  return (
    <div className="onboarding">
      {step === 1 && (
        <div className="onboarding-step">
          <CassetteGlyph className="onboarding-glyph" />
          <h1 className="onboarding-title">Cassette</h1>
          <p className="onboarding-tagline">Your films. Your machine.</p>
          <button className="onboarding-btn-primary" onClick={() => setStep(2)}>
            Get started
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-step">
          <h2 className="onboarding-heading">Add your media</h2>
          <p className="onboarding-sub">Tell Cassette where your films and TV shows live.</p>

          <div className="onboarding-drop-zone" onClick={handleAddFolder} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}>
            <span className="onboarding-drop-plus">+</span>
            <span className="onboarding-drop-label">Add a folder where your media lives</span>
            <span className="onboarding-drop-hint">Click to browse</span>
          </div>

          {folders.length > 0 && (
            <div className="onboarding-folder-list">
              {folders.map((f) => (
                <div key={f} className="onboarding-folder-row mono">{f}</div>
              ))}
            </div>
          )}

          <div className="onboarding-step-actions">
            <button
              className="onboarding-btn-primary"
              disabled={folders.length === 0}
              onClick={() => setStep(3)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboarding-step">
          <h2 className="onboarding-heading">Connect accounts</h2>
          <p className="onboarding-sub">Optional. You can set these up later in Settings.</p>

          <div className="onboarding-account-cards">
            {/* Trakt */}
            <div className="onboarding-account-card">
              <div className="onboarding-account-name">Trakt</div>
              <div className="onboarding-account-desc">Sync your watch history across devices</div>

              {traktUsername ? (
                <div className="onboarding-connected-row">
                  <span className="settings-dot-active" />
                  <span className="onboarding-connected-label">Connected as <span className="mono">{traktUsername}</span></span>
                </div>
              ) : deviceAuth ? (
                <div className="onboarding-device-auth">
                  <div className="onboarding-device-url">
                    Go to <span className="mono">{deviceAuth.verification_url}</span> and enter:
                  </div>
                  <div className="onboarding-device-code mono">{deviceAuth.user_code}</div>
                  <div className="onboarding-device-hint">Waiting for confirmation...</div>
                </div>
              ) : traktExpanded ? (
                <div className="onboarding-trakt-form">
                  {traktError && <div className="onboarding-error">{traktError}</div>}
                  <input
                    className="settings-input mono"
                    placeholder="Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    spellCheck={false}
                  />
                  <input
                    className="settings-input mono"
                    type="password"
                    placeholder="Client secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                  <div className="onboarding-trakt-hint">Get credentials at trakt.tv/oauth/applications</div>
                  <button
                    className="settings-btn-primary"
                    onClick={handleTraktConnect}
                    disabled={traktConnecting || !clientId || !clientSecret}
                  >
                    {traktConnecting ? "Connecting..." : "Connect"}
                  </button>
                </div>
              ) : (
                <button className="settings-btn-secondary" onClick={() => setTraktExpanded(true)}>
                  Connect Trakt
                </button>
              )}
            </div>

            {/* Letterboxd */}
            <div className="onboarding-account-card">
              <div className="onboarding-account-name">Letterboxd</div>
              <div className="onboarding-account-desc">Export your film history as CSV</div>
              <div className="onboarding-account-note">Available in Settings once you have watched films.</div>
            </div>
          </div>

          <div className="onboarding-step-actions">
            <button className="onboarding-btn-primary" onClick={() => setStep(4)}>
              Done
            </button>
            <button className="onboarding-skip" onClick={() => setStep(4)}>
              Skip for now
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="onboarding-step onboarding-step--complete">
          <CassetteGlyph className="onboarding-glyph onboarding-glyph--dim" />
          <p className="onboarding-complete-text">You're set.</p>
        </div>
      )}
    </div>
  );
}

function CassetteGlyph({ className }: { className?: string }) {
  return (
    <svg className={className ?? ""} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="112" height="64" rx="8" stroke="currentColor" strokeWidth="3" />
      <circle cx="36" cy="44" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="84" cy="44" r="14" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="36" cy="44" r="5" fill="currentColor" />
      <circle cx="84" cy="44" r="5" fill="currentColor" />
      <path d="M50 44 Q60 52 70 44" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect x="46" y="14" width="28" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
