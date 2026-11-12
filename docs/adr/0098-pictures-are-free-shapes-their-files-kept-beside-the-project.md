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

## Clarifications

<!-- Decided by Claude on 2026-11-04 under the user's standing delegation of design decisions, while building A8.1. -->

- 2026-11-04 (A8.1, pictures and GIFs): **what building the first stage decided beyond the decision above.**
  - **Only what cleaning writes leaves the program.** A file of `media/` is served, put in a read-only page or exported only when its bytes hash to its name and are exactly what cleaning writes from them (`checkMediaFile`). A file placed by hand under its own hash that the reader takes but would rewrite, such as a GIF with a comment, is refused as `media-not-clean` and drawn as a missing picture. This answers a security review. The program checks a file once a session, in the worker; the page checks each file it holds when it opens, and the command line's exports check each file they read.
  - **Pictures share the solids' worker.** Cleaning and checking run in the worker of ADR 0075, as two more kinds of its work, within its 1 GiB and 30 seconds, rather than in a worker of their own, so that the executable and its build gain nothing.
  - **A picture names only a file the program has.** The program takes a command that adds or changes a picture only when `media/<hash>.<extension>` is there as a regular file of the size its reference says (`media-file-missing` otherwise). Undo and redo replay the history and are not checked again.
  - **Codes.** A file that cannot be kept is refused as a package's image is, `invalid-image` or `image-too-large`. `media-file-missing` and `media-not-clean` are new: a file the program does not have, and one that is not what cleaning writes.
  - **The GIF reader** also decodes every frame once when it cleans, so that data that is not LZW is refused rather than drawn wrongly; it takes a file whose trailer is missing and writes one. Frames are composed as browsers do: a delay under two hundredths shows for 100 ms, disposal 2 clears to transparent, 3 restores. An SVG's own size is its view box's, rounded and scaled to fit 8,192 pixels a side.
  - **On the canvas, pictures are a layer of their own** (`canvas/pictures/layer.ts`), under the notes and arrows and above the shapes and relations, rather than tiles of the image store: their files come over the connection after the scene is built, and a GIF changes its texture as it plays. The layer keeps the store's rules: textures at the store's buckets, never past 2,048 pixels nor the picture's own size, at most one made a frame, nearest the middle of the screen first, decoded off the frame, and two files decoding at once. A GIF holds one picture of its own size and one texture, composed a frame at a time, whatever its frame count, and plays only while on screen.
  - **Notes and arrows are drawn over pictures**, so that an arrow can point at something in a photo; pointing finds them first.
  - **Adding.** A picture dropped or chosen is named after its file without the extension; a pasted one, which the browser names "image.png", is left unnamed and is "Picture". Several files dropped or chosen at once land 24 units apart. A file past 32 MiB is refused before it is sent.
  - **"Its own size"** gives a picture its file's size in pixels as canvas units.
  - **The view's inspector** shows the Pictures section with nothing selected, whenever the view shows a picture or `media/` holds a file no picture names.
  - **Exports.** The SVG writes each file once as a symbol stretched to each picture's rectangle; a GIF is its first frame as a PNG. A picture whose file the export does not have, as from Claude's `export_view`, is a gray box with its name, and the drawing says so. The command line's SVG, PDF and page read the files from the project's `media/`. The read-only page carries its files under `media`, base64 by hash; it refuses a file no picture names, and leaves out, with a warning, one that is not what cleaning writes. Its format stays 1: a viewer that does not know pictures refuses the views that hold them.
  - **Claude.** `add_picture` places a picture under what the view draws when no place is given, at its own size scaled to fit 480 units, or at the width or height given with its proportions kept. `read_view` lists `pictures` beside the free shapes, each with its name, place, size, file, format and own size.

<!-- Decided by Claude on 2026-11-12 under the user's standing delegation of design decisions, while building A8.2. -->

