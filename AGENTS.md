<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Pulse architecture
- Call the user-configured FastAPI tunnel directly from the browser and keep its URL in localStorage, because the tunnel changes per session and should not become a server-side arbitrary-URL proxy.
- Keep search, loading, and research results in the home route as one flow, because Pulse is a single-page research tool.
- Store the selected appearance locally and apply the dark class on the document element, because portaled settings and all semantic tokens must share the same theme.
