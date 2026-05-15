import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "../lib/tauri";

interface Supporters {
  supporters: string[];
}

export default function AboutView() {
  const [version, setVersion] = useState("0.1.0");
  const [supporters, setSupporters] = useState<string[]>([]);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    fetch("/supporters.json")
      .then((r) => r.json())
      .then((data: Supporters) => setSupporters(data.supporters ?? []))
      .catch(() => {});
  }, []);

  function open(url: string) {
    openUrl(url).catch(() => {});
  }

  return (
    <div className="about-view">
      <div className="about-identity">
        <CassetteGlyph className="about-glyph" />
        <div className="about-name">Cassette Community Edition</div>
        <div className="about-version mono">{version} Beta</div>
        <div className="about-tagline">Intentional, premium home media system.</div>
      </div>

      <div className="about-divider" />

      <section className="about-section">
        <div className="about-section-title">Support Cassette</div>
        <DonationRow
          name="Ko-fi"
          description="One-off support"
          url="https://ko-fi.com"
          onOpen={open}
        />
        <DonationRow
          name="Patreon"
          description="Monthly support"
          url="https://patreon.com"
          onOpen={open}
        />
        <DonationRow
          name="GitHub Sponsors"
          description="Support via GitHub"
          url="https://github.com/sponsors/dilater"
          onOpen={open}
        />
      </section>

      <div className="about-divider" />

      <section className="about-section">
        <div className="about-section-title">Built with</div>
        <div className="about-builtwidth-list">
          <button className="about-link" onClick={() => open("https://mpv.io")}>mpv</button>
          <button className="about-link" onClick={() => open("https://docs.rs/libmpv2")}>libmpv2</button>
          <button className="about-link" onClick={() => open("https://v2.tauri.app")}>Tauri</button>
          <button className="about-link" onClick={() => open("https://react.dev")}>React</button>
        </div>
        <button
          className="about-link about-license"
          onClick={() => open("https://github.com/dilater/Cassette/blob/main/LICENSE")}
        >
          MIT License
        </button>
      </section>

      <div className="about-divider" />

      <section className="about-section">
        <div className="about-section-title">Supporters</div>
        {supporters.length === 0 ? (
          <div className="about-supporters-empty">Be the first to support Cassette.</div>
        ) : (
          <div className="about-credits-wrap">
            <div className="about-credits-scroll">
              {[...supporters, ...supporters].map((name, i) => (
                <div key={i} className="about-credit-name">{name}</div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DonationRow({ name, description, url, onOpen }: {
  name: string;
  description: string;
  url: string;
  onOpen: (url: string) => void;
}) {
  return (
    <div className="about-donation-row">
      <div className="about-donation-info">
        <div className="about-donation-name">{name}</div>
        <div className="about-donation-desc">{description}</div>
      </div>
      <button className="about-donation-btn" onClick={() => onOpen(url)}>
        Support
      </button>
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
