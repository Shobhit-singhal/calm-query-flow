# Calm News Insights

Build a minimalist news research web app called "Pulse" — it should feel calm, fast, and editorial, like a cross between a well-designed reading app and a search engine. Not corporate, not cluttered. Think generous whitespace, one accent color, and typography doing most of the work.

BACKEND
The app talks to a FastAPI backend over two GET endpoints. The base URL changes each session (it's an ngrok tunnel), so:
- Add a small settings/gear icon in the top corner that opens a field where I can paste the current API base URL, saved to localStorage.
- Default it to an empty state with a friendly prompt to "paste your API URL to get started" if none is set.

Endpoints (base URL + path):
1. GET /trending?min_sources=1&max_topics=10
   Returns: { count, trending: [{ topic, headline_count, source_count, sample_headline, sources: [string], link }] }

2. GET /research?topic=...&max_articles=6&summary_length=medium&summarizer=auto&keep_unverified=false
   Returns: {
     topic, paragraph (a summary with [1][2] style citation markers inline),
     summary: [{ sentence, source, url, confidence, support }],
     articles: [{ title, source, url, text, published }],
     summary_mode,
     key_terms: [{ term, type, count, n_sources, sources: [number] }],
     agreements: [{ source_a, sentence_a, source_b, sentence_b, shared_entities, similarity, confidence }],
     complementary: [{ source_a, sentence_a, source_b, sentence_b, reason }],
     potential_conflicts: [{ source_a, sentence_a, source_b, sentence_b, shared_entities, similarity, confidence, reason }]
   }
   This call can take 20-60 seconds (it's running ML models) — design the loading state accordingly, not a generic spinner.

LAYOUT & PAGES

Home / search screen:
- Centered, large, quiet search bar as the focal point — the whole page should feel like it's built around this one action.
- Below it, a horizontal row of "trending now" chips fetched from /trending — clicking one fills the search bar and triggers research immediately.
- Small controls (collapsed by default, expandable) for summary_length (short/medium/long) and summarizer (auto/bart/pegasus).

Loading state (while /research runs):
- Not a spinner — show a short sequence of calm status lines that change every few seconds ("Scraping sources…", "Summarizing…", "Cross-checking coverage…") so the wait feels intentional, not broken.

Results screen:
- Lead with the summary paragraph in a large, readable serif or clean sans font, with the [1][2] citation markers as small superscript pills that scroll/highlight the matching source when clicked or hovered.
- A "Sources" section below as clean cards: outlet name, article title, link. Numbered to match citations.
- Key terms shown as small subtle tags/pills, not a heavy table.
- Agreements / Complementary info / Potential conflicts as three quiet, clearly separated sections (not tabs — let people scroll), each showing paired quotes side by side with the source name. Conflicts should feel neutral, not alarming — no red warning colors, just a clear visual distinction (e.g. a thin left border) so it reads as "worth noting" rather than "error."
- An empty/error state for topics that return 404 (not enough articles found) — friendly, suggest trying a broader topic.

DESIGN DIRECTION
- One accent color, otherwise near-monochrome (off-white/soft black or a muted dark mode toggle).
- Generous line-height and margins — content should breathe.
- Subtle motion only: gentle fade/slide when results appear, hover states that feel soft not snappy.
- No heavy shadows, no gradients, no icon soup. A couple of well-chosen icons max.
- Should feel good to use even before any data loads — the empty/loading states are part of the design, not an afterthought.

Keep the whole thing to a single-page flow: search → loading → results, with a simple way to search again from the results view (persistent, unobtrusive search bar at the top once you've searched).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b332fbf3-2dd2-40cc-8bc9-ccc6795c1a4c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
