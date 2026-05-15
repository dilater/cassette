import { useEffect, useRef, useState, useCallback, memo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { togglePause, seekRelative, seek, playFile, getTrackList, updateProgress, getSeriesTrackPref, setSeriesTrackPref, initScrubThumbs, getNextEpisode, getPrevEpisode, getSeasonEpisodeCount, applyVisualProfile, getGlobalProfile, getSeriesProfile, setSeriesProfile, setGlobalProfile, volumeUp, volumeDown, toggleMute, speedUp, speedDown, frameStep, frameBackStep, forceVideoResize, traktFinishWatching } from "../lib/tauri";
import { useAutoHide } from "../hooks/useAutoHide";
import type { LibraryItem, TrackInfo, VisualProfile } from "../types/library";
import ProfileChip from "../components/player/ProfileChip";
import AudioChip from "../components/player/AudioChip";
import SkipOverlay from "../components/player/SkipOverlay";
import Scrubber from "../components/player/Scrubber";
import type { ScrubberHandle } from "../components/player/Scrubber";
import TransportRow from "../components/player/TransportRow";
import type { TransportRowHandle } from "../components/player/TransportRow";
import WindowControls from "../components/WindowControls";

interface PlaybackState {
  paused: boolean;
  position_seconds: number;
  duration_seconds: number;
}

interface Props {
  currentItem: LibraryItem;
  onBack: () => void;
  onPlayItem: (item: LibraryItem) => void;
}

const appWindow = getCurrentWindow();

export default function PlayerView({ currentItem, onBack, onPlayItem }: Props) {
  // Only paused lives in React state — position/duration go straight to DOM
  // via imperative handles. This eliminates the 4 Hz re-render cascade that
  // was causing UI jank during playback.
  const [paused, setPaused] = useState(true);
  const pausedRef = useRef(true);

  // Position/duration refs — written by the event listener, read by effects
  // and the Scrubber/TransportRow imperative handles.
  const positionRef = useRef(0);
  const durationRef = useRef(0);

  // Imperative handles for direct DOM updates on scrubber + timecode
  const scrubberRef = useRef<ScrubberHandle | null>(null);
  const transportRef = useRef<TransportRowHandle | null>(null);

  // Lightweight flag: duration > 0 for the first time (triggers track load)
  const [durationKnown, setDurationKnown] = useState(false);

  const [videoReady, setVideoReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [profile, setProfile] = useState<VisualProfile>("low-power");
  const [nextEpisode, setNextEpisode] = useState<LibraryItem | null>(null);
  const [prevEpisode, setPrevEpisode] = useState<LibraryItem | null>(null);
  const [episodeCount, setEpisodeCount] = useState<number | null>(null);
  const isFullscreenRef = useRef(false);
  const wasMaximizedRef = useRef(false);
  const { visible: overlayVisible, show: showOverlay } = useAutoHide(isFullscreen, currentItem.id);

  // Keep currentItem accessible inside the event listener's closure
  const currentItemRef = useRef(currentItem);
  useEffect(() => { currentItemRef.current = currentItem; }, [currentItem]);

  // Keep ref in sync so keyboard handler always has fresh value
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  // Fetch adjacent episodes whenever the playing item changes
  useEffect(() => {
    setNextEpisode(null);
    setPrevEpisode(null);
    setEpisodeCount(null);
    if (currentItem.parsed_season == null) return;
    const id = currentItem.id;
    getNextEpisode(id).then(setNextEpisode);
    getPrevEpisode(id).then(setPrevEpisode);
    if (currentItem.series_id != null && currentItem.parsed_season != null) {
      getSeasonEpisodeCount(currentItem.series_id, currentItem.parsed_season).then(setEpisodeCount);
    }
  }, [currentItem.id]);

  // Central playback:state handler — only React state update is for paused.
  // Everything else goes to refs and then directly to DOM.
  useEffect(() => {
    const unlisten = listen<PlaybackState>("playback:state", (ev) => {
      const { paused: p, position_seconds: pos, duration_seconds: dur } = ev.payload;

      // Update refs (no re-render)
      positionRef.current = pos;
      durationRef.current = dur;

      // Push directly to DOM — zero React overhead
      scrubberRef.current?.update(pos, dur);
      transportRef.current?.update(pos, dur);

      // Only trigger React render when paused state actually changes
      if (p !== pausedRef.current) {
        pausedRef.current = p;
        setPaused(p);
      }

      // Signal once that duration is known (triggers track loading)
      if (dur > 0 && pos >= 0) {
        setDurationKnown((prev) => prev || true);
      }

      // Trakt near-end scrobble (fire once per file, outside React effect)
      if (!p && dur > 180 && pos >= dur - 120) {
        const item = currentItemRef.current;
        if (!scrobbledRef.current) {
          scrobbledRef.current = true;
          traktFinishWatching(item.id, pos, dur).catch(() => {});
        }
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Reset per-file state when item changes
  useEffect(() => {
    setDurationKnown(false);
    tracksLoadedRef.current = false;
    scrobbledRef.current = false;
    positionRef.current = 0;
    durationRef.current = 0;
    setPaused(true);
    pausedRef.current = true;
  }, [currentItem.id]);

  // Save progress every 5 seconds while playing
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      const pos = positionRef.current;
      const dur = durationRef.current > 0 ? durationRef.current : undefined;
      if (pos > 5) updateProgress(currentItem.id, pos, dur);
    }, 5000);
    return () => clearInterval(id);
  }, [paused, currentItem.id]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      const pos = positionRef.current;
      const dur = durationRef.current > 0 ? durationRef.current : undefined;
      if (pos > 5) updateProgress(currentItem.id, pos, dur);
    };
  }, [currentItem.id]);

  // Scrobble ref — reset in the item-change effect above
  const scrobbledRef = useRef(false);

  // Black cover stays opaque until the video is GUARANTEED to be rendering.
  // Fixed 900ms timeout per item change. mpv has always started producing
  // frames by that point. No reliance on duration heuristics.
  useEffect(() => {
    setVideoReady(false);
    const timer = setTimeout(() => setVideoReady(true), 900);
    return () => clearTimeout(timer);
  }, [currentItem.id]);

  // Load track list + kick off thumb pre-generation once file is ready.
  // durationKnown flips at most once per file (guarded by tracksLoadedRef).
  const tracksLoadedRef = useRef(false);
  useEffect(() => {
    if (!durationKnown || tracksLoadedRef.current) return;
    tracksLoadedRef.current = true;
    initScrubThumbs(currentItem.id, currentItem.path);
    getTrackList().then((list) => {
      setTracks(list);
      if (currentItem.series_id != null) {
        applyTrackPref(currentItem.series_id, list);
      }
    });
  }, [durationKnown]);

  // Apply the right profile when a new file loads
  useEffect(() => {
    async function loadProfile() {
      let profileToUse = "low-power";
      if (currentItem.series_id != null) {
        const seriesProfile = await getSeriesProfile(currentItem.series_id);
        if (seriesProfile) {
          profileToUse = seriesProfile;
        } else {
          profileToUse = await getGlobalProfile();
        }
      } else {
        profileToUse = await getGlobalProfile();
      }
      setProfile(profileToUse as VisualProfile);
      applyVisualProfile(profileToUse as VisualProfile);
    }
    loadProfile();
  }, [currentItem.id]);

  async function applyTrackPref(seriesId: number, list: TrackInfo[]) {
    const pref = await getSeriesTrackPref(seriesId);
    if (!pref) return;
    const audioTracks = list.filter((t) => t.kind === "audio");
    if (pref.audio_lang) {
      const match = audioTracks.find((t) => t.lang === pref.audio_lang);
      if (match && !match.selected) { await setAudioTrackAndRefresh(match.id); return; }
    }
    if (pref.audio_track_index != null) {
      const match = audioTracks.find((t) => t.id === pref.audio_track_index);
      if (match && !match.selected) { await setAudioTrackAndRefresh(match.id); }
    }
  }

  async function setAudioTrackAndRefresh(id: number) {
    const { setAudioTrack } = await import("../lib/tauri");
    await setAudioTrack(id);
    getTrackList().then(setTracks);
  }

  async function handleAudioTrackChange(trackId: number, lang: string | null) {
    if (currentItem.series_id != null) {
      await setSeriesTrackPref(currentItem.series_id, lang, trackId);
    }
    getTrackList().then(setTracks);
  }

  function refreshTracks() {
    getTrackList().then(setTracks);
  }

  async function handleProfileChange(p: VisualProfile) {
    setProfile(p);
    applyVisualProfile(p);
    setGlobalProfile(p);
  }

  async function handleSaveSeriesProfile(p: VisualProfile) {
    if (currentItem.series_id != null) {
      setSeriesProfile(currentItem.series_id, p);
    }
  }

  // Keep refs so keyboard handler always has the latest episode without stale closure
  const nextEpisodeRef = useRef<LibraryItem | null>(null);
  const prevEpisodeRef = useRef<LibraryItem | null>(null);
  useEffect(() => { nextEpisodeRef.current = nextEpisode; }, [nextEpisode]);
  useEffect(() => { prevEpisodeRef.current = prevEpisode; }, [prevEpisode]);

  function handleNextEpisode() {
    const ep = nextEpisodeRef.current;
    if (ep) onPlayItem(ep);
  }

  function handlePrevEpisode() {
    const ep = prevEpisodeRef.current;
    if (ep) onPlayItem(ep);
  }

  // Sync fullscreen state when window is resized / OS changes it. Only update
  // React state when the fullscreen value actually flips.
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    appWindow.onResized(async () => {
      const fs = await appWindow.isFullscreen();
      if (fs !== isFullscreenRef.current) {
        isFullscreenRef.current = fs;
        setIsFullscreen(fs);
      }
    }).then((fn) => { unlistenFn = fn; });
    return () => { unlistenFn?.(); };
  }, []);

  async function enterFullscreen() {
    wasMaximizedRef.current = await appWindow.isMaximized();
    if (wasMaximizedRef.current) {
      await appWindow.unmaximize();
      await new Promise<void>(r => setTimeout(r, 80));
    }
    await appWindow.setFullscreen(true);
    setIsFullscreen(true);
    isFullscreenRef.current = true;
    setTimeout(() => forceVideoResize().catch(() => {}), 300);
    showOverlay();
  }

  async function exitFullscreen() {
    await appWindow.setFullscreen(false);
    setIsFullscreen(false);
    isFullscreenRef.current = false;
    if (wasMaximizedRef.current) {
      await new Promise<void>(r => setTimeout(r, 80));
      await appWindow.maximize();
    }
    setTimeout(() => forceVideoResize().catch(() => {}), 300);
    showOverlay();
  }

  // Keyboard shortcuts
  const handleKey = useCallback((e: KeyboardEvent) => {
    switch (e.code) {
      case "Space":
      case "KeyK":
        e.preventDefault();
        togglePause();
        showOverlay();
        break;
      case "ArrowLeft":
      case "KeyJ":
        e.preventDefault();
        seekRelative(e.shiftKey ? -30.0 : -5.0);
        showOverlay();
        break;
      case "ArrowRight":
      case "KeyL":
        e.preventDefault();
        seekRelative(e.shiftKey ? 30.0 : 5.0);
        showOverlay();
        break;
      case "KeyF":
        e.preventDefault();
        if (isFullscreenRef.current) exitFullscreen();
        else enterFullscreen();
        break;
      case "Escape":
        e.preventDefault();
        if (isFullscreenRef.current) exitFullscreen();
        else onBack();
        break;
      case "ArrowUp":
        e.preventDefault();
        volumeUp();
        break;
      case "ArrowDown":
        e.preventDefault();
        volumeDown();
        break;
      case "KeyM":
        e.preventDefault();
        toggleMute();
        break;
      case "BracketLeft":
        e.preventDefault();
        speedDown();
        break;
      case "BracketRight":
        e.preventDefault();
        speedUp();
        break;
      case "Comma":
        if (!e.shiftKey) { e.preventDefault(); frameBackStep(); }
        break;
      case "Period":
        if (!e.shiftKey) { e.preventDefault(); frameStep(); }
        break;
      case "KeyN":
        e.preventDefault();
        handleNextEpisode();
        break;
      case "KeyP":
        e.preventDefault();
        handlePrevEpisode();
        break;
    }
  }, [onBack]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Always show overlay when paused
  useEffect(() => {
    if (paused) showOverlay();
  }, [paused]);

  // Drag-and-drop a new file onto the player
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const path = (file as unknown as { path: string }).path;
      if (path) playFile(path);
    }
  };

  function handleVideoAreaClick() {
    togglePause();
    showOverlay();
  }

  const playerClass = [
    "player-view",
    isFullscreen ? "is-fullscreen" : "",
    overlayVisible ? "overlay-visible" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={playerClass}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Title bar */}
      <div
        className="title-bar"
        data-tauri-drag-region
        onDoubleClick={() => appWindow.toggleMaximize()}
      >
        <button className="back-to-library" data-tauri-no-drag onClick={onBack}>library</button>
        <EmberMark />
        <span className="title-bar-label mono">{currentItem.filename}</span>
        <WindowControls />
      </div>

      {/* Video frame — transparent so mpv child HWND shows through */}
      <div className="video-area" onClick={handleVideoAreaClick}>
        <div className={`video-loading-cover${videoReady ? " is-ready" : ""}`} />
        <div className="video-chips-top">
          <ProfileChip
            profile={profile}
            resolution={currentItem.resolution}
            onProfileChange={handleProfileChange}
            seriesId={currentItem.series_id}
            onSaveForSeries={handleSaveSeriesProfile}
          />
        </div>

        <SkipOverlay paused={paused} visible={overlayVisible} />

        {/* Fullscreen toggle — appears with the overlay */}
        <button
          className="fullscreen-btn"
          style={{
            opacity: overlayVisible ? 1 : 0,
            pointerEvents: overlayVisible ? "auto" : "none",
          }}
          data-tauri-no-drag
          onClick={(e) => {
            e.stopPropagation();
            if (isFullscreen) exitFullscreen();
            else enterFullscreen();
          }}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>

        <div className="video-chips-bottom">
          <AudioChip tracks={tracks} onTrackChange={refreshTracks} onAudioSelect={handleAudioTrackChange} />
        </div>
      </div>

      {/* Transport section */}
      <div className="transport-section" data-tauri-no-drag>
        <Scrubber
          ref={scrubberRef}
          durationRef={durationRef}
          onSeek={seek}
          fileId={currentItem.id}
          filePath={currentItem.path}
        />
        <TransportRow
          ref={transportRef}
          paused={paused}
          currentItem={currentItem}
          nextEpisode={nextEpisode}
          prevEpisode={prevEpisode}
          episodeCount={episodeCount}
          onNext={handleNextEpisode}
          onPrev={handlePrevEpisode}
        />
      </div>
    </div>
  );
}

const EmberMark = memo(function EmberMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      style={{ flexShrink: 0, marginRight: 8 }}
      aria-hidden="true"
    >
      <rect width="20" height="20" rx="4" fill="#141210" />
      <path d="M7.25 6.15 L14.4 10 L7.25 13.85 Z" fill="#C9501A" />
    </svg>
  );
});

function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
