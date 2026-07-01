(function (global) {
  "use strict";

  const TYPES = [
    ["paragraph", "¶", "Paragraph"], ["h2", "H2", "Heading"],
    ["h3", "H3", "Subheading"], ["list", "☷", "List"],
    ["quote", "❝", "Quote"], ["image", "▧", "Image"],
    ["video", "▶", "YouTube / Vimeo"], ["embed", "</>", "Embed"]
  ];

  class RichTextEditor {
    constructor(textareaOrId, options) {
      this.textarea = typeof textareaOrId === "string" ? document.getElementById(textareaOrId) : textareaOrId;
      if (!this.textarea || this.textarea.tagName !== "TEXTAREA") {
        throw new Error("BlockEditor requires a textarea element or textarea ID.");
      }
      this.options = Object.assign({
        placeholder: "Type / to choose a block",
        imageUploadUrl: null,
        imageFieldName: "image",
        uploadHeaders: {},
        version: "2.31.6",
        pasteMode: "clean",
        allowPastedLinks: false,
        data: null
      }, options || {});
      this.build();
    }

    build() {
      this.textarea.hidden = true;
      this.root = document.createElement("div");
      this.root.className = "be";
      this.root.innerHTML = `
        <div class="be__topbar">
          <span class="be__brand">Content</span>
          <span class="be__status" aria-live="polite">Saved</span>
        </div>
        <div class="be__canvas"></div>
        <button class="be__add" type="button" aria-label="Add block">＋ <span>Add block</span></button>`;
      this.textarea.insertAdjacentElement("afterend", this.root);
      this.canvas = this.root.querySelector(".be__canvas");
      this.status = this.root.querySelector(".be__status");
      this.root.querySelector(".be__add").addEventListener("click", (event) => this.openMenu(event.currentTarget));
      this.canvas.addEventListener("input", () => this.sync());
      this.canvas.addEventListener("paste", (event) => this.handlePaste(event));
      this.canvas.addEventListener("dragover", (event) => this.moveDraggedBlock(event));
      this.canvas.addEventListener("drop", (event) => event.preventDefault());
      this.textarea.form?.addEventListener("submit", () => this.sync());
      this.load(this.options.data !== null ? this.options.data : this.textarea.value);
    }

    load(input) {
      this.canvas.innerHTML = "";
      const parsed = this.parseData(input);
      if (parsed) {
        parsed.blocks.forEach((item) => {
          const internalType = item.type === "header" ? `h${item.data.level || 2}` : item.type;
          this.addBlock(internalType, this.blockDataToValue(item), false, null, item.id, false);
        });
        if (!this.canvas.children.length) this.addBlock("paragraph", "", false, null, null, false);
        this.sync(false);
        return;
      }

      if (this.lastParseError) {
        this.canvas.innerHTML = `<div class="be__data-error" role="alert"><strong>Invalid editor JSON</strong><p>${this.escape(this.lastParseError.message)}</p><small>If JSON is printed inside a textarea, HTML-escape the complete JSON string on the server, or pass it using the <code>data</code> option.</small></div>`;
        this.status.textContent = "Invalid data";
        return;
      }

      const holder = document.createElement("div");
      holder.innerHTML = input || "";
      [...holder.children].forEach((node) => {
        let type = "paragraph";
        if (/^H[1-3]$/.test(node.tagName)) type = node.tagName === "H3" ? "h3" : "h2";
        else if (["UL", "OL"].includes(node.tagName)) type = "list";
        else if (node.tagName === "BLOCKQUOTE") type = "quote";
        else if (node.tagName === "FIGURE" && node.querySelector("img")) type = "image";
        else if (node.tagName === "IFRAME" || node.querySelector("iframe")) type = "video";
        this.addBlock(type, node.outerHTML, false, null, null, false);
      });
      if (!this.canvas.children.length) this.addBlock("paragraph", "", false, null, null, false);
      this.sync(false);
    }

    addBlock(type, value, focus = true, afterBlock, id, shouldSync = true) {
      const block = document.createElement("div");
      block.className = "be__block";
      block.dataset.type = type;
      block.dataset.id = id || this.makeId();
      block.innerHTML = `
        <div class="be__rail">
          <button type="button" data-action="menu" title="Add block">＋</button>
          <button type="button" data-action="drag" title="Move block">⋮⋮</button>
        </div>
        <div class="be__body"></div>
        <div class="be__actions">
          <button type="button" data-action="up" title="Move up">↑</button>
          <button type="button" data-action="down" title="Move down">↓</button>
          <button type="button" data-action="delete" title="Delete">×</button>
        </div>`;
      const body = block.querySelector(".be__body");
      this.renderBody(body, type, value);
      if (afterBlock) afterBlock.insertAdjacentElement("afterend", block);
      else this.canvas.appendChild(block);
      this.bindBlock(block);
      if (focus) this.focusBlock(block);
      if (shouldSync) this.sync();
      return block;
    }

    renderBody(body, type, value) {
      const source = document.createElement("div");
      source.innerHTML = value || "";
      const text = source.firstElementChild?.innerHTML || value || "";
      if (["paragraph", "h2", "h3", "quote"].includes(type)) {
        const tag = type === "paragraph" ? "div" : type;
        body.innerHTML = `<div class="be__inlinebar">
          <button type="button" data-command="bold"><b>B</b></button>
          <button type="button" data-command="italic"><i>I</i></button>
          <button type="button" data-command="underline"><u>U</u></button>
          <select data-command="fontSize" aria-label="Font size"><option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option></select>
          <button type="button" data-link>Link</button>
        </div><${tag} class="be__text" contenteditable="true" data-placeholder="${this.escape(this.options.placeholder)}">${text}</${tag}>`;
      } else if (type === "list") {
        const list = source.querySelector("ul,ol");
        body.innerHTML = `<ul class="be__text be__list" contenteditable="true"><li>${list ? [...list.children].map(li => li.innerHTML).join("</li><li>") : "List item"}</li></ul>`;
      } else if (type === "image") {
        const image = source.querySelector("img");
        const caption = source.querySelector("figcaption")?.innerHTML || "";
        body.innerHTML = image ? this.imageMarkup(image.src, caption) : this.urlCard("Image URL", "Paste an image URL", "image");
      } else {
        const frame = source.querySelector("iframe");
        body.innerHTML = frame ? this.frameMarkup(frame.src, type) : this.urlCard(type === "video" ? "Video URL" : "Embed URL", "Paste URL here", type);
      }
    }

    parseData(input) {
      this.lastParseError = null;
      if (input && typeof input === "object") return Array.isArray(input.blocks) ? input : null;
      if (!input || typeof input !== "string" || !input.trim().startsWith("{")) return null;
      try {
        const data = JSON.parse(input);
        return Array.isArray(data.blocks) ? data : null;
      } catch (error) {
        this.lastParseError = error;
        return null;
      }
    }

    blockDataToValue(block) {
      const data = block.data || {};
      if (block.type === "paragraph") return `<p>${this.sanitizeInline(data.text || "")}</p>`;
      if (block.type === "header") return `<h${data.level || 2}>${this.sanitizeInline(data.text || "")}</h${data.level || 2}>`;
      if (block.type === "quote") return `<blockquote>${this.sanitizeInline(data.text || "")}</blockquote>`;
      if (block.type === "list") {
        const tag = data.style === "ordered" ? "ol" : "ul";
        const items = (data.items || []).map(item => `<li>${this.sanitizeInline(typeof item === "string" ? item : item.content || "")}</li>`).join("");
        return `<${tag}>${items}</${tag}>`;
      }
      if (block.type === "image") {
        const url = data.file?.url || data.url || "";
        return url ? `<figure><img src="${this.escape(url)}"><figcaption>${data.caption || ""}</figcaption></figure>` : "";
      }
      if (block.type === "video" || block.type === "embed") {
        const url = data.embed || data.source || data.url || "";
        return url ? `<div><iframe src="${this.escape(url)}"></iframe></div>` : "";
      }
      return `<p>${data.text || ""}</p>`;
    }

    bindBlock(block) {
      const dragHandle = block.querySelector('[data-action="drag"]');
      dragHandle.addEventListener("mousedown", () => { block.draggable = true; });
      dragHandle.addEventListener("mouseup", () => { block.draggable = false; });
      dragHandle.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp" && block.previousElementSibling) {
          event.preventDefault();
          block.previousElementSibling.before(block);
          dragHandle.focus();
          this.sync();
        }
        if (event.key === "ArrowDown" && block.nextElementSibling) {
          event.preventDefault();
          block.nextElementSibling.after(block);
          dragHandle.focus();
          this.sync();
        }
      });
      block.addEventListener("dragstart", (event) => {
        this.dragging = block;
        block.classList.add("be__block--dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", block.dataset.id);
      });
      block.addEventListener("dragend", () => {
        block.classList.remove("be__block--dragging");
        block.draggable = false;
        this.dragging = null;
        this.sync();
      });
      block.addEventListener("mousedown", (event) => {
        if (event.target.closest(".be__inlinebar button")) event.preventDefault();
      });
      block.addEventListener("click", (event) => {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "menu") this.openMenu(event.target, block);
        if (action === "up" && block.previousElementSibling) block.previousElementSibling.before(block);
        if (action === "down" && block.nextElementSibling) block.nextElementSibling.after(block);
        if (action === "delete") {
          block.remove();
          if (!this.canvas.children.length) this.addBlock("paragraph");
        }
        if (action) this.sync();

        const command = event.target.closest("[data-command]")?.dataset.command;
        if (command && event.target.tagName !== "SELECT") {
          event.preventDefault();
          document.execCommand(command, false, null);
          this.sync();
        }
        if (event.target.closest("[data-link]")) {
          const url = prompt("Link URL");
          if (this.safeUrl(url)) document.execCommand("createLink", false, url);
        }
        if (event.target.matches("[data-load-url]")) this.loadUrl(block, event.target.dataset.loadUrl);
      });
      block.addEventListener("change", (event) => {
        if (event.target.matches("[data-image-file]")) this.uploadImage(block, event.target.files[0]);
        if (event.target.dataset.command === "fontSize" && event.target.value) {
          document.execCommand("fontSize", false, event.target.value);
          event.target.value = "";
          this.sync();
        }
      });
      block.addEventListener("keydown", (event) => {
        if (event.key === "/" && this.isEmptyText(block)) {
          event.preventDefault();
          this.openMenu(block.querySelector(".be__body"), block, true);
        }
        if (event.key === "Enter" && !event.shiftKey && ["paragraph", "h2", "h3", "quote"].includes(block.dataset.type)) {
          event.preventDefault();
          this.addBlock("paragraph", "", true, block);
        }
        if (event.key === "Backspace" && this.isEmptyText(block) && this.canvas.children.length > 1) {
          const previous = block.previousElementSibling;
          block.remove();
          if (previous) this.focusBlock(previous);
          this.sync();
        }
      });
    }

    moveDraggedBlock(event) {
      if (!this.dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const target = event.target.closest(".be__block");
      if (!target || target === this.dragging) return;
      const rect = target.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) target.before(this.dragging);
      else target.after(this.dragging);
    }

    openMenu(anchor, afterBlock, replace = false) {
      this.closeMenu();
      const menu = document.createElement("div");
      menu.className = "be__menu";
      menu.innerHTML = `<strong>Add a block</strong><div>${TYPES.map(([type, icon, label]) => `<button type="button" data-type="${type}"><i>${icon}</i><span>${label}</span></button>`).join("")}</div>`;
      document.body.appendChild(menu);
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const gap = 7;
      let left = anchorRect.left;
      let top = anchorRect.bottom + gap;
      if (left + menuRect.width > global.innerWidth - 10) left = global.innerWidth - menuRect.width - 10;
      if (left < 10) left = 10;
      if (top + menuRect.height > global.innerHeight - 10) top = anchorRect.top - menuRect.height - gap;
      if (top < 10) top = 10;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.querySelectorAll("[data-type]").forEach(button => button.addEventListener("click", () => {
        const target = replace ? afterBlock.previousElementSibling : afterBlock;
        if (replace) afterBlock.remove();
        this.addBlock(button.dataset.type, "", true, target);
        this.closeMenu();
      }));
      this.menu = menu;
      this.menuReposition = () => this.closeMenu();
      global.addEventListener("resize", this.menuReposition, { once: true });
      global.addEventListener("scroll", this.menuReposition, { once: true, capture: true });
      setTimeout(() => document.addEventListener("click", this.outside = (e) => {
        if (!menu.contains(e.target)) this.closeMenu();
      }, { once: true }), 0);
    }

    closeMenu() {
      this.menu?.remove();
      this.menu = null;
      if (this.menuReposition) {
        global.removeEventListener("resize", this.menuReposition);
        global.removeEventListener("scroll", this.menuReposition, true);
        this.menuReposition = null;
      }
    }

    loadUrl(block, type) {
      const input = block.querySelector("input");
      const url = input.value.trim();
      if (!this.safeUrl(url)) return input.setCustomValidity("Enter a valid http(s) URL"), input.reportValidity();
      input.setCustomValidity("");
      const body = block.querySelector(".be__body");
      if (type === "image") body.innerHTML = this.imageMarkup(url, "");
      else {
        const embed = type === "video" ? this.toEmbedUrl(url) : url;
        if (!embed) return;
        body.innerHTML = this.frameMarkup(embed, type);
      }
      this.sync();
    }

    async uploadImage(block, file) {
      if (!file) return;
      if (!file.type.startsWith("image/")) return this.showUploadError(block, "Please choose an image file.");
      if (!this.options.imageUploadUrl) return this.showUploadError(block, "Set imageUploadUrl when creating the editor.");

      const button = block.querySelector(".be__upload-button");
      const oldLabel = button?.textContent;
      if (button) { button.disabled = true; button.textContent = "Uploading…"; }
      this.showUploadError(block, "");

      try {
        const data = new FormData();
        data.append(this.options.imageFieldName, file);
        const response = await fetch(this.options.imageUploadUrl, {
          method: "POST",
          headers: this.options.uploadHeaders,
          body: data
        });
        if (!response.ok) throw new Error(`Upload failed (${response.status})`);
        const result = await response.json();
        console.log(result)
        const url = result.url || result.imageUrl || result.location || result.data?.url || result.file?.url;
        const absoluteUrl = url ? new URL(url, global.location.href).href : "";
        if (!absoluteUrl || !this.safeUrl(absoluteUrl)) throw new Error("Upload response did not contain a valid image URL.");
        block.querySelector(".be__body").innerHTML = this.imageMarkup(absoluteUrl, "");
        this.sync();
      } catch (error) {
        this.showUploadError(block, error.message || "Image upload failed.");
        if (button) { button.disabled = false; button.textContent = oldLabel; }
      }
    }

    showUploadError(block, message) {
      const output = block.querySelector(".be__upload-error");
      if (output) output.textContent = message;
    }

    urlCard(label, placeholder, type) {
      if (type === "image") {
        return `<div class="be__url be__image-input">
          <span>Add an image</span>
          <label class="be__upload-button">Upload image<input type="file" accept="image/*" data-image-file></label>
          <em>or paste an image URL</em>
          <div><input type="url" placeholder="${placeholder}"><button type="button" data-load-url="image">Add</button></div>
          <small class="be__upload-error" role="alert"></small>
        </div>`;
      }
      return `<div class="be__url"><span>${label}</span><div><input type="url" placeholder="${placeholder}"><button type="button" data-load-url="${type}">Add</button></div></div>`;
    }
    imageMarkup(url, caption) {
      return `<figure class="be__media"><img src="${this.escape(url)}" alt=""><figcaption contenteditable="true" data-placeholder="Add a caption">${caption}</figcaption></figure>`;
    }
    frameMarkup(url, type) {
      return `<div class="be__embed"><iframe src="${this.escape(url)}" loading="lazy" allowfullscreen></iframe><small>${type === "video" ? "Video" : "Embedded content"}</small></div>`;
    }

    serializeBlock(block) {
      const type = block.dataset.type;
      if (["paragraph", "h2", "h3", "quote"].includes(type)) {
        const text = this.sanitizeInline(block.querySelector(".be__text")?.innerHTML || "");
        if (type === "h2" || type === "h3") return { id: block.dataset.id, type: "header", data: { text, level: Number(type[1]) } };
        if (type === "quote") return { id: block.dataset.id, type, data: { text, caption: "", alignment: "left" } };
        return { id: block.dataset.id, type, data: { text } };
      }
      if (type === "list") {
        const list = block.querySelector(".be__list");
        return { id: block.dataset.id, type: "list", data: { style: list?.tagName === "OL" ? "ordered" : "unordered", items: [...(list?.children || [])].map(item => this.sanitizeInline(item.innerHTML)) } };
      }
      if (type === "image") {
        const img = block.querySelector("img");
        return { id: block.dataset.id, type: "image", data: { file: { url: img?.src || "" }, caption: block.querySelector("figcaption")?.innerHTML || "", withBorder: false, stretched: false, withBackground: false } };
      }
      const iframe = block.querySelector("iframe");
      const source = iframe?.src || "";
      return { id: block.dataset.id, type, data: { service: this.embedService(source), source, embed: source, width: 640, height: 360, caption: "" } };
    }

    sync(showStatus = true) {
      const data = {
        time: Date.now(),
        blocks: [...this.canvas.children].map(block => this.serializeBlock(block)),
        version: this.options.version
      };
      this.textarea.value = JSON.stringify(data);
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      if (showStatus) {
        this.status.textContent = "Saving…";
        clearTimeout(this.statusTimer);
        this.statusTimer = setTimeout(() => this.status.textContent = "Saved", 350);
      }
    }

    isEmptyText(block) { return !(block.querySelector(".be__text")?.textContent || "").trim(); }
    handlePaste(event) {
      if (!event.target.closest(".be__text, figcaption")) return;
      event.preventDefault();
      const html = event.clipboardData.getData("text/html");
      const text = event.clipboardData.getData("text/plain");
      let content;
      if (this.options.pasteMode === "plain" || !html) {
        content = this.escape(text).replace(/\r?\n/g, "<br>");
      } else {
        content = this.sanitizeInline(html, { allowLinks: this.options.allowPastedLinks });
      }
      document.execCommand("insertHTML", false, content);
      this.sync();
    }
    sanitizeInline(html, settings) {
      const config = Object.assign({ allowLinks: true }, settings || {});
      const source = document.createElement("template");
      source.innerHTML = String(html);
      const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "DEL", "A", "BR", "CODE", "FONT"]);
      const blocks = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI"]);
      const discarded = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "FRAME", "OBJECT", "EMBED", "SVG", "MATH", "META", "LINK", "BASE", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "TEMPLATE"]);
      const clean = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        if (discarded.has(node.tagName)) return document.createDocumentFragment();
        const fragment = document.createDocumentFragment();
        [...node.childNodes].forEach(child => fragment.appendChild(clean(child)));
        if (!allowed.has(node.tagName)) {
          if (blocks.has(node.tagName) && fragment.childNodes.length) fragment.appendChild(document.createElement("br"));
          return fragment;
        }
        const tag = node.tagName === "STRONG" ? "strong" : node.tagName === "EM" ? "em" : node.tagName.toLowerCase();
        const element = document.createElement(tag);
        if (node.tagName === "A" && config.allowLinks) {
          const href = node.getAttribute("href");
          if (this.safeUrl(href)) {
            element.href = href;
            element.rel = "noopener noreferrer";
            element.target = "_blank";
          }
        }
        if (node.tagName === "A" && !config.allowLinks) return fragment;
        if (node.tagName === "FONT" && /^[1-7]$/.test(node.getAttribute("size") || "")) element.setAttribute("size", node.getAttribute("size"));
        element.appendChild(fragment);
        return element;
      };
      const output = document.createElement("div");
      [...source.content.childNodes].forEach(node => output.appendChild(clean(node)));
      return output.innerHTML
        .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
        .replace(/(?:<br>\s*)+$/i, "");
    }
    makeId() {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
      let id = "";
      const values = global.crypto?.getRandomValues ? global.crypto.getRandomValues(new Uint8Array(10)) : Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
      values.forEach(value => id += chars[value % chars.length]);
      return id;
    }
    embedService(url) {
      try {
        const host = new URL(url).hostname;
        if (host.includes("youtube")) return "youtube";
        if (host.includes("vimeo")) return "vimeo";
      } catch (_) {}
      return "embed";
    }
    focusBlock(block) { block?.querySelector("[contenteditable]")?.focus(); }
    safeUrl(value) { try { return /^https?:$/.test(new URL(value).protocol); } catch (_) { return false; } }
    toEmbedUrl(value) {
      try {
        const url = new URL(value), host = url.hostname.replace(/^www\./, "");
        if (host === "youtu.be") return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
        if (host === "youtube.com" || host === "m.youtube.com") {
          const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (host === "vimeo.com") return `https://player.vimeo.com/video/${url.pathname.split("/").filter(Boolean).pop()}`;
      } catch (_) {}
      return null;
    }
    escape(value) { return String(value).replace(/[&"<>]/g, c => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]); }
    getData() { this.sync(false); return JSON.parse(this.textarea.value); }
    setData(data) { this.load(data); }
    getHTML() { this.sync(false); return this.textarea.value; }
    setHTML(html) { this.textarea.value = html || ""; this.load(this.textarea.value); }
    focus() { this.focusBlock(this.canvas.firstElementChild); }
    destroy() { this.sync(false); this.root.remove(); this.textarea.hidden = false; }
  }

  RichTextEditor.create = (id, options) => new RichTextEditor(id, options);
  global.RichTextEditor = RichTextEditor;
  global.BlockEditor = RichTextEditor;
})(window);