- 2026-11-12 (A8.2, videos): **what building the second stage decided.**
  - **A video is a picture whose file is a video.** `MediaFormat` gains `mp4` and `webm`, and `Picture` gains an optional `poster`, a `MediaRef` to a PNG, JPEG or WebP of `media/`: `{ kind: 'picture', id, x, y, width, height, media: { format: 'mp4', … }, poster?: { format: 'jpeg', … }, name? }`. A video then moves, resizes, aligns, snaps, lists in the outline and find, compares and merges, and is shown by a step (stage 4) exactly as a picture is, and the schema gains two formats and one field rather than a fourth kind of free shape. Left unnamed it is "Video". The core takes a poster only on a video, and a video's file only in `media`.
  - **Caps.** A video's file is at most 50 MiB and 8,192 pixels a side; the app refuses a larger one before sending it, and says, past 25 MiB, that the file joins the project's git history. A `MediaRef`'s `bytes` may be up to 50 MiB in the schema, and the core still holds an image's file, a poster's included, to 32 MiB. The refusals are `invalid-video` and `video-too-large`.
  - **The program reads a video strictly, and decodes none of it** (`readVideo`, `core/src/media/video.ts`). What it checks is that the browser is handed only the two containers and codecs it is meant to play; the frames themselves are the browser's to decode, muted.
    - **MP4**: the file starts with `ftyp`, whose major or compatible brands name one of `isom`, `iso2` to `iso9`, `mp41`, `mp42`, `avc1`, `dash` or `M4V `. Its boxes, of 32-bit or 64-bit sizes, tile the file and each container they are read in exactly; a size of 0 is taken only for the last box of the file. The top level holds only `ftyp`, `styp`, `moov` (exactly once), `mdat`, `moof`, `mfra`, `sidx`, `free`, `skip`, `wide`, `pdin`, `udta`, `meta` and `uuid`. In `moov`, there is exactly one track whose handler is `vide`, every one of its sample descriptions `avc1` or `avc3` with an `avcC` of version 1 (H.264), and any other track's handler is `soun`. Its own size is its track header's, 16.16, rounded, swapped for a quarter turn, or else its sample description's.
    - **WebM**: an EBML header whose DocType is `webm`, of read version at most 4, then one Segment to the end of the file (a Segment or Cluster of unknown size runs to where the next element of its level starts). The Segment holds only SeekHead, Info, Tracks (once), Cues, Clusters, Tags, Attachments, Chapters, Void and CRC-32, and a Cluster only its timestamp, positions, blocks, Void and CRC-32. Exactly one track is video, `V_VP8`, `V_VP9` or `V_AV1`, with its pixel width and height; any other is audio, `A_OPUS` or `A_VORBIS`; no track has content encodings, so nothing is encrypted or compressed apart. Its own size is its display size when given in pixels, or else its pixel size.
    - **Cleaning moves nothing.** Every `udta`, `meta` and `uuid` box of an MP4, at its top level, in `moov` and in its tracks, where phones keep a video's place and camera, is overwritten by a `free` box of the same size, zeroed; a WebM's Tags, Attachments and Chapters by a Void element of the same size. Since nothing moves, every offset a file holds still points where it did. `checkMediaFile` then holds for videos as for pictures: only what cleaning writes leaves the program.
  - **Messages.** `media/put`, `media/stored`, `media/get`, `media/piece`, `media/refused` and `media-files/*` are as they were; a `MediaRef` may name `mp4` and `webm` and up to 50 MiB, and a file comes in at most 50 pieces. The protocol's version is 12.
  - **The program** admits a command that adds or changes a picture only when its file and its poster are both in `media/`, of the size they say. A poster is a media file a picture names, so it is never listed as unnamed.
  - **The poster is made in the app**, the only place a video is decoded. When a video is dropped, pasted or chosen, the app plays its file muted in a `<video>` element from a `blob:` address, draws its first frame on a canvas at its own size, scaled to at most 2,048 pixels a side, and sends it as a JPEG, which the program cleans as any picture. When the browser cannot decode the video, it is added without a poster, and the app says so. A video without a poster, as Claude adds one, is drawn as a dark box with a play mark and its name; its inspector offers "Make its poster", which makes one from its first frame the same way, as one undoable change.
  - **Playing.** A click on a video, a press and release without a drag, selects it and plays it, muted and in a loop; another click stops it and shows its poster again. The inspector's Play and Stop do the same from the keyboard. It plays from a `blob:` address of its file, fetched with `media/get` the first time it plays, and its texture is updated each frame while it plays; at most 4 play at once, the one started first stopping. Reduced motion does not stop a video the person started. The canvas's `setPlaying` is the hook a step uses in stage 4.
  - **Policies.** The app's and the page's content security policies gain `media-src blob:`, and nothing else.
  - **Exports.** The SVG, the PDF and the PNG draw a video's poster with a play mark, a dark disc with a white triangle, in its middle; one without a poster as the canvas draws it. Mermaid and Structurizr leave videos out with pictures, and say so.
  - **The read-only page** holds every poster, and a video's file when it is at most 32 MiB, the most the page holds of one media file. A video whose file it holds plays when clicked, as on the canvas; a larger one shows its poster without a play mark, and the export says so.
  - **Claude.** `add_video` takes the path of an `.mp4` or `.webm` file inside the project folder, as `add_picture` takes an image's, and places it the same way, without a poster since the program decodes no video; its answer says that the person can make one from the inspector. `add_picture` refuses a video, naming `add_video`. `read_view` lists videos among pictures, with `video: true` and their poster's file. `update_free_shape` and `delete_free_shapes` take videos as pictures.
