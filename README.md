# Recollect — Screenshot learning studio

A working English-language prototype of a screenshot-to-practice assistant. It imports screenshots, extracts text in the browser, connects related captures, and creates contextual recall cards and fill-in-the-blank quizzes. Original screenshots and practice history are saved in a private, authenticated library.

## Try it

1. Explore the clearly labelled example collection, or choose **Add screenshot**.
2. Import a PNG, JPG, or WebP image (up to 8 MB), or use **Paste text**. `tests/fixtures/reading-example.png` is an authored example for trying OCR.
3. Review the extracted text. Edit the suggested words and collection, and optionally name the source.
4. Choose **Create practice materials**. Adding related screenshots to the same collection extends its practice set without overwriting earlier cards or their progress.
5. Practise with **Flip & remember**, or type answers in **Put it to the test**. **View original context** opens the original screenshot.
6. Edit your learning goal from the target icon or sidebar. Topic rules and the goal provide a default collection; shared vocabulary takes priority when matching existing captures.

Example collection activity is not saved. Your own captures, learning goal, and completed review events are stored server-side. Hosted and local preview databases are separate.

## Prototype boundaries

- English OCR uses Tesseract.js in the browser. Its worker, WASM engine, and English language data are downloaded from the Tesseract CDN on first use; screenshot pixels are processed locally until you explicitly save to your library.
- This version uses deterministic word selection, vocabulary overlap, and topic rules. It does not call an LLM or infer language-learning goals from arbitrary prose.
- Flashcards practise missing words in the original sentence; they do not invent translations or definitions. Quiz answers match the captured word, ignoring case, surrounding punctuation, and excess whitespace. Valid synonyms are not graded as equivalent.
- New screenshots arrive through import. The app does not watch the device's photo library or capture the screen in the background.
- Context includes the screenshot and any source label entered by the learner. A URL or video timestamp cannot be recovered reliably from image pixels and is not fabricated.
- Review history persists; unfinished sessions and unsaved imports do not survive a page reload. This prototype does not implement spaced repetition or adaptive difficulty.
- Saving sends the image and reviewed text to the app's private storage. The hosted app requires the owner's ChatGPT sign-in, and every data/image endpoint checks the authenticated user.

## Stack and storage

React with Vinext/Vite, Cloudflare Workers, D1 for records and review history, R2 for screenshot bytes, Tesseract.js for OCR, and the bundled Radix/Shadcn primitives for dialogs, navigation tabs, sidebar, and progress. The only WebMCP action, `open_screenshot_import`, opens the same import form; it never saves or uploads by itself.

`lib/learning.ts` contains extraction-independent vocabulary and card logic. `lib/server.ts` handles identity, validation, and storage access. API routes live in `app/api/`. The UI is in `app/studio.tsx` and `app/globals.css`.

## Local development

Requires Node.js 22.13 or later and npm.

```sh
npm ci
npm run db:generate   # only after schema changes
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_melted_iceman.sql
npm run dev -- --hostname 127.0.0.1 --port 5179
```

Apply each local migration once, in order. The dev server provides a local-only simulated sign-in at `/signin-with-chatgpt?return_to=/`; it is not part of the production deployment. The hosted app uses Sites authentication.

```sh
npm test
node node_modules/typescript/bin/tsc --noEmit
node tests/api-check.mjs  # requires the local preview; creates labelled test data
```

The API check is intended for the local simulated sign-in only, not production. It creates an image-backed capture and idempotent review event. IDs are written to ignored `.sites-runtime/api-check-ids.json` for cleanup; it never deletes existing learner data.

## Checks performed

- Unit checks for contextual masking, repeated words, whole-word boundaries, multiword phrases, unavailable terms, answer matching, grouping, and source-derived sample cards.
- TypeScript validation and production build.
- Local API checks for authentication, cross-origin mutation rejection, actual screenshot upload/retrieval, invalid-term rejection, durable library records, and idempotent review retries.
- Browser checks for screenshot OCR, editable extracted text, saving and viewing source context, flashcards, quiz answers, persistence after refresh, and narrow/desktop layouts.
- WebMCP import action validated with a valid input and a rejected invalid input.

These are prototype verification checks, not evidence of improved learning outcomes.
