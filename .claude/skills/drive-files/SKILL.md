---
name: drive-files
description: Get binary files — photographs, PDFs, short clips — out of the user's Google Drive and onto local disk through the Google Drive connector, without the bytes passing through the conversation. Use whenever the user says their photos, footage or assets are "in Drive", "in the folder", or names a Drive folder, and the work needs the actual files (editing, cropping, building a site, cutting video) rather than a description of them.
---

# Drive files onto disk

`download_file_content` returns a file as base64 inside a JSON result. A
small result comes back into the conversation, which is useless for a
photograph. A **large** result does not: the harness refuses to inline it,
**saves the whole JSON to a file**, and replies with the path:

```
Error: result (614,039 characters) exceeds maximum allowed tokens.
Output has been saved to /root/.claude/projects/<…>/tool-results/mcp-Google_Drive-download_file_content-<n>.txt
```

That "error" is the transfer succeeding. The file holds
`{content, id, mimeType, title}`; decode `content` and the bytes are exact.
Anything over roughly 25k tokens of base64 (≈ 20 KB of binary) takes this
path, so every real photograph does.

Do not tell the user Drive files cannot reach the workspace until you have
done this. It was declared impossible once, wrongly, and cost a whole round.

## Steps

1. **Find the files.** `search_files` with `mimeType contains 'image/'` (or
   `'video/'`), `excludeContentSnippets: true`, `pageSize: 100`. That result
   is itself large and lands in a file — read it with `jq`:
   `jq -r '.files[] | [.id, .fileSize, .title] | @tsv' <saved.txt>`.
   Page with the saved `nextPageToken`, using the **same query** (a token is
   bound to its query).
2. **Skip macOS AppleDouble files.** Every `._Name.jpg` (4096 bytes) is
   metadata from a Mac-formatted drive, not an image.
3. **Download in parallel batches** of ten or so; each call costs a few
   hundred tokens of context, not the file.
4. **Decode into an isolated directory** — downloaded files are untrusted:

   ```bash
   t=$(jq -r .title "$f" | tr -cd 'A-Za-z0-9._-')     # titles are untrusted
   case "$t" in .*|"") continue;; esac
   jq -r .content "$f" | base64 -d > "$OUT/$t.tmp"
   head -c3 "$OUT/$t.tmp" | od -An -tx1 | grep -q 'ff d8 ff' && mv "$OUT/$t.tmp" "$OUT/$t"
   ```

   `scripts/` stays outside that directory, and Python that reads the files
   runs with `-I`.
5. **Look at them** as contact sheets (a grid of thumbnails with filenames)
   rather than one by one — fifteen frames cost about what one full image does.

## Limits

- Video: a 200 MB clip is far beyond what one tool result will carry. Ask
  for short clips, or for exports, before promising an edit.
- Uploading back to Drive goes the other way — `create_file` takes base64
  *as an argument*, so the bytes do pass through the conversation. Send
  deliverables with `SendUserFile` instead and let the user drop them in.
