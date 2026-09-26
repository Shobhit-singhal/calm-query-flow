import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Moon, Search, Settings2, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Trend = { topic: string; headline_count: number; source_count: number; sample_headline: string; sources: string[]; link: string };
type Article = { title: string; source: string; url: string; text: string; published: string };
type SummaryItem = { sentence: string; source: string; url: string; confidence: number; support: unknown };
type Pair = { source_a: string | number; sentence_a: string; source_b: string | number; sentence_b: string; shared_entities?: string[]; similarity?: number; confidence?: number; reason?: string };
type Term = { term: string; type: string; count: number; n_sources: number; sources: number[] };
type Research = { topic: string; paragraph: string; summary: SummaryItem[]; articles: Article[]; summary_mode: string; key_terms: Term[]; agreements: Pair[]; complementary: Pair[]; potential_conflicts: Pair[] };
type Phase = "home" | "loading" | "results" | "empty" | "error";
type SummaryLength = "short" | "medium" | "long";
type Summarizer = "auto" | "bart" | "pegasus";

const STORAGE_KEY = "pulse-api-url";
const THEME_KEY = "pulse-theme";
const stages = ["Finding coverage across sources…", "Reading the reporting…", "Summarizing the story…", "Cross-checking coverage…", "Putting the pieces together…"];

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Pulse — News, in perspective" },
    { name: "description", content: "A quieter way to research the news. Search a topic, read a sourced summary, and compare coverage across outlets." },
    { property: "og:title", content: "Pulse — News, in perspective" },
    { property: "og:description", content: "A quieter way to research the news. Search a topic, read a sourced summary, and compare coverage across outlets." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Pulse,
});

function validApiUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}

