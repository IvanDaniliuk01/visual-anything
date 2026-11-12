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
    - **MP4**: the file starts with `ftyp`, whose major or compatible brands name one of `isom`, `iso2` to `iso9`, `mp41`, `mp42`, `avc1`, `dash` or `M4V `. Its boxes, of 32-bit or 64-bit sizes, tile the file and each container they are read in exactly; a size of 0 is taken only for the last box of the file. The top level holds only `ftyp`, `moov` (exactly once), `mdat`, `free`, `skip`, `wide`, `udta`, `meta` and `uuid`. A fragmented MP4, with `moof`, `mfra`, `sidx`, `styp` or `mvex`, is refused, since its fragments would be boxes cleaning does not read; a live recording is taken as WebM. A data reference to anything but the file itself is refused. In `moov`, there is exactly one track whose handler is `vide`, every one of its sample descriptions `avc1` or `avc3` with an `avcC` of version 1 (H.264), and any other track's handler is `soun`, its descriptions AAC (`mp4a`) or Opus of version 0. Its own size is its track header's, 16.16, rounded, swapped for a quarter turn, or else its sample description's.
    - **WebM**: an EBML header whose DocType is `webm`, of read version at most 4, then one Segment to the end of the file (a Segment or Cluster of unknown size runs to where the next element of its level starts). The Segment holds only SeekHead, Info, Tracks (once), Cues, Clusters, Tags, Attachments, Chapters, Void and CRC-32, and a Cluster only its timestamp, positions, blocks, Void and CRC-32. Exactly one track is video, `V_VP8`, `V_VP9` or `V_AV1`, with its pixel width and height; any other is audio, `A_OPUS` or `A_VORBIS`; no track has content encodings, so nothing is encrypted or compressed apart. Its own size is its display size when given in pixels, or else its pixel size.
    - **Cleaning keeps only what a player needs, and moves nothing**, so that a video leaves nothing that names a person, a place, a device or a time, as a picture's cleaning leaves nothing of its EXIF. This answers a security review of the first build, which kept what lay in boxes and elements it did not read.
      - In an MP4, every box of `moov`, at any depth, sample descriptions included, is kept only when it is on a list of what a player needs (`mvhd`, `trak`, `tkhd`, `mdia`, `edts`, `elst`, `tref`, `mdhd`, `hdlr`, `minf`, `vmhd`, `smhd`, `dinf`, `dref`, `stbl` and its sample tables, and in a sample description `avcC`, `btrt`, `pasp`, `colr`, `clap`, `esds` and `dOps`). Every other box, `udta`, `meta` and `uuid` where phones keep a video's place and camera among them, is overwritten by a `free` box of the same size, zeroed, and so are those at the top level. The creation and modification times of `mvhd`, `tkhd` and `mdhd`, the handlers' names, the compressor's name and an audio description's vendor are zeroed, and so is whatever `free`, `skip` and `wide` boxes hold.
      - In a WebM, Info keeps only its timestamp scale and duration; a track only its number, uid, type, flags, default duration, codec, codec data, delays, language and its video's or audio's numbers; Cues only their times and positions; a BlockGroup only its block, duration, references and discard padding. Every other element, at any depth, is overwritten by a Void element of the same size: its title, date, muxing and writing programs, segment id, track names, block additions, checksums, and, at the Segment's level, its seek head, tags, attachments and chapters.
      - Since nothing moves, every offset a file holds still points where it did, and `checkMediaFile` holds for videos as for pictures: only what cleaning writes leaves the program; cleaning a cleaned file changes nothing.
      - The frames themselves, in `mdat` or a WebM's blocks, are not read: what an encoder writes in its own bitstream, such as H.264's unregistered user data or AV1's metadata units, is kept. Reading it would mean parsing each codec's bitstream, which the program does not do; the person's own camera or recorder is what writes it.
  - **Messages.** `media/put`, `media/stored`, `media/get`, `media/piece`, `media/refused` and `media-files/*` are as they were; a `MediaRef` may name `mp4` and `webm` and up to 50 MiB, and a file comes in at most 50 pieces. The protocol's version is 12.
  - **The program** admits a command that adds or changes a picture only when its file and its poster are both in `media/`, of the size they say. A poster is a media file a picture names, so it is never listed as unnamed.
  - **The poster is made in the app**, the only place a video is decoded. When a video is dropped, pasted or chosen, the app plays its file muted in a `<video>` element from a `blob:` address, draws its first frame on a canvas at its own size, scaled to at most 2,048 pixels a side, and sends it as a JPEG, which the program cleans as any picture. When the browser cannot decode the video, it is added without a poster, and the app says so. A video without a poster, as Claude adds one, is drawn as a dark box with a play mark and its name; its inspector offers "Make its poster", which makes one from its first frame the same way, as one undoable change.
  - **Playing.** A click on a video, a press and release without a drag, selects it and plays it, muted and in a loop; another click stops it and shows its poster again. The inspector's Play and Stop do the same from the keyboard. It plays from a `blob:` address of its file, fetched with `media/get` the first time it plays, and its texture is updated each frame while it plays; at most 4 play at once, the one started first stopping. Reduced motion does not stop a video the person started. The canvas's `setPlaying` is the hook a step uses in stage 4.
  - **Policies.** The app's and the page's content security policies gain `media-src blob:`, and nothing else.
  - **Exports.** The SVG and the PDF draw a video's poster with a play mark, a dark disc with a white triangle, in its middle (`playMark`), and one without a poster as the canvas draws it, a dark box with its name; neither reads the video's own file. The PNG draws what the canvas shows: a poster with its mark, or a video that plays at the frame it shows. Mermaid and Structurizr leave videos out with pictures, and say so.
  - **The read-only page** holds every poster, and a video's file when it is at most 32 MiB, the most the page holds of one media file. A video whose file it holds plays when clicked, as on the canvas; a larger one shows its poster without a play mark, and the export says so.
  - **Claude.** `add_video` takes the path of an `.mp4` or `.webm` file inside the project folder, as `add_picture` takes an image's, and places it the same way, without a poster since the program decodes no video; its answer says that the person can make one from the inspector. `add_picture` refuses a video, naming `add_video`. `read_view` lists videos among pictures, with `video: true` and their poster's file. `update_free_shape` and `delete_free_shapes` take videos as pictures.

