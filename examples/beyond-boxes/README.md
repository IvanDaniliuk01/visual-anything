# The heart: a sample beyond boxes

Shapes that are not boxes (M8b): a heart drawn with its named parts, lungs drawn as free geometry, lines drawn curved, and the blood played through it all step by step. Open it as any project folder:

```sh
pnpm exec tsx packages/server/src/cli.ts examples/beyond-boxes
```

It is not one of the samples a new project starts from (ADR 0051): it shows features rather than a starter package, and brings a package of its own, `heart`.

## What it shows

- **A drawing with parts** (ADR 0067). The component Heart shows its picture With its parts. Its fourteen named parts are the four chambers, the septum, the four valves and the main vessels (venae cavae, pulmonary artery and veins, aorta); the element of the same name inside the Heart is anchored to each, by its own appearance's `part`. The muscle around them has no id, so it is drawn but is no part.
- **A content no part draws.** The sinoatrial node sits inside the heart below the picture, and paces the right atrium.
- **Parts drawn on their own.** The Circulation view nests nothing, so every chamber, valve and vessel there is drawn on its own, with its part's outline and picture, along the two circuits of the blood. The septum names its part without the image, so it is anchored only inside a drawing of a heart.
- **Free geometry** (ADR 0066). The component Lungs is drawn by its own outline: both lungs and the windpipe as curved path data, which keeps its proportions and writes its name in a label area. A point between the lungs falls through to what lies behind.
- **Route styles** (ADR 0069). The Heart view draws its automatic lines curved (`routeStyle: "curved"`); the Circulation view keeps them orthogonal. The relation type "paces" draws its lines straight in both (`route: "straight"`).
- **A scenario**, "Blood through the heart", over the Heart view: from the venae cavae through the right side, the lungs and the left side to the aorta, with the blood's oxygen, volumes and pressures as data in and out.

## A card imported from HTML

`sources/card.html` is a card of the heart's figures at rest, in static HTML with inline styles from ADR 0068's allow-list. It is imported as a drawing, shown in the Heart view by the element "The heart at rest", of the component Card: the package stores the drawing the local program made of it, cleaned as every picture is. To make it again after changing the card, import it again, from Import… in the app, or from the repository with `pnpm exec tsx packages/server/src/cli.ts import examples/beyond-boxes examples/beyond-boxes/sources/card.html --component heart.card --view heart --width 360`, then give its new picture the heart's credits.

## Its sources

`sources/heart.svg` is the picture before cleaning, with comments. The package stores it as the core's cleaner writes it, and the sample's test (`packages/server/src/beyond-boxes-sample.test.ts`) fails while the two differ: after changing the drawing, store it again by replacing the image with it in the app, or with Claude's `replace_image`, both of which clean it.

## Credits

The heart was drawn for Visual Anything, and everything in this sample is CC0-1.0, credited to the Visual Anything contributors (ADR 0047), as the package and its image record.
