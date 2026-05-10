import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { togglePause, seekRelative, seek, playFile, getTrackList, updateProgress, getSeriesTrackPref, setSeriesTrackPref, initScrubThumbs, getNextEpisode, getPrevEpisode, getSeasonEpisodeCount, applyVisualProfile, getGlobalProfile, getSeriesProfile, setSeriesProfile, setGlobalProfile, volumeUp, volumeDown, toggleMute, speedUp, speedDown, frameStep, frameBackStep, forceVideoResize, traktFinishWatching } from "../lib/tauri";
import { useAutoHide } from "../hooks/useAutoHide";
import type { LibraryItem, TrackInfo, VisualProfile } from "../types/library";
import ProfileChip from "../components/player/ProfileChip";
import AudioChip from "../components/player/AudioChip";
import SkipOverlay from "../components/player/SkipOverlay";
import Scrubber from "../components/player/Scrubber";
import TransportRow from "../components/player/TransportRow";
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
  const [state, setState] = useState<PlaybackState>({
    paused: true,
    position_seconds: 0,
    duration_seconds: 0,
  });
  const [videoReady, setVideoReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [profile, setProfile] = useState<VisualProfile>("film");
  const [nextEpisode, setNextEpisode] = useState<LibraryItem | null>(null);
  const [prevEpisode, setPrevEpisode] = useState<LibraryItem | null>(null);
  const [episodeCount, setEpisodeCount] = useState<number | null>(null);
  const isFullscreenRef = useRef(false);
  const wasMaximizedRef = useRef(false);
  const { visible: overlayVisible, show: showOverlay } = useAutoHide(isFullscreen, currentItem.id);

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

  useEffect(() => {
    const unlisten = listen<PlaybackState>("playback:state", (ev) => {
      setState(ev.payload);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Always-current position/duration for cleanup captures
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  useEffect(() => {
    positionRef.current = state.position_seconds;
    durationRef.current = state.duration_seconds;
  }, [state.position_seconds, state.duration_seconds]);

  // Save progress every 5 seconds while playing
  useEffect(() => {
    if (state.paused || state.position_seconds < 5) return;
    const id = setInterval(() => {
      const dur = durationRef.current > 0 ? durationRef.current : undefined;
      updateProgress(currentItem.id, positionRef.current, dur);
    }, 5000);
    return () => clearInterval(id);
  }, [state.paused, currentItem.id]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (positionRef.current > 5) {
        const dur = durationRef.current > 0 ? durationRef.current : undefined;
        updateProgress(currentItem.id, positionRef.current, dur);
      }
    };
  }, [currentItem.id]);

  // Scrobble to Trakt when within 2 minutes of the end (fire once per file)
  const scrobbledRef = useRef(false);
  useEffect(() => {
    scrobbledRef.current = false;
  }, [currentItem.id]);
  useEffect(() => {
    const { position_seconds: pos, duration_seconds: dur, paused } = state;
    if (paused || dur <= 0 || scrobbledRef.current) return;
    if (pos >= dur - 120 && dur > 180) {
      scrobbledRef.current = true;
      traktFinishWatching(currentItem.id, pos, dur).catch(() => {});
    }
  }, [state.position_seconds, currentItem.id]);

  // Require duration to pass through 0 before accepting > 0 as "file loaded".
  // Prevents stale mpv events from the previous file clearing the cover early.
  const seenZeroDuration = useRef(false);
  useEffect(() => {
    setVideoReady(false);
    seenZeroDuration.current = false;
  }, [currentItem.id]);
  useEffect(() => {
    if (state.duration_seconds === 0) {
      seenZeroDuration.current = true;
    } else if (state.duration_seconds > 0 && seenZeroDuration.current) {
      setVideoReady(true);
    }
  }, [state.duration_seconds]);

  // Load track list + kick off thumb pre-generation once file is ready
  const tracksLoadedRef = useRef(false);
  useEffect(() => {
    if (state.duration_seconds > 0 && !tracksLoadedRef.current) {
      tracksLoadedRef.current = true;
      initScrubThumbs(currentItem.id, currentItem.path);
      getTrackList().then((list) => {
        setTracks(list);
        if (currentItem.series_id != null) {
          applyTrackPref(currentItem.series_id, list);
        }
      });
    }
  }, [state.duration_seconds]);

  // Apply the right profile when a new file loads
  useEffect(() => {
    tracksLoadedRef.current = false;
    async function loadProfile() {
      let profileToUse = "film";
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

  // Sync fullscreen state when window is resized / OS changes it
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    appWindow.onResized(async () => {
      const fs = await appWindow.isFullscreen();
      setIsFullscreen(fs);
      isFullscreenRef.current = fs;
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

  // Keyboard shortcuts — use ref so handler never captures stale isFullscreen
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

  // Always show overlay when paused
  useEffect(() => {
    if (state.paused) showOverlay();
  }, [state.paused]);

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

        <SkipOverlay paused={state.paused} visible={overlayVisible} />

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
          position={state.position_seconds}
          duration={state.duration_seconds}
          onSeek={seek}
          fileId={currentItem.id}
          filePath={currentItem.path}
        />
        <TransportRow
          paused={state.paused}
          position={state.position_seconds}
          duration={state.duration_seconds}
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

function EmberMark() {
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
}

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
