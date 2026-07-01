# Hidden Textarea Editor

A dependency-free block content editor inspired by Editor.js and WordPress. Every paragraph, heading, list, image, quote, or embed is an independent movable block. The editor hides an existing textarea and continuously writes clean HTML back to it for normal form submission.

## Use

Load the stylesheet and script:

```html
<link rel="stylesheet" href="src/rich-text-editor.css">
<textarea id="content" name="content"></textarea>
<script src="src/rich-text-editor.js"></script>
<script>
  const editor = BlockEditor.create("content", {
    imageUploadUrl: "/api/images/upload"
  });
</script>
```

The textarea receives Editor.js-style JSON automatically. Add blocks with the `+` button or type `/` in an empty text block. Blocks support paragraphs, headings, quotes, lists, images, YouTube/Vimeo, HTTPS embeds, font sizes, bold, italic, underline, and links. Use the arrow controls to reorder blocks.

```json
{"time":1782910401561,"blocks":[{"id":"5NU4PFSPKy","type":"paragraph","data":{"text":"Hello"}}],"version":"2.31.6"}
```

## API

```js
editor.getData();
editor.setData({ blocks: [{ id: "abc", type: "paragraph", data: { text: "Hello" } }] });
editor.focus();
editor.destroy();
```

Options include `placeholder`, `imageUploadUrl`, `imageFieldName`, and `uploadHeaders`.

## Safe website pasting

Copied website content is cleaned before insertion. Scripts, styles, embeds, forms, tracking attributes, classes, IDs, and unsafe URLs are removed. Safe bold, italic, underline, strike, code, font size, and line breaks remain. Copied links are removed by default.

```js
BlockEditor.create("content", {
  pasteMode: "clean",       // preserve safe inline formatting
  allowPastedLinks: false   // set true to preserve safe http(s) links
});
```

Use `pasteMode: "plain"` to remove every copied HTML tag and paste text only. Content must still be validated and sanitized on the server before public rendering.

## Loading JSON safely

When the block data already exists as a JavaScript object, pass it directly. This is the safest option because the HTML parser cannot modify strings inside the JSON:

```js
const savedData = { time: 1782915142478, blocks: [/* ... */], version: "2.31.6" };

BlockEditor.create("content", {
  data: savedData
});
```

If JSON is rendered inside the textarea by a server template, HTML-escape the **complete JSON string**. Otherwise entities such as `&quot;` inside copied website HTML are decoded into literal quotes and break the JSON.

PHP example:

```php
<textarea id="content" name="content"><?=
  htmlspecialchars($savedJson, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
?></textarea>
```

Do not insert an already encoded JSON string without escaping it again for the HTML context. Invalid JSON is now shown as an editor error instead of being silently imported as one paragraph.

## Image upload endpoint

The image block sends a `POST` request using `multipart/form-data`. The default file field is named `image`.

```js
BlockEditor.create("content", {
  imageUploadUrl: "https://example.com/api/images",
  imageFieldName: "image",
  uploadHeaders: { Authorization: "Bearer token" }
});
```

Return JSON containing an absolute image URL in any of these shapes:

```json
{ "url": "https://example.com/uploads/photo.jpg" }
```

`imageUrl`, `location`, `data.url`, and `file.url` are also accepted. The server must allow cross-origin requests when it is hosted on a different domain.

> Treat editor HTML as untrusted input and sanitize it on your server before displaying or storing it.
