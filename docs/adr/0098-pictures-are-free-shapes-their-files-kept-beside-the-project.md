---
status: accepted
---

<!-- Asked by the user on 2026-11-04: an image loose on the canvas, "como una nota", then animated GIFs and videos, then a link's preview "por ejemplo poder ver un video de youtube que se referencia como un link o una página web". They agreed to the plan Claude proposed that day: pictures and GIFs first, then videos within a cap, then link cards whose preview the program fetches once on request, then showing them in scenario and tour steps; a live embed of another site is refused. Decided by Claude under the user's standing delegation of design decisions. -->

# Pictures are free shapes, their files kept beside the project

Images are package data today (ADR 0027): small bitmaps and SVGs that an appearance shows on an element's shape. Someone explaining a system often wants a photo, a screenshot or an animated GIF next to it, as drawing only, the way a note sits on the canvas. The spec listed "large photos kept as files; images as free shapes" as Later. ADR 0027 named files beside the project as the way to keep large pictures, and ADR 0075 took that way for solids.

## Decision

### A picture is a free shape that shows a media file

- **`Picture`** is a third kind of free shape, beside the note and the arrow:

  ```ts
  { kind: 'picture', id, x, y, width, height, media: MediaRef, name?: string }
  ```

  - `x`, `y`, `width` and `height` take the same bounds as a note's.
  - `name`, at most 200 characters, is what screen readers and the outline say, and what a missing file shows. Left out, it is "Picture".
  - It belongs to the view, as notes do. It is never part of the model.
- **`MediaRef`** says which file it shows and what it is, so that the scene can place it and an export can name it before the file is read:

  ```ts
  { hash: string /* sha256, 64 lowercase hex */, format: 'png' | 'jpeg' | 'webp' | 'gif' | 'svg', width: number, height: number, bytes: number }
  ```

  - `width` and `height` are the picture's own size in pixels, and `bytes` is the size of the cleaned file.
  - Later stages add `mp4` and `webm`.
- **The file is `media/<hash>.<extension>` beside the project**: `.png`, `.jpg`, `.webp`, `.gif` or `.svg`.
  - It is cleaned by the program, written once and atomically, and never changed.
  - It is named by its content, so the same picture used twice is one file, and a git merge never conflicts on it.
  - Like a solid (ADR 0075), it is not JSON and nothing in it runs. CLAUDE.md's rule on project files gains this second kind.

### What enters is cleaned and capped

- **Bitmaps:**
  - PNG, JPEG and WebP go through the core's own bitmap reader (`readBitmap`), which keeps only what draws.
  - The caps are 32 MiB in, 32 MiB cleaned, 8,192 pixels on a side and 40 megapixels.
  - Unlike a package's image, a picture keeps its size: it is not shrunk to 192 KiB.
- **GIF:**
  - A strict reader walks its blocks. It keeps the frames, their delays and how often it loops, and drops comments and every application extension but the loop count.
  - The caps are the bitmaps' on the file and on a side, at most 1,000 frames, and at most 400 megapixels across all frames.
- **SVG:**
  - It is cleaned by `cleanSvg` (ADR 0027) within its caps.
  - Its own size is its view box's, rounded.
- **Anything else is refused**, with what the program takes, and so is a file past its caps. An image the reader cannot read is refused as it would be in a package.

### How a file travels

- **The app sends a file in pieces**, as solids travel (ADR 0075):
  - `media/put`: `{ requestId, fileName, piece: { index, count, data } }`, at most 1 MiB of bytes per piece, in base64.
  - The program reads every message strictly, cleans the file in a worker, writes it to `media/` atomically, and answers `media/stored` with the `MediaRef`, or `media/refused` with why.
  - A file is written before any shape names it, so a picture never names a file the program has not kept.
- **The app fetches a file back** with `media/get { requestId, hash }`, answered by `media/piece` messages, or by `media/refused` when the file is missing or no longer passes its reader.
  - The program reads it with `readRegularFile` within its cap.
  - It checks the hash the first time it serves the file in a session.