function endpoint(base: string, path: string, params: Record<string, string>) {
  const url = new URL(`${base.replace(/\/+$/, "")}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function Pulse() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiDraft, setApiDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [query, setQuery] = useState("");
  const [length, setLength] = useState<SummaryLength>("medium");
  const [summarizer, setSummarizer] = useState<Summarizer>("auto");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("home");
  const [results, setResults] = useState<Research | null>(null);
  const [searchedTopic, setSearchedTopic] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [trends, setTrends] = useState<Trend[]>([]);
  const [trendingState, setTrendingState] = useState<"loading" | "loaded" | "error">("loading");
  const [trendingRefresh, setTrendingRefresh] = useState(0);
  const [stage, setStage] = useState(0);
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const sourceRefs = useRef<(HTMLElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) || "";
    setApiUrl(saved);
    setApiDraft(saved);
    const dark = window.localStorage.getItem(THEME_KEY) === "dark";
    setDarkMode(dark);
    document.documentElement.classList.toggle("dark", dark);
    setReady(true);
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  }

  useEffect(() => {
    if (!apiUrl) { setTrends([]); setTrendingState("loaded"); return; }
    const controller = new AbortController();
    setTrendingState("loading");
    fetch(endpoint(apiUrl, "trending", { min_sources: "1", max_topics: "10" }), { signal: controller.signal, headers: { "ngrok-skip-browser-warning": "true" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Trending request failed (${response.status})`);
        return response.json();
      })
      .then((data: { trending?: Trend[] }) => { setTrends(Array.isArray(data.trending) ? data.trending : []); setTrendingState("loaded"); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { console.error("Pulse trending:", error); setTrendingState("error"); } });
    return () => controller.abort();
  }, [apiUrl, trendingRefresh]);

  useEffect(() => {
    if (phase !== "loading") return;
    setStage(0);
    const started = Date.now();
    const timer = window.setInterval(() => setStage(Math.min(Math.floor((Date.now() - started) / 7000), stages.length - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function saveApi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = apiDraft.trim().replace(/\/+$/, "");
    if (next && !validApiUrl(next)) { setSettingsError("Enter a full http:// or https:// URL."); return; }
    requestRef.current?.abort();
    window.localStorage.setItem(STORAGE_KEY, next);
    setApiUrl(next);
    setApiDraft(next);
    setSettingsError("");
    setSettingsOpen(false);
    setResults(null);
    setPhase("home");
  }

  async function research(topic: string) {
    const clean = topic.trim();
    if (!clean) { searchRef.current?.focus(); return; }
    if (!apiUrl) { setSettingsOpen(true); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setQuery(clean);
    setSearchedTopic(clean);
    setResults(null);
    setErrorMessage("");
    setPhase("loading");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const response = await fetch(endpoint(apiUrl, "research", { topic: clean, max_articles: "6", summary_length: length, summarizer, keep_unverified: "false" }), { signal: controller.signal, headers: { "ngrok-skip-browser-warning": "true" } });
      if (response.status === 404) { setPhase("empty"); return; }
      if (!response.ok) throw new Error(`The research service returned ${response.status}.`);
      const data = await response.json() as Research;
      if (!data || (!data.paragraph && !data.articles?.length)) { setPhase("empty"); return; }
      setResults(data);
      setActiveSource(null);
      setPhase("results");
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Pulse research:", error);
      setErrorMessage(error instanceof TypeError ? "Couldn’t reach the research service. Check your API URL, tunnel, and browser access, then try again." : error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  function goHome() {
    requestRef.current?.abort();
    setPhase("home");
    setResults(null);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusSource(index: number) {
    setActiveSource(index);
    sourceRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const compact = phase !== "home";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative z-10 mx-auto flex h-20 max-w-7xl items-center justify-between border-b border-border px-6 md:px-10">
        <Button variant="ghost" onClick={goHome} className="h-auto p-0 font-serif text-[31px] font-semibold leading-none hover:bg-transparent hover:text-primary" aria-label="Pulse home">pulse<span className="text-primary">.</span></Button>
        <div className="flex items-center gap-3 sm:gap-5">
          {ready && apiUrl && <span className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Connected</span>}
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Switch to light mode" : "Switch to dark mode"} className="text-muted-foreground hover:text-foreground">{darkMode ? <Sun className="!size-[19px]" strokeWidth={1.6} /> : <Moon className="!size-[19px]" strokeWidth={1.6} />}</Button>
          <Popover open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (open) { setApiDraft(apiUrl); setSettingsError(""); } }}>
            <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="API settings" title="API settings" className="text-muted-foreground hover:text-foreground"><Settings2 className="!size-[19px]" strokeWidth={1.6} /></Button></PopoverTrigger>
            <PopoverContent align="end" sideOffset={12} className="w-[min(350px,calc(100vw-32px))] rounded-md border-border p-5 shadow-none">
              <form onSubmit={saveApi} className="space-y-4">
                <div><h2 className="font-serif text-2xl">Your connection</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Paste the current API URL for your news research service.</p></div>
                <div><label htmlFor="api-url" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.13em]">API base URL</label><Input id="api-url" type="url" value={apiDraft} onChange={(event) => { setApiDraft(event.target.value); setSettingsError(""); }} placeholder="https://your-tunnel.ngrok-free.app" className="h-11 rounded-sm bg-background text-sm shadow-none" /><p className="mt-2 text-xs text-muted-foreground">Saved on this device. Update it when your tunnel changes.</p>{settingsError && <p role="alert" className="mt-2 text-xs text-destructive">{settingsError}</p>}</div>
                <Button type="submit" className="w-full rounded-sm shadow-none">Save URL <Check className="ml-1" /></Button>
              </form>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {compact ? (
        <div className="sticky top-0 z-[5] border-b border-border bg-background/95 backdrop-blur-sm">
          <form onSubmit={(event) => { event.preventDefault(); void research(query); }} className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3 md:px-10">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />
            <input ref={searchRef} aria-label="Search topic" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search another topic" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground" />
            <Button type="submit" size="icon" variant="ghost" aria-label="Search" title="Search" className="shrink-0 text-primary"><ArrowRight /></Button>
          </form>
        </div>
      ) : null}

      <main>
        {phase === "home" && <div className="arrive mx-auto flex min-h-[calc(100vh-145px)] max-w-5xl flex-col justify-center px-6 pb-20 pt-14 md:px-10 md:pb-28">
          <div className="mb-8 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><span className="h-px w-7 bg-primary" /> A clearer view of the news</div>
          <h1 className="max-w-[850px] font-serif text-[clamp(3.8rem,8vw,7.6rem)] font-normal leading-[0.95]">Know the story.<br /><em className="font-normal text-primary">See the whole picture.</em></h1>
          <p className="mt-7 max-w-lg text-[15px] leading-7 text-muted-foreground md:text-base">Research what matters, with the sources and perspectives right beside the summary.</p>
          <form onSubmit={(event) => { event.preventDefault(); void research(query); }} className="mt-12 flex w-full max-w-[790px] items-center border-b-2 border-foreground pb-3 transition-colors focus-within:border-primary md:mt-16 md:pb-4">
            <Search className="mr-4 size-5 shrink-0 text-muted-foreground md:size-6" strokeWidth={1.5} />
            <input ref={searchRef} aria-label="What would you like to understand?" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to understand?" className="min-w-0 flex-1 bg-transparent font-serif text-xl outline-none placeholder:text-muted-foreground/70 sm:text-2xl md:text-3xl" />
            <Button type="submit" size="icon" aria-label="Research topic" title="Research topic" className="ml-3 size-10 shrink-0 rounded-full shadow-none md:size-11"><ArrowRight className="!size-5" /></Button>
          </form>
          <div className="mt-5 max-w-[790px]">
            <Button variant="ghost" onClick={() => setAdvancedOpen(!advancedOpen)} aria-expanded={advancedOpen} className="h-8 -ml-3 gap-2 px-3 text-xs font-normal text-muted-foreground hover:text-foreground">Research options <ChevronDown className={`!size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} /></Button>
            {advancedOpen && <div className="mt-4 flex flex-wrap gap-x-12 gap-y-6 border-t border-border pt-5">
              <fieldset><legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Summary length</legend><div className="flex gap-1">{(["short", "medium", "long"] as const).map((option) => <Button key={option} type="button" variant={length === option ? "secondary" : "ghost"} onClick={() => setLength(option)} className="h-8 rounded-sm px-3 text-xs capitalize shadow-none">{option}</Button>)}</div></fieldset>
              <fieldset><legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Summarizer</legend><div className="flex gap-1">{(["auto", "bart", "pegasus"] as const).map((option) => <Button key={option} type="button" variant={summarizer === option ? "secondary" : "ghost"} onClick={() => setSummarizer(option)} className="h-8 rounded-sm px-3 text-xs capitalize shadow-none">{option}</Button>)}</div></fieldset>
            </div>}
          </div>
          <div className="mt-16 max-w-[790px] border-t border-border pt-6 md:mt-20">
            {!ready || !apiUrl ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-serif text-xl text-muted-foreground">Paste your API URL to get started.</p><Button onClick={() => setSettingsOpen(true)} variant="link" className="px-0 text-primary">Connect your API <ArrowUpRight /></Button></div> : <>
              <div className="mb-4 flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Trending now</p>{trendingState === "error" && <Button variant="link" onClick={() => setTrendingRefresh((n) => n + 1)} className="h-auto p-0 text-xs text-primary">Try again</Button>}</div>
              {trendingState === "loading" ? <p className="font-serif text-lg text-muted-foreground">Looking for the latest stories…</p> : trendingState === "error" ? <p className="text-sm text-muted-foreground">Trending topics aren’t available right now. You can still search above.</p> : trends.length ? <div className="flex flex-wrap gap-2">{trends.map((trend, index) => <Button key={`${trend.topic}-${index}`} type="button" variant="outline" title={trend.sample_headline || trend.topic} onClick={() => void research(trend.topic)} className="h-auto min-h-9 max-w-full whitespace-normal rounded-full border-border bg-transparent px-4 py-2 text-left text-xs font-normal leading-snug shadow-none hover:border-primary hover:bg-accent hover:text-accent-foreground">{trend.topic} <ArrowUpRight className="ml-1 !size-3 text-primary" /></Button>)}</div> : <p className="text-sm text-muted-foreground">No trending topics yet. Try searching for a story above.</p>}
            </>}
          </div>
        </div>}

        {phase === "loading" && <section aria-live="polite" className="arrive mx-auto max-w-4xl px-6 pb-28 pt-20 md:px-10 md:pt-32">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Researching / {searchedTopic}</p>
          <h1 className="max-w-2xl font-serif text-5xl leading-[1.08] md:text-7xl">A fuller picture takes a moment.</h1>
          <div className="mt-14 max-w-xl border-t border-border">
            {stages.map((line, index) => <div key={line} className={`flex min-h-14 items-center gap-4 border-b border-border py-3 text-sm transition-colors duration-700 ${index === stage ? "text-foreground" : index < stage ? "text-muted-foreground" : "text-muted-foreground/40"}`}><span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${index === stage ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{index < stage ? <Check className="!size-3" /> : String(index + 1).padStart(2, "0")}</span><span>{line}</span>{index === stage && <span className="ml-auto size-1.5 animate-pulse rounded-full bg-primary" />}</div>)}
          </div><p className="mt-8 text-xs text-muted-foreground">This can take up to a minute while sources are read and compared.</p>
          <Button variant="ghost" onClick={goHome} className="mt-10 -ml-4 text-sm text-muted-foreground"><X className="!size-4" /> Cancel research</Button>
        </section>}

        {(phase === "empty" || phase === "error") && <section className="arrive mx-auto max-w-4xl px-6 pb-28 pt-24 md:px-10 md:pt-36"><p className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{phase === "empty" ? "Not enough coverage" : "Connection interrupted"}</p><h1 className="max-w-xl font-serif text-5xl leading-tight md:text-6xl">{phase === "empty" ? "Not quite enough to go on." : "We couldn’t finish that research."}</h1><p className="mt-6 max-w-lg leading-7 text-muted-foreground">{phase === "empty" ? `We couldn't find enough articles about “${searchedTopic}” to put together a reliable overview. Try a broader topic or a different phrase.` : errorMessage}</p><div className="mt-9 flex flex-wrap gap-3"><Button onClick={() => { setPhase("home"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-sm shadow-none">Try another topic <ArrowRight /></Button>{phase === "error" && <Button variant="outline" onClick={() => void research(searchedTopic)} className="rounded-sm shadow-none">Try again</Button>}</div></section>}

        {phase === "results" && results && <Results result={results} activeSource={activeSource} setActiveSource={setActiveSource} focusSource={focusSource} sourceRefs={sourceRefs} />}
      </main>
      <footer className="mx-auto flex max-w-7xl items-center justify-between border-t border-border px-6 py-7 text-[11px] text-muted-foreground md:px-10"><span>pulse<span className="text-primary">.</span> &nbsp; / &nbsp; News, in perspective.</span><span>Read beyond the headline.</span></footer>
    </div>
  );
}

function Results({ result, activeSource, setActiveSource, focusSource, sourceRefs }: { result: Research; activeSource: number | null; setActiveSource: (index: number | null) => void; focusSource: (index: number) => void; sourceRefs: React.MutableRefObject<(HTMLElement | null)[]> }) {
  const articles = result.articles || [];
  const summary = result.summary || [];
  function citationArticleIndex(number: number) {
    const cited = summary[number - 1];
    const found = cited?.url ? articles.findIndex((article) => article.url === cited.url) : -1;
    return found >= 0 ? found : number - 1 < articles.length ? number - 1 : -1;
  }
  const pieces = (result.paragraph || "").split(/(\[\d+\])/g);
  return <article className="arrive mx-auto max-w-4xl px-6 pb-32 pt-16 md:px-10 md:pt-24">
    <div className="mb-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.19em] text-primary"><span className="h-px w-7 bg-primary" /> The overview</div>
    <h1 className="font-serif text-5xl leading-tight md:text-7xl">{result.topic}</h1>
    <div className="mt-10 border-l-2 border-primary pl-5 md:mt-14 md:pl-8"><p className="font-serif text-[25px] leading-[1.45] md:text-[32px] md:leading-[1.45]">{pieces.map((piece, index) => {
      const match = /^\[(\d+)\]$/.exec(piece);
      if (!match) return <span key={index}>{piece}</span>;
      const number = Number(match[1]);
      const target = citationArticleIndex(number);
      return target < 0 ? <sup key={index} className="mx-0.5 text-sm text-primary">[{number}]</sup> : <sup key={index} className="mx-0.5 inline-block align-super leading-none"><Button variant="ghost" size="icon" aria-label={`Go to source ${target + 1}`} title={`Source ${target + 1}: ${articles[target]?.source || "Article"}`} onClick={() => focusSource(target)} onMouseEnter={() => setActiveSource(target)} onMouseLeave={() => setActiveSource(null)} className="h-6 w-6 rounded-full bg-accent font-sans text-[10px] font-semibold text-accent-foreground hover:bg-primary hover:text-primary-foreground">{number}</Button></sup>;
    })}</p></div>
    <p className="mt-7 text-xs text-muted-foreground">Based on {articles.length} {articles.length === 1 ? "source" : "sources"}{result.summary_mode ? ` · ${result.summary_mode} summary` : ""}</p>

    <section className="mt-20 md:mt-28" aria-labelledby="sources-heading"><SectionHeading number="01" title="Sources" detail={`${articles.length} articles`} id="sources-heading" />
      {articles.length ? <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">{articles.map((article, index) => <section key={`${article.url}-${index}`} ref={(node) => { sourceRefs.current[index] = node; }} onMouseEnter={() => setActiveSource(index)} onMouseLeave={() => setActiveSource(null)} className={`min-h-44 scroll-mt-32 bg-background p-5 transition-colors duration-300 md:p-7 ${activeSource === index ? "!bg-accent" : ""}`}><div className="mb-5 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{String(index + 1).padStart(2, "0")} <span className="mx-2 text-border">/</span> {article.source || "Unknown source"}</span>{article.published && <time className="text-[11px] text-muted-foreground">{formatDate(article.published)}</time>}</div><h3 className="font-serif text-[22px] leading-[1.2] md:text-2xl">{article.title}</h3>{safeLink(article.url) && <a href={article.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline">Read original <ArrowUpRight className="size-3.5" /></a>}</section>)}</div> : <p className="text-sm text-muted-foreground">No source articles were included in this response.</p>}
    </section>

    {!!result.key_terms?.length && <section className="mt-20 md:mt-28" aria-labelledby="terms-heading"><SectionHeading number="02" title="Key terms" id="terms-heading" /><div className="flex flex-wrap gap-2">{result.key_terms.map((term, index) => <span key={`${term.term}-${index}`} title={`${term.type} · mentioned by ${term.n_sources} ${term.n_sources === 1 ? "source" : "sources"}`} className="rounded-full border border-border px-3.5 py-2 text-xs text-foreground">{term.term}<span className="ml-2 text-muted-foreground">{term.n_sources}</span></span>)}</div></section>}

    <div className="mt-20 space-y-20 md:mt-28 md:space-y-28">
      <ComparisonSection number="03" title="Where sources agree" pairs={result.agreements || []} empty="No clear agreements identified in this coverage." />
      <ComparisonSection number="04" title="What adds context" pairs={result.complementary || []} empty="No additional context identified across sources." />
      <ComparisonSection number="05" title="Worth a closer look" pairs={result.potential_conflicts || []} empty="No notable differences identified in this coverage." distinguish />
    </div>
    <div className="mt-24 border-t border-border pt-7"><Button variant="ghost" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="-ml-4 text-xs text-muted-foreground">Back to top <ArrowDown className="!size-3 rotate-180" /></Button></div>
  </article>;
}

function SectionHeading({ number, title, detail, id }: { number: string; title: string; detail?: string; id: string }) {
  return <div className="mb-7 flex items-end justify-between gap-4 border-t border-foreground pt-5"><div><span className="text-[11px] font-semibold text-primary">{number} /</span><h2 id={id} className="mt-2 font-serif text-3xl md:text-4xl">{title}</h2></div>{detail && <span className="pb-1 text-xs text-muted-foreground">{detail}</span>}</div>;
}

function ComparisonSection({ number, title, pairs, empty, distinguish = false }: { number: string; title: string; pairs: Pair[]; empty: string; distinguish?: boolean }) {
  return <section aria-labelledby={`section-${number}`}><SectionHeading number={number} title={title} id={`section-${number}`} />{pairs.length ? <div className="space-y-4">{pairs.map((pair, index) => <div key={index} className={`border-b border-border pb-5 ${distinguish ? "border-l-2 border-l-primary pl-5" : ""}`}><div className="grid gap-5 sm:grid-cols-2 sm:gap-10"><Quote source={pair.source_a} text={pair.sentence_a} /><Quote source={pair.source_b} text={pair.sentence_b} /></div>{pair.reason && <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{pair.reason}</p>}{!!pair.shared_entities?.length && <p className="mt-4 text-[11px] text-muted-foreground">In common: {pair.shared_entities.join(", ")}</p>}</div>)}</div> : <p className="font-serif text-lg italic text-muted-foreground">{empty}</p>}</section>;
}

function Quote({ source, text }: { source: string | number; text: string }) {
  return <blockquote><p className="font-serif text-lg leading-relaxed md:text-xl">“{text}”</p><footer className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{String(source)}</footer></blockquote>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function safeLink(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}