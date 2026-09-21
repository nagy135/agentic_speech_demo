export const modelOptions = [
  "default",
  "gpt-realtime",
  "gpt-realtime-mini",
] as const;
export const turnDetectionOptions = ["semantic_vad", "server_vad"] as const;
export const eagernessOptions = ["auto", "low", "medium", "high"] as const;

export interface VoiceSettings {
  model: (typeof modelOptions)[number];
  turnDetection: (typeof turnDetectionOptions)[number];
  eagerness: (typeof eagernessOptions)[number];
  silenceDurationMs: number;
  threshold: number;
  interruptResponse: boolean;
  createResponse: boolean;
  transcriptWaitMs: number;
}

export const defaultVoiceSettings: VoiceSettings = {
  model: "default",
  turnDetection: "semantic_vad",
  eagerness: "auto",
  silenceDurationMs: 500,
  threshold: 0.5,
  interruptResponse: true,
  createResponse: true,
  transcriptWaitMs: 2500,
};

export const settingsHeader = "X-Voice-Settings";

export function turnDetectionConfig(settings: VoiceSettings) {
  return {
    ...(settings.turnDetection === "semantic_vad"
      ? { type: "semantic_vad" as const, eagerness: settings.eagerness }
      : {
          type: "server_vad" as const,
          silence_duration_ms: settings.silenceDurationMs,
          threshold: settings.threshold,
        }),
    create_response: settings.createResponse,
    interrupt_response: settings.interruptResponse,
  };
}

/** Accept only the exposed controls, never arbitrary session instructions/tools. */
export function parseVoiceSettings(raw: string | null): VoiceSettings {
  if (raw === null) return { ...defaultVoiceSettings };
  if (raw.length > 2048) throw new Error("Voice settings are too large.");
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("Voice settings must be valid JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Voice settings must be an object.");
  if (
    Object.keys(input).some((key) => !Object.hasOwn(defaultVoiceSettings, key))
  )
    throw new Error("Unknown voice setting.");
  const settings = { ...defaultVoiceSettings, ...input };
  if (
    !modelOptions.includes(settings.model) ||
    !turnDetectionOptions.includes(settings.turnDetection) ||
    !eagernessOptions.includes(settings.eagerness) ||
    typeof settings.interruptResponse !== "boolean" ||
    typeof settings.createResponse !== "boolean" ||
    !Number.isInteger(settings.silenceDurationMs) ||
    settings.silenceDurationMs < 100 ||
    settings.silenceDurationMs > 2000 ||
    typeof settings.threshold !== "number" ||
    !Number.isFinite(settings.threshold) ||
    settings.threshold < 0 ||
    settings.threshold > 1 ||
    !Number.isInteger(settings.transcriptWaitMs) ||
    settings.transcriptWaitMs < 0 ||
    settings.transcriptWaitMs > 5000
  )
    throw new Error(
      "Invalid voice settings. Reset the controls and try again.",
    );
  return settings;
}
