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

- Page copy/markup comes from the user's uploaded PowerSite design, stored as HTML string fragments in src/content/fragments.ts; theme overrides live in src/content/powersite-theme.css (high-specificity selectors so they beat the inline base CSS). Why: keeps the user's exact copy while letting us restyle.
- Shared nav/footer/scroll-reveal live in src/components/Site.tsx; each page route wraps its content in <Site>.
