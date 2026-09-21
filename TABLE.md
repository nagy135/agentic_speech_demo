| Setting                 | Current value                  | Values to try                           | Effect                                                                                           |
| ----------------------- | ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `eagerness`             | `"auto"` (= `"medium"`)        | `"low"`, `"medium"`, `"high"`, `"auto"` | Higher eagerness replies sooner after you finish. Only for `semantic_vad`.                       |
| `turn_detection.type`   | `"semantic_vad"`               | `"semantic_vad"`, `"server_vad"`        | Semantic detects sentence completion; server VAD detects pauses.                                 |
| `silence_duration_ms`   | Not configured                 | `250`, `350`, `500` ms                  | Shorter pauses trigger replies sooner, with more risk of cutting you off. Only for `server_vad`. |
| `threshold`             | Not configured                 | `0.3`, `0.5`, `0.7` within range `0–1`  | Lower detects quieter speech; higher filters more background noise. Only for `server_vad`.       |
| `interrupt_response`    | `true`                         | Keep `true`                             | Allows your speech to interrupt the assistant.                                                   |
| `create_response`       | `true`                         | Keep `true`                             | Automatically starts a reply when your turn ends.                                                |
| `OPENAI_REALTIME_MODEL` | Falls back to `"gpt-realtime"` | Another compatible Realtime model       | Changes response speed, quality, and cost.                                                       |
| App transcription wait  | Up to `2500` ms                | `0–5000` ms in Voice settings           | Only delays final-choice confirmation when its transcript is missing.                            |

**First experiment:** keep `semantic_vad` and change `eagerness` to `"high"`.

Open the floating **Voice settings** panel in the bottom-right corner. Controls apply to the next chat, or use **Apply to this chat** while connected. Changing the model shows **Restart chat & apply** and starts a fresh conversation. With automatic replies disabled, use **Reply now** after speaking. Server VAD starts with a 500 ms silence duration and a 0.5 threshold when selected.

[Official OpenAI turn-detection documentation](https://developers.openai.com/api/docs/guides/realtime-vad)
