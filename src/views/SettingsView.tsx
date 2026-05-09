import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getTraktCredentials,
  setTraktCredentials,
  traktGetStatus,
  traktDisconnect,
  traktStartDeviceAuth,
  traktSyncNow,
  letterboxdExport,
} from "../lib/tauri";
import AboutView from "./AboutView";

function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface TraktStatus {
  connected: boolean;
  username?: string;
  last_synced?: number;
}

interface DeviceAuth {
  user_code: string;
  verification_url: string;
  expires_in: number;
}

export default function SettingsView() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [credentialsDirty, setCredentialsDirty] = useState(false);
  const [status, setStatus] = useState<TraktStatus>({ connected: false });
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuth | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTraktCredentials().then((c) => {
      setClientId(c.client_id);
      setClientSecret(c.client_secret);
    });
    traktGetStatus().then(setStatus);
  }, []);

  useEffect(() => {
    const unlisten = listen<{ username?: string }>("trakt:auth-complete", (ev) => {
      setDeviceAuth(null);
      setAuthLoading(false);
      setStatus({ connected: true, username: ev.payload.username });
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ reason: string }>("trakt:auth-failed", (ev) => {
      setDeviceAuth(null);
      setAuthLoading(false);
      setError(`Auth failed: ${ev.payload.reason}`);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  async function handleSaveCredentials() {
    setError(null);
    await setTraktCredentials(clientId, clientSecret).catch((e) => setError(String(e)));
    setCredentialsDirty(false);
  }

  async function handleConnect() {
    setError(null);
    setAuthLoading(true);
    try {
      if (credentialsDirty) {
        await setTraktCredentials(clientId, clientSecret);
        setCredentialsDirty(false);
      }
      const result = await traktStartDeviceAuth();
      setDeviceAuth(result);
    } catch (e) {
      setError(String(e));
      setAuthLoading(false);
    }
  }

  async function handleDisconnect() {
    await traktDisconnect();
    setStatus({ connected: false });
    setDeviceAuth(null);
  }

  async function handleSync() {
    setSyncLoading(true);
    setSyncResult(null);
    setError(null);
    try {
      const count = await traktSyncNow();
      setSyncResult(`Synced ${count} film${count !== 1 ? "s" : ""} to Trakt.`);
      const updated = await traktGetStatus();
      setStatus(updated);
    } catch (e) {
      setError(String(e));
    }
    setSyncLoading(false);
  }

  async function handleExport() {
    setExportLoading(true);
    setExportResult(null);
    setError(null);
    try {
      const path = await letterboxdExport();
      setExportResult(`Saved to: ${path}`);
    } catch (e) {
      setError(String(e));
    }
    setExportLoading(false);
  }

  return (
    <div className="settings-view">
      {error && (
        <div className="settings-error">{error}</div>
      )}

      <section className="settings-section">
        <h2 className="settings-section-title">Trakt</h2>

        <div className="settings-field-group">
          <label className="settings-label">Client ID</label>
          <input
            className="settings-input mono"
            type="text"
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setCredentialsDirty(true); }}
            placeholder="Paste your Trakt app client ID"
            spellCheck={false}
          />
        </div>

        <div className="settings-field-group">
          <label className="settings-label">Client secret</label>
          <input
            className="settings-input mono"
            type="password"
            value={clientSecret}
            onChange={(e) => { setClientSecret(e.target.value); setCredentialsDirty(true); }}
            placeholder="Paste your Trakt app client secret"
          />
        </div>

        {credentialsDirty && (
          <button className="settings-btn-primary" onClick={handleSaveCredentials}>
            Save credentials
          </button>
        )}

        <div className="settings-trakt-status">
          {status.connected ? (
            <>
              <div className="settings-connected-row">
                <span className="settings-dot-active" />
                <span className="settings-connected-label">
                  Connected as <span className="mono">{status.username}</span>
                </span>
                <button className="settings-btn-ghost" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
              {status.last_synced && (
                <div className="settings-last-synced mono">
                  Last synced: {formatTs(status.last_synced)}
                </div>
              )}
              <div className="settings-action-row">
                <button
                  className="settings-btn-secondary"
                  onClick={handleSync}
                  disabled={syncLoading}
                >
                  {syncLoading ? "Syncing..." : "Sync now"}
                </button>
                {syncResult && <span className="settings-result-text">{syncResult}</span>}
              </div>
            </>
          ) : deviceAuth ? (
            <div className="settings-device-auth">
              <p className="settings-device-instructions">
                Go to <span className="mono settings-verify-url">{deviceAuth.verification_url}</span> and enter:
              </p>
              <div className="settings-device-code mono">{deviceAuth.user_code}</div>
              <p className="settings-device-hint">Waiting for confirmation...</p>
            </div>
          ) : (
            <button
              className="settings-btn-primary"
              onClick={handleConnect}
              disabled={authLoading || !clientId || !clientSecret}
            >
              {authLoading ? "Connecting..." : "Connect Trakt account"}
            </button>
          )}
        </div>

        <p className="settings-hint">
          Create a free app at{" "}
          <span className="mono">trakt.tv/oauth/applications</span> to get credentials.
        </p>
      </section>

      <div className="settings-divider" />

      <section className="settings-section">
        <h2 className="settings-section-title">Letterboxd</h2>
        <p className="settings-hint">
          Export your watched films as a CSV file you can import at letterboxd.com.
        </p>
        <div className="settings-action-row">
          <button
            className="settings-btn-secondary"
            onClick={handleExport}
            disabled={exportLoading}
          >
            {exportLoading ? "Exporting..." : "Export watch history as CSV"}
          </button>
        </div>
        {exportResult && (
          <div className="settings-result-text mono settings-export-path">{exportResult}</div>
        )}
      </section>

      <div className="settings-divider" />

      <AboutView />
    </div>
  );
}