<!-- Decided by Claude on 2026-11-12 under the user's standing delegation of design decisions, while building A8.3. -->

- 2026-11-12 (A8.3, link cards): **what building the third stage decided.**
  - **A link card is a fourth kind of free shape**, since unlike a video it holds text and an address rather than one file: `{ kind: 'link', id, x, y, width, height, url, title, description?, picture?: MediaRef }`.
    - `url` is an absolute `https:` or `http:` address of at most 2,048 characters, with a host and with no user name or password, kept as the web's address reader writes it (`checkLinkAddress`, `core/src/links/`). Any other scheme, `javascript:`, `data:` and `file:` among them, is refused. An `http:` address may be kept, for a page of the person's own network, and opened; only an `https:` one is fetched.
    - `title`, one line of 1 to 300 characters, is what the card shows first and what screen readers, the outline and find say. `description` is at most 1,000 characters.
    - `picture` names a media file of `media/` as a picture does, but only an image, PNG, JPEG, WebP, GIF or SVG, never a video. A GIF on a card plays as a picture does.
    - It belongs to the view as notes do, and is never part of the model. It moves, resizes freely, keeping no proportions, aligns, snaps, lists in the outline and find, compares and merges by id, and is deleted and undone as any free shape. A command that adds or changes one with a picture is admitted only when that file is in `media/`, as for pictures, and its picture is a media file a free shape names, never listed as unnamed.
  - **Its drawing** comes from its data alone, alike on the canvas, in the SVG and the PDF (`cardLayout`, `canvas/links/card.ts`): a card in the theme's card colors; its picture, when it has one, in a band across its top, whole and centered, at most as tall as the card leaves after 72 units for its text; then its title in bold, at most two lines; its description, at most three; and on its last line the address's host, in the link color, which is where a click opens it. A card added without a picture is 320 by 112 units; a picture given to a card that has none makes it taller by the picture's height at the card's width, at most 240 units.
  - **Adding one.** Link card… on the canvas toolbar asks for an address and adds a card at the middle of the view, titled after the address's host; pasting text that is exactly one `http:` or `https:` address on the canvas does the same. Its inspector edits its address, title and description, adds a picture from a file or removes it, and offers Fetch the preview and Open the address.
  - **Opening it.** On the canvas, a click on a card's last line, its address, opens it, and so does the inspector's Open the address; a click elsewhere on it selects it, and Ctrl, ⌘ or Shift and a click add it to the selection, as for any shape, opening nothing. The pointer over its last line shows the address. In the read-only page, where nothing is edited, a click anywhere on a card opens it, and its details hold its description and a link to it. It always opens in a new tab, `noopener` and `noreferrer`, after its address is checked again; nothing of another site is embedded, framed or loaded in the app or the page. Following an address the reader clicks is their browser's navigation, not a connection of the page, which still connects nowhere (ADR 0041).
  - **Fetching the preview** (`link/fetch { requestId, url }`), sent only when the person presses Fetch the preview in the card's inspector:
    - **Only `https:`, to a public address.** The program resolves the name, and every address it resolves to must be public, as `live-fetch.ts` checks for package code; an address written as itself must be public too, since no one granted it on purpose. The connection goes to the address checked and no other (`pinnedLookup`), so that a name cannot lead elsewhere between the check and the connection.
    - **Redirects:** at most 3 are followed, each new address checked from scratch as the first was; one to `http:` or to an address that is not public is refused.
    - **A GET with nothing of the person's:** no cookie, no credential, no referrer, `Set-Cookie` ignored, a connection of its own kept for nothing else, and `accept-encoding: identity`, so that nothing is inflated. It waits at most 10 seconds for the page, its name's resolution and redirects included, and reads at most 512 KiB of it: past that it stops and reads what came. The answer must be a 200 of `text/html` or `application/xhtml+xml`.
    - **The HTML is read, never run** (`readLinkPreview`, in the core): one pass over the text, in time that grows linearly with it, reading only `<title>` and the `content` of `<meta>` elements by their `property` or `name`, and stopping at `</head>` or `<body>`. Comments, and what `<script>`, `<style>`, `<template>`, `<noscript>`, `<textarea>`, `<svg>` and `<math>` hold, are skipped. No DOM is built, nothing is fetched or followed, and no DTD or entity is read: only HTML's character references, numeric ones and a short list of named ones. Its title is `og:title`, else `twitter:title`, else `<title>`; its description `og:description`, else `twitter:description`, else `description`; its image `og:image:secure_url`, else `og:image:url`, else `og:image`, else `twitter:image`, resolved against the page's last address. Text becomes one line without control characters, cut to 300 and 1,000 characters. The page's charset is its `Content-Type`'s, else a `<meta charset>` in its first 1,024 bytes, else UTF-8.
    - **Its image** is fetched the same way, `https:` only, within 10 more seconds and 8 MiB, of type PNG, JPEG, WebP or GIF (an SVG is not fetched), then cleaned in the worker and written to `media/` as any picture's file. An image that cannot be had is left out and the answer says why; the title and description still come.
    - **The answer** is `link/fetched { requestId, preview: { title?, description?, picture? }, notes }`, or `link/refused { requestId, code, message }`, `link-refused` for an address that may not be fetched and `link-failed` for one that failed. At most 2 fetches are under way at once.
    - **What changes.** The program changes no project file but writing the image's media file. The app sets what the preview found as one undoable change, "Fetch the preview of a link card": the title and description replace the card's, and its picture is set, the card growing to show it when it had none. The address stays as written, not the one redirects led to.
  - **The program reaches the internet only there**, and only when the person presses the button. Claude has no tool that fetches: `add_link_card` takes an address, a title and an optional description, place, size and picture, the path of an image file inside the project folder as `add_picture` takes one, and its answer says that the person can fetch the preview from the card's inspector. `read_view` lists `links` beside the pictures, with their address, title, description, place, size and picture's file. `update_free_shape` and `delete_free_shapes` take them.
  - **Exports and the page.** The SVG wraps each card in `<a href="…" target="_blank" rel="noopener noreferrer">`, and the PDF, drawn from that SVG, holds it as a link over the card; neither fetches anything. The PNG draws what the canvas shows. The read-only page holds each card's picture file as it holds pictures'. Mermaid and Structurizr leave link cards out, and say so.
  - **Codes and messages.** `link-refused` and `link-failed` are new; so are `link/fetch`, `link/fetched` and `link/refused`. The protocol's version is 13.
  - **Its name in Spanish** is "tarjeta web", since "enlace" and "vínculo" are what the catalog never calls anything, a relation included.
  - **A8.2's leftovers, done here.** Resizing a video is labeled "Resize a video" in the history; the video reader's refusals, which reach the person when a video is dropped, pasted or chosen, read in Spanish, and the core-messages test reads each of them from files its fixtures cut and break.