- **Files no picture names**, in any view, are listed and removed the way unnamed solids are: `media-files/list` and `media-files/remove`, in the view's inspector under Pictures, and never on their own.
- **Undo never deletes a file.** A command carries only the `MediaRef`, never the bytes, so a picture weighs no more in the history than a note.

### On the canvas

- **Adding one:**
  - Drop an image file on the canvas: it is placed where it is dropped.
  - Paste an image from the clipboard with Ctrl+V: it is placed at the middle of the view.
  - Or press Picture… on the canvas toolbar, beside Note, and choose a file.
- **Its size when added:** its own size, scaled down so that neither side exceeds 480 units, and up so that neither is under 32.
- **Drawn** by the canvas's image store (`canvas/images.ts`), within its frame budget.
  - Its texture is no larger than it shows on screen, rounded up to the store's buckets, and never larger than 2,048 pixels on a side.
  - A GIF plays while it is on screen, from its frames and delays. Under reduced motion (ADR 0077) it shows its first frame and plays while the pointer is on it.
  - A file that is missing, or that no longer passes its reader, is drawn as a gray box with its name and a warning, never as an error.
- **Moved, resized, aligned and deleted** like a note.
  - Resizing keeps its proportions; Shift frees them.
  - The inspector names it, edits its name, and offers "Its own size".
- **Picked** above the anchored shapes, as free shapes are.

### Exports, versions and Claude

- **SVG and PDF:** the file is written once, as an `<image>` with a `data:` address, or for an SVG inlined as its cleaned markup, as package images are (`image-symbols.ts`). A GIF shows its first frame, and the PDF reports pictures it cannot write, as it does for WebP.
- **PNG:** the renderer draws it, a GIF at its first frame.
- **The read-only page** carries every file its views' pictures name, in base64, and draws them with the same store, GIFs playing. Past `LARGE_PAGE` it warns before writing, as it does for solids.
- **Mermaid and Structurizr** leave pictures out, and say so (`beyond-lost.ts`).
- **Versions** compare and merge pictures by id, as they do notes (`versions/items.ts`, `merge.ts`).
- **Claude:**
  - `read_view` lists a view's pictures, with their names and sizes.
  - `add_picture` takes the path of an image file inside the project folder, as `import_solid` does, and places it.
  - `update_free_shape` and `delete_free_shapes` take pictures, as they take notes.

### The stages after this one

Each stage gets a clarification of this ADR when it starts, and the spec's milestone A8 lists them.

1. **Videos**:
   - MP4 (H.264) and WebM, in `media/` within 50 MiB, with a warning past 25 MiB, since the file joins the project's git history.
   - A video shows its first frame, kept as a poster when it is added. It plays muted and in a loop when clicked, or when a step asks it to.
   - The app's and the page's policies gain `media-src blob:`.
2. **Link cards**:
   - A free shape that holds a web address, a title, a description and an optional picture.
   - Pressing "Fetch the preview" makes the program read that address once, over HTTPS only, within a size and time cap. It keeps the page's title, description and preview image (`og:` tags), as a picture in `media/`. It runs nothing and keeps no cookie.
   - This is the only time the program reaches the internet, and only when the person presses it. Without it, the person writes the title and adds a picture.
   - A click opens the address in the browser. No other site is ever embedded in the app or the page (ADR 0041, ADR 0042).
3. **Steps that show them**: a scenario or tour step lists the pictures, videos and link cards it shows. The others of its view stay hidden while the scenario or tour plays.

## Considered options

- **Pictures as package images.** Rejected: an image there is shrunk to 192 KiB, never animated, and belongs to a component's look rather than to one view's drawing.
- **The bytes inside the view file.** Rejected: an 8 MiB photo would make the view file, every command and the undo history carry it, past the live connection's 5 MiB.
- **A live embed of a web page or a YouTube player.** Rejected: it would run another site's code in the app, connect the read-only page to the internet, and show nothing offline.

## Consequences

- `FreeShape` gains `Picture`, and the protocol's version goes up when the first stage lands. CONTEXT.md gains "Picture" and "Media file", and its "Free shape" entry names pictures.
- CLAUDE.md's rule on project files names `media/` beside `solids/`.
- The spec's "Large photos kept as files; images as free shapes" leaves Later for milestone A8.
