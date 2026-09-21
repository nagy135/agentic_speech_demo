# First Note

A Next.js voice demo that helps someone discover an instrument they would love to learn. Click **Let’s find my instrument**, allow the microphone, and talk with Melody. The conversation starts in English and follows your language when you switch.

## Run locally

```sh
nix develop
pnpm install --frozen-lockfile
cp .env.example .env
# Add your OpenAI API key to .env.
pnpm dev
```

Open <http://localhost:3000>. The Nix flake supports Apple Silicon macOS, plus ARM64 and x86-64 Linux. `flake.lock` pins Node.js **24.20.0**, pnpm **10.34.5**, and Python for the optional catalogue generator. `package.json` also pins pnpm 10.34.5. Without Nix, install Node 24 and that pnpm version before running the same commands.

Nix only sees tracked files in a Git checkout: if you copy this project into a fresh repository, stage `flake.nix` and `flake.lock` before `nix develop` (or use `nix develop path:.`).

## Production with Docker

Create `.env` with the variables below, then run:

```sh
docker compose up --build -d
```

Open <http://localhost:3000>. Stop a local `pnpm dev` process first if it already uses port 3000. Use `docker compose logs -f app` for logs and `docker compose down` to stop it.

Docker binds to localhost only. Set `APP_PORT` in `.env` to change the host port. On nixpi, use `APP_PORT=13004`; the nix-server configuration serves it at <https://speech.infiniter.tech> through nginx with an automatically renewed TLS certificate.

The Dockerfile builds with Node 24.20.0 and pnpm 10.34.5, then runs only the Next.js standalone output and static assets as the unprivileged `node` user. Compose reads `.env` at runtime; `.dockerignore` excludes all `.env` files from the build context. No API key is required to build the image. For a remote hostname, serve it through HTTPS so browsers allow microphone access. A reverse proxy should preserve the original `Host` header and overwrite `X-Forwarded-Proto` with the public request's scheme for origin validation.

## Environment variables

| Variable                | Required | Default        | Purpose                                                                      |
| ----------------------- | -------- | -------------- | ---------------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | Yes      | —              | A server-only OpenAI API key with Realtime access and API billing available. |
| `OPENAI_REALTIME_MODEL` | No       | `gpt-realtime` | Model used for speech-to-speech conversation.                                |
| `OPENAI_REALTIME_VOICE` | No       | `marin`        | Realtime output voice.                                                       |

No `NEXT_PUBLIC_` credentials, separate speech service, image API, or database are needed. Restart the dev server after editing `.env`. The API key never goes to the browser. Audio and input transcription use your OpenAI API project and incur API usage.

## How it works

1. The browser requests the microphone after the start button is clicked and creates a WebRTC SDP offer.
2. `POST /api/session` forwards the SDP plus server-owned session instructions, catalogue and tool definitions to OpenAI's `/v1/realtime/calls`. Only the SDP answer returns to the browser.
3. WebRTC carries microphone input and assistant audio directly between the browser and OpenAI. The data channel carries transcripts and function calls. Semantic voice activity detection allows natural turn-taking and interruption.
4. Completed tool calls update the interface, then return `function_call_output` to OpenAI. A subsequent response lets Melody continue speaking about the instruments.

The implementation follows the [gpt-realtime announcement supplied for this demo](https://openai.com/index/introducing-gpt-realtime/?video=1113635977), the [official WebRTC unified-interface guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime), and the [Realtime conversations/function-calling guide](https://developers.openai.com/api/docs/guides/realtime-conversations).

### Voice settings

Expand **Voice settings** in the bottom-right corner to tune the model, turn detection, reply eagerness, silence duration, speech threshold, interruptions, automatic replies, and confirmation transcript wait. Only controls supported by the selected turn-detection mode are shown.

Before connecting, the settings apply to the next chat. During a chat, **Apply to this chat** sends a `session.update` directly to OpenAI over the WebRTC data channel and waits for acknowledgement. The transcript wait is local to the browser. Model changes show **Restart chat & apply**, which starts a fresh conversation and clears the previous transcript and selections. Settings remain selected until the page is reloaded; **Reset defaults** restores the original values.

Turning automatic replies off keeps speech detection enabled and shows **Reply now** for manually requesting a response after speaking. The initial greeting and tool continuations still run. A shorter confirmation transcript wait never bypasses confirmation checks: if evidence is missing, the tool rejects the choice.

The initial `POST /api/session` includes the settings in an `X-Voice-Settings` header. The server validates allowed values and retains ownership of instructions, tools, and credentials. The model dropdown offers the deployment default, `gpt-realtime`, and `gpt-realtime-mini`.

### The two tools

- **`suggest_instrument`** accepts 1–3 distinct catalogue IDs with personalized reasons. It replaces the current shortlist with illustrated cards containing a title and two-line truncated text. The assistant can continue talking while the cards remain visible.
- **`finalize_choice`** accepts one previously suggested ID, a short reason, `explicitlyConfirmed: true`, and an original-language `confirmationQuote`. It clears suggestions and shows a single highlighted “Your choice” card.

The assistant is explicitly instructed to distinguish interest and questions from confirmation and ask when uncertain. The application additionally requires a later user turn and checks the confirmation quote against the latest transcript; missing evidence fails closed. Transcription can lag speech, so finalization waits briefly for it. Interpreting whether an utterance is explicit confirmation is still the model's responsibility; the quote check is grounding, not a separate semantic classifier. When transcription differs from the quote, Melody asks the user to repeat their choice. Finalizing does not end the conversation; users can ask about getting started. “Explore again” begins a fresh session.

### Catalogue and UI

- `data/instruments.json`: **54** fictional instrument entries across strings, keys, woodwinds, brass and percussion. Each includes a description, genres, learning curve, practice volume, portability and local image path.
- `public/instruments/`: bundled SVG illustrations with no image service dependency. These are stylized illustrations, not product photographs.
- `scripts/generate-catalogue.py`: regenerates the sample JSON and illustrations. Edit the JSON directly to supply your own catalogue; running the generator replaces those edits.
- `lib/session.ts`: conversation instructions and session configuration.
- `lib/tools.ts`: validated instrument-selection state transitions.
- `lib/realtime/tool-definitions.ts`: the two API function schemas.
- `hooks/use-realtime.ts`: a thin React subscription adapter.
- `lib/realtime/client.ts`: session state, events, transcripts and tool execution.
- `lib/realtime/transport.ts`: WebRTC, microphone/audio resources and connection cleanup.
- `components/`: one component per file, grouped into catalogue, conversation, landing and layout.
- The collection browser is available before connecting. Google Fonts enhance the typography; system font fallbacks work without it.

## Development checks

```sh
pnpm run pretty        # Format supported project files with Prettier
pnpm run pretty:check  # Verify formatting without writing
pnpm run lint          # ESLint, including Next.js and React rules
pnpm run typecheck
pnpm test              # Catalogue, tool guards, session configuration and API route tests
pnpm build
```

Unit tests cover catalogue validity, shortlist updates, confirmation grounding, session configuration, API proxy validation, and WebRTC resource cleanup with mocked browser APIs. They make no paid API calls. There is no Playwright dependency or browser test runner. The actual audio connection and model-driven language/confirmation behavior should be smoke-tested with your API key: try an English opening, switch to another language, express interest without confirming, then explicitly choose an instrument.

Microphone access requires localhost or HTTPS. For a public deployment, protect the session endpoint with your application's authentication and a shared rate limiter; this local demo intentionally has no user accounts. The development server binds to loopback. Conversations and choices stay in browser memory and are not saved by this app.
