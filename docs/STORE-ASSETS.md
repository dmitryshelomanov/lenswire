# Store assets map — Lenswire

## Inputs

Raw device captures + icon:

- [`docs/store-screenshots/src/`](store-screenshots/src/) — `main.png`, `host.png`, `request.png`, `response.png`, `settings.png`, `icon.png`

## Outputs

```bash
npm run screenshots:store   # 1290×2796 marketing frames + website JPGs
npm run screenshots:play    # Play graphic + Android 1080×1920 framed set
```

| Path | Use |
|------|-----|
| `store-screenshots/01-cover.png` … `06-overrides.png` | App Store / marketing (1290×2796) |
| `store-screenshots/android/framed-*.png` | Play phone screenshots (1080×1920) |
| `play-store/feature-graphic.png` | Play feature graphic 1024×500 |
| `play-store/icon-512.png` | Play listing icon |
| `docs/images/screenshot-1.png`, `screenshot-2.png` | README |
| `website/public/screenshots/*.jpg` | Landing page |
| `website/public/og.png` | Open Graph |

iOS App Store Connect docs (`docs/app-store/`) are **not** written yet — only the iPhone screenshot set above is ready.

Android upload steps: [`play-store/PLAY-CONSOLE.md`](play-store/PLAY-CONSOLE.md).
Listing copy: [`play-store/LISTING.md`](play-store/LISTING.md).
Data safety: [`play-store/DATA-SAFETY.md`](play-store/DATA-SAFETY.md).

Do not commit huge raw screen recordings into `src/` beyond the five UI shots.
