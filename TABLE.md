| Setting                      | Default         | Values                                                   | When it applies                                               |
| ---------------------------- | --------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Voice model                  | `gpt-live-1`    | Fixed                                                    | The entire app uses GPT-Live.                                 |
| Voice                        | `marin`         | `marin`, `cedar`, `quartz`, `ripple`, `vesper`, `willow` | Requires **Restart chat & apply**.                            |
| Reasoning & tools model      | `gpt-5.6-terra` | `gpt-5.6-terra`, `gpt-5.6-luna`                          | **Apply to this chat**, without restarting the voice session. |
| Backend output limit         | `2048` tokens   | `256–8192` tokens                                        | Live update; too low can leave a tool response incomplete.    |
| Confirmation transcript wait | `2500` ms       | `0–5000` ms                                              | Local update, only for verifying a final instrument choice.   |

Open the collapsible **Voice settings** panel in the bottom-right corner. Changing the voice offers a restart and explains that it starts a new conversation.

GPT-Live listens and speaks continuously. It manages interruptions and turn-taking itself, so Realtime's VAD mode, eagerness, silence threshold, automatic-response toggle, and manual reply trigger no longer apply. The transcript wait does not delay ordinary conversation.

[Official GPT-Live session documentation](https://developers.openai.com/api/docs/guides/live-conversations) · [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)
