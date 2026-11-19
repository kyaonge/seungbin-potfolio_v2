# Portfolio intro

Upload `index.html` and the complete `assets/` directory (`assets/css/`, `assets/img/`, `assets/intro/`) alongside the existing portfolio assets. All styles live in one file, `assets/css/portfolio.css`; `assets/img/` holds the web-sized copies of the large photos and banners. The original `opneing.mp4` (216 MB) is not required for deployment. The browser plays `opening-web.mp4` (about 19 MB, 720p, H.264/AAC, faststart).

Edit the `config` object at the top of `intro.js` to replace the video or external Drive link. Update the title, poster and existing portfolio links in `index.html` when changing the project itself. The highlight-jump button has been removed.

Autoplay is muted to meet browser restrictions. Clicking the video (or Enter/Space while focused) toggles sound. The background-free sound icons share the actual media state; there is no notification toast. A play button appears if autoplay is blocked. Video completion opens the profile; the next button opens capabilities and then the original portfolio. Escape opens the original portfolio. Reduced-motion preferences disable slide animation.

Section 4 ("레이아웃 보정") of `assets/css/portfolio.css` arranges the intro for desktop stages (1000px wide and 650px high or larger), with accessible vertical scrolling on smaller or zoomed screens. All five tool categories and twelve app icons stay visible; diagram selection only highlights a category. Company responsibilities use plain text without numbered chips. Career history uses equal-width, stretched columns with reset timeline indentation. `experience.js` supplies shared evidence-driven skill navigation, itemized career rows and native scroll-snap folder carousels. The hexagon represents six navigation categories, not proficiency scores. Evidence links select the matching career tab and navigate to the original work. No content or contribution figures are removed.

## Asset sources

- LobeHub icons-static-svg 1.104.0: Kling, OpenAI, Midjourney, Suno, ElevenLabs, Claude; ByteDance parent-company mark for Seedance.
- Simple Icons 13.21.0: Adobe and Blender marks.
- CapCut site favicon via Google favicon cache.
- Lucide static 0.468.0: interface icons (ISC license).
- Company logos and project images: existing portfolio assets.

Tool versions follow the portfolio owner's supplied labels. The After Effects example uses "Claude 연계 스크립팅"; only label it MCP when the actual production workflow used an MCP server.
