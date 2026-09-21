import { SlidersHorizontal } from "lucide-react";
import type { LiveController } from "@/hooks/use-live";
import {
  LIVE_MODEL,
  backendModels,
  voices,
  defaultVoiceSettings,
  type VoiceSettings as Settings,
} from "@/lib/live/settings";

export function VoiceSettings({ voice }: { voice: LiveController }) {
  const { settings, setSettings } = voice;
  const connected = voice.status === "connected";
  const locked =
    ["connecting", "closing"].includes(voice.status) || voice.settingsApplying;
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(voice.activeSettings);
  const needsRestart =
    connected && settings.voice !== voice.activeSettings.voice;
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <details className="voice-settings">
      <summary>
        <SlidersHorizontal size={16} /> Voice settings <span>GPT-Live</span>
      </summary>
      <div className="voice-settings-content">
        <p className="settings-intro">
          <strong>{LIVE_MODEL}</strong> listens and speaks at the same time. It
          manages pauses, replies and interruptions automatically.
        </p>
        <fieldset disabled={locked} className="settings-fields">
          <legend className="sr-only">GPT-Live settings</legend>
          <div className="settings-grid">
            <label className="settings-field" htmlFor="voice-name">
              <span>Voice</span>
              <select
                id="voice-name"
                value={settings.voice}
                onChange={(e) =>
                  change("voice", e.target.value as Settings["voice"])
                }
              >
                {voices.map((name) => (
                  <option value={name} key={name}>
                    {name[0].toUpperCase() + name.slice(1)}
                  </option>
                ))}
              </select>
              <small>Changing voice requires a new conversation.</small>
            </label>
            <label className="settings-field" htmlFor="voice-backend">
              <span>Reasoning &amp; tools model</span>
              <select
                id="voice-backend"
                value={settings.backendModel}
                onChange={(e) =>
                  change(
                    "backendModel",
                    e.target.value as Settings["backendModel"],
                  )
                }
              >
                {backendModels.map((model) => (
                  <option value={model} key={model}>
                    {model}
                  </option>
                ))}
              </select>
              <small>
                Handles instrument suggestions. Can change during a chat; the
                voice model stays GPT-Live.
              </small>
            </label>
            <label className="settings-field" htmlFor="voice-backend-limit">
              <span>
                Backend output limit{" "}
                <output>{settings.maxOutputTokens} tokens</output>
              </span>
              <input
                id="voice-backend-limit"
                type="range"
                min="256"
                max="8192"
                step="256"
                value={settings.maxOutputTokens}
                onChange={(e) =>
                  change("maxOutputTokens", Number(e.target.value))
                }
              />
              <small>
                Limits each backend response. Too low can interrupt a tool call;
                it does not limit spoken replies.
              </small>
            </label>
            <label className="settings-field" htmlFor="voice-transcript-wait">
              <span>
                Confirmation transcript wait{" "}
                <output>{settings.transcriptWaitMs} ms</output>
              </span>
              <input
                id="voice-transcript-wait"
                type="range"
                min="0"
                max="5000"
                step="100"
                value={settings.transcriptWaitMs}
                onChange={(e) =>
                  change("transcriptWaitMs", Number(e.target.value))
                }
              />
              <small>
                Only for verifying a final choice. It never delays ordinary
                speech or interruptions.
              </small>
            </label>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSettings({ ...defaultVoiceSettings })}
            >
              Reset defaults
            </button>
            {connected &&
              (needsRestart ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void voice.restart()}
                >
                  Restart chat &amp; apply
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled={!dirty}
                  onClick={voice.applySettings}
                >
                  Apply to this chat
                </button>
              ))}
          </div>
        </fieldset>
        <p className="settings-status" role="status">
          {voice.settingsApplying
            ? "Applying settings…"
            : needsRestart
              ? "Restart required: changing the voice clears this conversation and starts a new chat."
              : connected
                ? dirty
                  ? "Changes ready to apply without restarting."
                  : "Settings active in this chat."
                : voice.status === "closing"
                  ? "Finishing the current session…"
                  : voice.status === "connecting"
                    ? "Connecting to GPT-Live…"
                    : "These settings apply to your next chat and stay selected until you reload."}
        </p>
        {voice.sessionId && (
          <p className="settings-status">
            Session: {voice.sessionId} · Reported voice usage:{" "}
            {voice.usageSeconds.toFixed(1)} s
            {voice.backendWorking ? " · Backend working" : ""}
          </p>
        )}
      </div>
    </details>
  );
}
