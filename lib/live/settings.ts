export const LIVE_MODEL = "gpt-live-1";
export const backendModels = ["gpt-5.6-terra", "gpt-5.6-luna"] as const;
export const voices = [
  "marin",
  "cedar",
  "quartz",
  "ripple",
  "vesper",
  "willow",
] as const;
export interface VoiceSettings {
  voice: (typeof voices)[number];
  backendModel: (typeof backendModels)[number];
  maxOutputTokens: number;
  transcriptWaitMs: number;
}
export const defaultVoiceSettings: VoiceSettings = {
  voice: "marin",
  backendModel: "gpt-5.6-terra",
  maxOutputTokens: 2048,
  transcriptWaitMs: 2500,
};
export const settingsHeader = "X-Voice-Settings";
export function backendSettings(settings: VoiceSettings) {
  return {
    model: settings.backendModel,
    max_output_tokens: settings.maxOutputTokens,
  };
}
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
    throw new Error(
      "Unknown voice setting. Reload the page to use GPT-Live controls.",
    );
  const settings = { ...defaultVoiceSettings, ...input };
  if (
    !voices.includes(settings.voice) ||
    !backendModels.includes(settings.backendModel) ||
    !Number.isInteger(settings.maxOutputTokens) ||
    settings.maxOutputTokens < 256 ||
    settings.maxOutputTokens > 8192 ||
    !Number.isInteger(settings.transcriptWaitMs) ||
    settings.transcriptWaitMs < 0 ||
    settings.transcriptWaitMs > 5000
  )
    throw new Error(
      "Invalid voice settings. Reset the controls and try again.",
    );
  return settings;
}