<!-- Decided by Claude on 2026-11-12 under the user's standing delegation of design decisions, while building A8.4. -->

- 2026-11-12 (A8.4, steps that show them): **what building the fourth stage decided.**
  - **Two lists on a step.** A scenario's `Step` and a `TourStep` gain the same two optional fields, rather than one list of objects with a flag, so that the file and Claude's tools read as plain lists of ids:
    - `shows?: Id[]`: the pictures, videos and link cards of the step's view it shows, 1 to 500 ids, each once. A free shape of kind `picture`, a video included, or `link` of the scenario's view, or of the tour step's view state's view. Notes and arrows are never listed: they always show.
    - `playing?: Id[]`: the videos among `shows` that play while the step shows, 1 to 4 ids, each once, as at most four videos play at once. A video not in `shows` is refused, and so is a picture or a link card.
    - Example: `{ "id": "hold-slot", "description": "The agent holds a slot.", "relations": ["agent-to-api"], "shows": ["calendar-photo", "booking-video"], "playing": ["booking-video"] }`.
  - **What "hidden" means.** A scenario or a tour *chooses its pictures* when one of its steps at least lists `shows`. While it plays, the pictures, videos and link cards of the view that its current step does not list are hidden as a filter hides: not drawn, not picked, and drawn again when the step leaves. A step without `shows` in such a scenario or tour shows none of them. A scenario or tour none of whose steps lists any shows them all, as before this stage, so existing projects are unchanged.
    - A scenario plays while it is open on a step, in the app's scenario panel or on the read-only page, over its view drawn in the active pane; an aggregated step shows what any of the steps it stands for shows. A tour plays while it is played, full screen or on the page.
    - While a tour's step plays a scenario, the tour decides when it chooses its pictures; when it does not, the scenario's current step decides, as when it plays on its own.
    - The hiding is an emphasis of its own (`step-pictures`), so that it joins the filters', the tour's and the scenario's as they join each other, and nothing of the project changes: playing still changes no file.
  - **Videos.** The videos of the current step's `playing` start muted and in a loop when the step shows, and stop when it leaves, through the canvas's `setPlaying`: a step's videos only, so that a video the person clicked keeps playing until it is hidden or clicked again. A video asked for before its view's scene is drawn plays once it is. Under reduced motion (ADR 0077) a step starts none: its videos show their posters, and a click plays one, as the person's own choice.
  - **A deleted free shape stays named.** A step keeps every id its `shows` and `playing` name after that free shape is deleted, as a broken step keeps a relation: the step is never deleted and never changed by the deletion; it plays without what is gone.
    - The commands take a step that names what its view does not hold only when its two lists are kept exactly as they were; a new or changed list must name pictures, videos and link cards of the view (`unknown-free-shape`), and `playing` videos among `shows` (`invalid-command`).
    - Deleting free shapes previews, in the delete dialog, the scenario steps that show one of them, apart from the broken steps since they stay whole (`showingSteps` of the delete preview), and the tour steps that do, among the tour steps it breaks.
    - A tour step that shows what is gone is a broken tour step: `check_tour` and the tours panel say so. A scenario step that shows what is gone: its editor in the scenario panel lists what is gone and offers to take it out, `read_scenario` lists it under `missingShows`, and the project's check warns `unknown-free-shape`. Its relations alone say whether it is a broken step, so that it plays where it did.
    - No new element, relation or step takes an id a step shows, as for the ids tours name.
  - **The editors.** The step editor of the scenario panel and that of the tours panel each gain a section, Shows, that lists the pictures, videos and link cards of the step's view by name, a checkbox each, and beside each video a Plays checkbox; each change is one undoable change: "Choose what step N of … shows" for a scenario, and for a tour a change of its steps as any other. While nothing is chosen, the section says that the scenario or tour shows every picture; a step that lists none in one that chooses says that it shows none.
  - **Exports and the page.** The read-only page plays a scenario or a tour as the app does, hiding and playing the same. The SVG, the PDF, the PNG, Mermaid and Structurizr draw a view as it is, every picture shown: a step's choice is playback's, never the drawing's.
  - **Claude.** `create_scenario_from_steps` and the steps that `update_scenario`'s `add` and `insert` add take `shows` and `playing`, and its new edit `show`, `{ "op": "show", "step": 3, "shows": [...], "playing": [...] }`, sets them, `shows: null` taking both away. `add_tour_step` takes them, and `update_tour_step` sets them, `null` taking them away. `read_scenario` and `read_tour` give each step's lists, and `read_view` the pictures' and link cards' ids to name.
  - **Versions.** The lists are part of their step, compared and merged with it by id. The schema gains the two fields on both steps, the format stays 1, and the protocol is unchanged: commands carry steps whole.

- 2026-11-12 (A8's review):
  - **Versions.** Link cards are protocol 14, not 13 as the A8.3 clarification says: 13 went to explorables (ADR 0107), which landed first. A step's `shows` and `playing` (A8.4) belong to 15, which had not shipped, though the A8.4 clarification says the protocol did not change: an app of 14 would refuse a file that holds them.
  - **The internet.** A link's preview is not the only time Visual Anything reaches the internet, as stage 3's text and its clarification say: a script library the person approves (ADR 0107) and a data source the person granted (ADR 0063) do too. Each is asked for; nothing reaches the internet by itself. The inspector, Claude's tool and the code say so.
  - **The PNG draws what the canvas shows.** Stage 4's clarification says the PNG draws a view with every picture shown; it draws what the canvas shows instead, as it does for filters and emphasis, so a PNG exported while a step that chooses its pictures plays leaves the hidden ones out. The SVG and the PDF draw the view as it is, every picture shown.
