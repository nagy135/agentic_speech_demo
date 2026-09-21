# First Note

A Next.js voice demo that helps someone discover an instrument they would love to learn. Click **Let’s find my instrument**, allow the microphone, and talk with Melody. The conversation uses **GPT-Live (`gpt-live-1`)**, starts in English, and follows your language when you switch.

## Run locally

```sh
nix develop
pnpm install --frozen-lockfile
cp .env.example .env
# Add your OpenAI API key to .env.
pnpm dev
```

Open <http://localhost:3000>. The Nix flake supports Apple Silicon macOS, ARM64 Linux, and x86-64 Linux. It pins Node.js **24.20.0** and pnpm **10.34.5**. Without Nix, install those versions before running the commands above. Nix only sees tracked files; use `nix develop path:.` in a new, untracked checkout.

## Production with Docker

Create `.env`, then run:

```sh
docker compose up --build -d
```

Docker binds to localhost. Set `APP_PORT` to change the host port; nixpi uses **13004** and nginx serves <https://speech.infiniter.tech> with TLS. The Dockerfile builds the Next.js standalone output and runs it as the unprivileged `node` user. No API key is required at build time. `.dockerignore` excludes `.env` files from the build context.

Use `docker compose logs -f app` for logs. A reverse proxy should preserve `Host` and overwrite `X-Forwarded-Proto` with the public request's scheme for origin validation. Microphone access requires localhost or HTTPS.

## Configuration

| Variable         | Required | Purpose                                                             |
| ---------------- | -------- | ------------------------------------------------------------------- |
| `OPENAI_API_KEY` | Yes      | Server-only project key with GPT-Live and Responses backend access. |
| `APP_PORT`       | No       | Docker host port; defaults to `3000`.                               |

The voice model is `gpt-live-1`. Old `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE` variables are no longer used. The website controls the voice, Responses backend model, backend output budget, and confirmation transcript wait. There are no `NEXT_PUBLIC_` credentials or separate transcription service. Voice duration and backend model usage are billed separately by OpenAI.

## How the conversation works

1. The browser creates a WebRTC offer, gathers ICE candidates, and sends the SDP and validated UI settings to `POST /api/session`.
2. Our server sends JSON to OpenAI's `POST /v1/live/sessions` with `model: "gpt-live-1"`, conversation instructions, a voice, and Responses delegation. It returns only the session ID and SDP answer.
3. Audio streams directly between the browser and OpenAI, including silence before the user speaks. After `session.started`, the browser sends greeting instructions, waits for their matching `session.instructions.appended` acknowledgement, then sends a single `session.commentary.append` cue to begin speaking. The cue is skipped if either speaker has already started, the instruction was rejected, or the session is closing.
4. GPT-Live decides when to speak and when a request needs backend work. OpenAI passes the relevant conversation context to **GPT-5.6 Terra** (or the selected **GPT-5.6 Luna**), configured with the catalogue, business rules, and function tools.
5. Completed function calls arrive as nested `response.output_item.done` events inside `response.event`. The browser collects them by response/delegation, executes the validated handlers after backend completion, sends `response.item.create` results, then `response.create` to continue the backend. Completion snapshots may have empty output; they are not the source of tool arguments.
6. GPT-Live communicates the backend's result while continuing to listen. Interruptions do not inherently cancel delegated work; the app rejects stale tool actions if newer user speech arrived after that delegation began.
7. **End chat** immediately silences local input/output, sends `session.close`, and waits for `session.closed` before releasing WebRTC resources. Final voice usage appears in the debug panel. Restart waits for shutdown before opening a fresh session.

Our server handles connection setup; it does not relay ongoing audio or execute the instrument tools. There is no database, purchase, or persistent confirmed-choice record.

See the official [GPT-Live WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [delegation guide](https://developers.openai.com/api/docs/guides/live-delegation), and [session lifecycle guide](https://developers.openai.com/api/docs/guides/live-conversations).

### Voice settings

Expand **Voice settings** in the bottom-right corner. Settings remain selected until the page reloads. **Reset defaults** restores the defaults; during a chat, apply or restart to activate them.

| Control                      | Default         | During a chat                                                                 |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------- |
| Voice model                  | `gpt-live-1`    | Fixed; the app exclusively uses GPT-Live.                                     |
| Voice                        | `marin`         | **Restart chat & apply**; clears the previous conversation and selection.     |
| Reasoning & tools model      | `gpt-5.6-terra` | **Apply to this chat**; also offers `gpt-5.6-luna`.                           |
| Backend output limit         | 2048 tokens     | Live update; range 256–8192. Too low can leave a backend response incomplete. |
| Confirmation transcript wait | 2500 ms         | Local update; range 0–5000 ms. Does not affect ordinary speech latency.       |

Backend settings updates use `session.update` and become active only after the matching `session.updated` acknowledgement. GPT-Live manages turn-taking continuously: Realtime's VAD mode, eagerness, silence threshold, automatic-response switch, and manual Reply now control do not apply and have been removed.

### Tools and confirmation

- **`suggest_instrument`** displays 1–3 valid catalogue instruments with personalized reasons. It replaces the shortlist without finalizing a choice.
- **`finalize_choice`** requires a previously suggested instrument, a later user utterance, explicit confirmation, and a quote grounded in the user's latest transcript. It replaces the shortlist with the confirmed choice.

Voice and backend prompts both distinguish interest, comparisons, and hypothetical choices from confirmation. The application validates IDs, a later utterance, quoted evidence, and whether the request became stale. If evidence is missing or ambiguous, the tool fails closed and Melody asks again. Finalization does not end the conversation.

GPT-Live sends timestamped transcript fragments, not completed user-turn events. The app retains fragments, orders late arrivals by source time, and groups each speaker independently across short gaps. Overlapping assistant acknowledgements do not split the user's utterance. This grouping only affects captions and confirmation evidence, never audio transmission or response timing. Closely spaced utterances can be grouped together, causing confirmation to be requested again. Transcript and prompt checks do not replace a separate semantic consent classifier.

The speaking indicator uses received WebRTC audio energy rather than backend completion events. Caption updates and backend activity remain independent.

### Project map

- `lib/session.ts`: separate GPT-Live conversation and Responses backend prompts/configuration.
- `lib/live/`: WebRTC transport, lifecycle, delegated tools, timestamped transcripts, and settings.
- `hooks/use-live.ts`: React subscription and session controls.
- `lib/tools.ts`: validated instrument-selection state transitions.
- `components/`: conversation, debug panel, catalogue, and layout components.
- `data/instruments.json`: 54 fictional instruments, with bundled illustrations under `public/instruments/`.
- `scripts/generate-catalogue.py`: regenerates the demo catalogue and SVG illustrations.

## Development checks

```sh
pnpm run pretty:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm build
```

Tests cover session validation, startup and shutdown, nested tool events, duplicate prevention, stale-request rejection, confirmation grounding, overlapping and late transcripts, and live-settings acknowledgements. They mock browser/network APIs and make no paid calls.

For a live check, confirm the greeting, interrupt while Melody speaks, switch languages, request a shortlist, then explicitly choose an instrument in a later utterance. Verify both the spoken result and the cards. Test voice restart and changing the backend model while connected.

For a public production application, add authentication and shared request limits to session creation. This demo has no user accounts; conversations and choices stay in browser memory.
