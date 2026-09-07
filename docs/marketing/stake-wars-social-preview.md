# Stake Wars social preview

The site-wide Open Graph and X large-image card metadata is in `apps/web/index.html`. It is present in the initial HTML so link crawlers do not need to run React.

- Image: `apps/web/public/og/stake-wars-v1.png`
- Dimensions: 1200 × 630 pixels
- Intended public URL after frontend deployment: https://stakewars.gg/og/stake-wars-v1.png
- Site: https://stakewars.gg/
- X account: `@stake_wars` (from the existing site footer)

The asset and metadata are prepared locally. They require a frontend deployment to become available on the public domain. After deployment, verify the public HTML and image with a Twitterbot user agent, then check an actual X composer preview. X controls rendering and caching. Use a new versioned image filename for future artwork replacements.

## Suggested ad copy

> Capture sectors. Challenge rivals. Put your art on the Core. Discover Stake Wars, a territory-control game powered by STRK staking on Starknet.

For a paid Website Card, set its destination to https://stakewars.gg/ and its headline to “Stake Wars”. Keep the destination URL out of the ad text. This is draft copy, not a guarantee of ad eligibility. Country and product approval must be resolved separately, including the staking and random token jackpot mechanics.

Policies reviewed on 2026-09-07: [X quality policy](https://business.x.com/en/help/ads-policies/ads-content-policies/quality-policy), [financial products and blockchain games](https://business.x.com/en/help/ads-policies/ads-content-policies/financial-services), [gambling content](https://business.x.com/en/help/ads-policies/ads-content-policies/gambling-content), [creative specifications](https://business.x.com/en/help/campaign-setup/creative-ad-specifications), and [Boosted Terms](https://help.x.com/en/using-x/boosted-terms).

## Image generation record

Created with the built-in imagegen tool using the screenshot supplied by the user as the edit target. The generated 1730 × 909 PNG was resized with macOS `sips` to 1200 × 630 for delivery. The scene was reframed by the image model; this is a branded creative derived from the screenshot.

Initial generation prompt (v1):

```text
Use case: compositing
Asset type: Open Graph and X large-image website link preview for stakewars.gg.
Input image 1 is the edit target: the supplied Stake Wars in-game space screenshot.
Primary request: Overlay the exact words "Stake Wars" on this image, and adapt its framing to a landscape 1200x630 social preview (approximately 1.91:1). Produce one finished image.
Scene invariants: Keep the original black starfield, sparse white stars, coral-rimmed navy Starknet emblem, fine wireframe globe with its existing decals, and orbital paths recognizable. Preserve the existing artwork and its visual style; do not invent additional objects or logos.
Composition: Use the natural open upper-left starfield for a very large, readable two-line title: "Stake" above "Wars", left aligned, bright white, bold clean geometric sans serif, comparable to Inter Black, with tight spacing. All title letters must remain comfortably within a 7% safe margin and be readable at phone preview size. Reframe the existing screenshot into the wide format, retaining the colorful emblem in the lower central area and the wireframe globe on the right, without distorting either. Keep the screenshot's spare, black, retro-futurist mood.
Text (verbatim): "Stake Wars"
Constraints: Only that title is added. No extra slogan, URL, buttons, financial claims, badges, footer, watermark, decorative frame, gradients, or glow. This should feel like a restrained branded screenshot, not newly illustrated artwork. Output target 1200x630.
```

## Smaller single-line title (v2)

The user requested a smaller title on one line. The built-in imagegen tool edited v1 to place “Stake Wars” on one line in the upper-left starfield. This alternative was resized to 1200 × 630 for delivery. The user subsequently chose the larger two-line title, so both card image URLs reference v1. The smaller v2 is retained for comparison.

Exact revision prompt:

```text
Use case: precise-object-edit
Asset type: 1200x630 Open Graph image for Stake Wars.
Input image 1 is the edit target: the current finished Stake Wars social preview.
Primary request: Change only the title typography. Replace the large two-line "Stake" / "Wars" title with the exact text "Stake Wars" on ONE horizontal line, much smaller, in the upper-left starfield.
Typography: retain bold white clean sans serif, but reduce the letters to about 56 pixels high on this 1200x630 canvas. The complete single-line title should occupy roughly 350 pixels in width, with its left edge near x=65 and its top near y=70. Use title case exactly: "Stake Wars". Keep ample negative space below and around this smaller title. No wrapping.
Invariants: Keep the 1200x630 wide framing, original black starfield, all existing stars outside the old title, the coral-rimmed navy Starknet emblem in the lower center, wireframe Core globe on the right, all their existing decals, orbit paths and other objects in exactly the same positions and sizes. Do not reframe, move, enlarge or repaint the artwork. Restore black starfield where the old large title is removed.
Constraints: Only title text changes. No additional copy, URL, slogan, badges, gradients, glow, border, logos or watermark. Output one finished 1200x630 image.
```
