# Recollect

A private screenshot language-learning prototype with two views: **Library** and **Practice**. The main flow is **Add screenshot → Review text if needed → Practise**.

## Use

1. Save a target language, approximate CEFR level, and learning goal once. Edit these in Learning settings later.
2. Import a PNG, JPEG, or WebP screenshot (up to 8 MB). OCR retains text regions, reading order, coordinates, and confidence. English, Spanish, French, German, Korean, and Japanese are available.
3. OCR retries a text-block and sparse-text layout when the first pass is empty or uncertain. If reading cannot finish, the screenshot can still be saved with a manual correction. When prompted, select relevant regions and check their language. Deselect interface text. Mark areas of interest and enter corrections separately; original OCR text and the original image remain saved.
4. Practise one question at a time: answer, check, read concise feedback, continue. View source shows the exact region and marks an unanswered question as assisted.
5. Sessions and responses persist. The Practice view shows material ready for review. There are no notifications or background photo-library access.

## Model connection and fallback

The application includes a server-side OpenAI Responses API integration. Set `OPENAI_API_KEY` as a **Sites runtime secret**. `OPENAI_MODEL` optionally overrides the default `gpt-5.4-mini`. Neither value belongs in `.openai/hosting.json`, client code, Git, or browser storage. For local development only, use an ignored environment file with the local runtime. Use the OpenAI Developers plugin's API-key workflow when configuring the hosted Site.

With a model connected, the pipeline:

- interprets layout and annotates the OCR regions without overwriting their text;
- selects at most four contextual words, phrases, or grammatical patterns using goals, level, learner-selected highlights, and stored performance;
- generates explanations, optional labelled new examples, a short recognition–recall–application sequence, and alternative retry questions;
- validates the schema and source references, then runs a separate semantic quality check;
- revises failing output at most once and omits questions that still fail;
- matches existing items by language, normalized form, and contextual sense, attaching new source examples without replacing history;
- grades open responses by meaning and use, allowing alternatives and returning uncertainty for learner review.

**The deployed environment currently has no model key configured.** Until connected, the app explicitly provides **source recall only**: learners enter up to four words or phrases, one per line (commas stay within a phrase); selection tolerates case, apostrophe style, Unicode composition and Japanese OCR spacing while deterministic cloze questions preserve the captured wording, and new-sentence responses require learner review. Repeated words use a contiguous source excerpt containing one occurrence. Missing or unsupported selections return specific guidance and remain in the editor; older fallback lessons refresh when reopened. It does not invent contextual definitions, automatically match uncertain senses, or pretend to grade open responses. Unverified senses stay separate across screenshots. Automatic selection, semantic matching, vision interpretation, and model quality/grading paths require a live connection to activate and verify.

The integration follows the official [Responses structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs) and [image-input format](https://developers.openai.com/api/docs/guides/images-vision). Requests use `store: false`. With a connection, images are sent to the model for layout analysis and selected text, learning settings, and relevant prior item summaries are used for lesson generation. Without one, OCR runs in the browser and images/text are saved only to the private app storage. Tesseract downloads its worker, WASM runtime, and language data on first use.

## Pipeline and data

- `lib/pipeline/schema.ts`: Zod data contracts and derived strict JSON Schema.
- `extraction.ts`: OCR region creation, interface heuristics, review gating.
- `model.ts` / `generation.ts`: model transport, layout, contextual generation, semantic grading.
- `validation.ts` / `quality-loop.ts`: deterministic provenance/answer checks and bounded semantic revision.
- `source-recall.ts` / `text-matching.ts`: transparent no-model fallback, Unicode-aware source matching and exact source excerpts.
- `lib/read-screenshot.ts`: bounded OCR layout retries and manual recovery.
- `scheduling.ts`: objective grading, different-question retries, and stored review intervals.
- `storage.ts`: owner-scoped source links, contextual item identities, history-preserving plan writes.
- `app/api/v2/`: authenticated upload, review, profile, generation, session, and answer endpoints.
- `app/studio.tsx`: minimal UI, with Radix dialogs and responsive layouts.

D1 holds records, profiles, item/source links, sessions, attempts, and schedules. R2 holds screenshot bytes. Server endpoints enforce ownership and same-origin mutations. Answer rules stay server-side until feedback; explicitly viewing source is recorded as assistance. Answer submissions are idempotent. Concurrent session edits use optimistic locking.

The additive `0001_fair_vermin.sql` migration preserves all original captures, preferences, and `review_events`. Older captures remain visible and can be reviewed to create new practice; they have no historic OCR coordinates. When an old term becomes a new item, its legacy review IDs are imported once. Original review rows are retained. The v1 API and learning module remain only for compatibility.

Review intervals are simple prototype rules: successful unassisted responses progress through 1, 3, 7, 14, and 30 days; incorrect or assisted responses return after one day. Uncertain responses are not scheduled until reviewed. This is not a validated learning-outcome model. Model quality checks reduce errors but do not guarantee correctness.

## Development

Node.js 22.13+ and npm:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_melted_iceman.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_fair_vermin.sql
npm run dev -- --port 5179
```

Apply each migration once, in order. Use `npm run db:generate` only after a schema change. The local-only simulated sign-in is `/signin-with-chatgpt?return_to=/`; the deployed Site uses ChatGPT authentication. Local and hosted data are separate.

## Verification

```sh
npm test
node node_modules/typescript/bin/tsc --noEmit
node tests/api-v2-check.mjs
npm run build
```

The API check requires the local preview **without a model key** and creates authored test captures; it does not delete learner data. It checks authentication, origin protection, image storage, review gates, immutable original text, separate corrections, answer secrecy, idempotency, retry variants, uncertain-answer review, session resumption, and stored schedules.

Unit checks cover source provenance, uncertainty, selection limits, sense identity, answer leakage, duplicate questions, objective grading, scheduling, and the one-revision limit. Browser QA covers real OCR upload, region selection, settings, practice feedback, source highlighting, persistence, and desktop/mobile layouts. Live model responses have not been tested because no key is configured.
