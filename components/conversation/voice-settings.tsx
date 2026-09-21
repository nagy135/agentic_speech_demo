import { SlidersHorizontal } from "lucide-react";
import type { RealtimeController } from "@/hooks/use-realtime";
import {
  defaultVoiceSettings,
  type VoiceSettings as Settings,
} from "@/lib/realtime/settings";

export function VoiceSettings({ voice }: { voice: RealtimeController }) {
  const { settings, setSettings } = voice;
  const live = voice.status === "connected";
  const locked = voice.status === "connecting" || voice.settingsApplying;
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(voice.activeSettings);
  const needsRestart = live && settings.model !== voice.activeSettings.model;
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <details className="voice-settings">
      <summary>
        <SlidersHorizontal size={16} /> Voice settings{" "}
        <span>Debug controls</span>
      </summary>
      <div className="voice-settings-content">
        <p className="settings-intro">
          {live
            ? "Tune this chat live. Changing the model requires a restart."
            : "Choose how Melody listens and replies. These settings apply when you start a chat."}
        </p>
        <fieldset disabled={locked} className="settings-fields">
          <legend className="sr-only">Conversation settings</legend>
          <div className="settings-grid">
            <label className="settings-field" htmlFor="voice-model">
              <span>Model</span>
              <select
                id="voice-model"
                value={settings.model}
                onChange={(e) =>
                  change("model", e.target.value as Settings["model"])
                }
              >
                <option value="default">Deployment default</option>
                <option value="gpt-realtime">gpt-realtime</option>
                <option value="gpt-realtime-mini">gpt-realtime-mini</option>
              </select>
              <small>Requires a new conversation when changed.</small>
            </label>
            <label className="settings-field" htmlFor="voice-turn-detection">
              <span>Turn detection</span>
              <select
                id="voice-turn-detection"
                value={settings.turnDetection}
                onChange={(e) =>
                  change(
                    "turnDetection",
                    e.target.value as Settings["turnDetection"],
                  )
                }
              >
                <option value="semantic_vad">Semantic VAD</option>
                <option value="server_vad">Server VAD</option>
              </select>
              <small>
                {settings.turnDetection === "semantic_vad"
                  ? "Listens for a completed thought."
                  : "Listens for a pause in your speech."}
              </small>
            </label>
            {settings.turnDetection === "semantic_vad" ? (
              <label className="settings-field" htmlFor="voice-eagerness">
                <span>Reply eagerness</span>
                <select
                  id="voice-eagerness"
                  value={settings.eagerness}
                  onChange={(e) =>
                    change("eagerness", e.target.value as Settings["eagerness"])
                  }
                >
                  <option value="auto">Auto (medium)</option>
                  <option value="low">Low — allow longer pauses</option>
                  <option value="medium">Medium — balanced</option>
                  <option value="high">High — reply sooner</option>
                </select>
                <small>
                  Higher eagerness may cut into pauses in your speech.
                </small>
              </label>
            ) : (
              <>
                <label className="settings-field" htmlFor="voice-silence">
                  <span>
                    Pause before replying{" "}
                    <output>{settings.silenceDurationMs} ms</output>
                  </span>
                  <input
                    id="voice-silence"
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={settings.silenceDurationMs}
                    onChange={(e) =>
                      change("silenceDurationMs", Number(e.target.value))
                    }
                  />
                  <small>
                    100–2,000 ms. Shorter pauses trigger faster replies.
                  </small>
                </label>
                <label className="settings-field" htmlFor="voice-threshold">
                  <span>
                    Speech threshold{" "}
                    <output>{settings.threshold.toFixed(2)}</output>
                  </span>
                  <input
                    id="voice-threshold"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.threshold}
                    onChange={(e) =>
                      change("threshold", Number(e.target.value))
                    }
                  />
                  <small>
                    Lower detects quieter speech; higher filters more noise.
                  </small>
                </label>
              </>
            )}
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
                Only for confirming an instrument. A shorter wait may require
                you to repeat your choice.
              </small>
            </label>
          </div>
          <div className="settings-toggles">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.interruptResponse}
                onChange={(e) => change("interruptResponse", e.target.checked)}
              />
              <span>
                Allow interruptions
                <small>Stop Melody when you start speaking.</small>
              </span>
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.createResponse}
                onChange={(e) => change("createResponse", e.target.checked)}
              />
              <span>
                Automatic replies
                <small>When off, click “Reply now” after speaking.</small>
              </span>
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
            {live &&
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
              ? "Restart required: changing the model clears this conversation and starts a new chat with your settings."
              : live
                ? dirty
                  ? "Changes ready to apply without restarting."
                  : "Settings active in this chat."
                : voice.status === "connecting"
                  ? "Connecting with your settings…"
                  : "Your choices stay here until you reload the page."}
        </p>
      </div>
    </details>
  );
}
