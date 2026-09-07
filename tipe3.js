(() => {
  "use strict";

  const OUTPUT_WIDTH = 2160;
  const OUTPUT_HEIGHT = 2700;
  const BACKGROUND = "#38352F";

  const state = {
    rawRows: [],
    hasHeader: false,
    quotes: [],
    source: "manual",
    previewIndex: 0,
    previewFrame: 0,
    toastTimer: null,
    musicFile: null,
    musicDuration: 0,
    musicUrl: "",
    musicIsDefault: true,
    exporting: false,
  };

  const $ = (id) => document.getElementById(id);
  const ui = {
    dropzone: $("tipe3Dropzone"),
    excelInput: $("tipe3ExcelInput"),
    excelStatus: $("tipe3ExcelStatus"),
    excelName: $("tipe3ExcelName"),
    excelInfo: $("tipe3ExcelInfo"),
    clearExcel: $("clearTipe3Excel"),
    columnRow: $("tipe3ColumnRow"),
    columnSelect: $("tipe3ColumnSelect"),
    manualQuote: $("manualTipe3Quote"),
    useManual: $("useManualTipe3"),
    quoteCount: $("tipe3QuoteCount"),
    exportCount: $("tipe3ExportCount"),
    canvas: $("tipe3Canvas"),
    prev: $("tipe3Prev"),
    next: $("tipe3Next"),
    previewIndex: $("tipe3PreviewIndex"),
    fileName: $("tipe3FileName"),
    generate: $("generateTipe3"),
    dialog: $("tipe3ProgressDialog"),
    progressTitle: $("tipe3ProgressTitle"),
    progressDetail: $("tipe3ProgressDetail"),
    progressBar: $("tipe3ProgressBar"),
    progressPercent: $("tipe3ProgressPercent"),
    progressCounter: $("tipe3ProgressCounter"),
    musicDropzone: $("musicDropzone"),
    musicInput: $("musicInput"),
    musicName: $("musicName"),
    musicInfo: $("musicInfo"),
    musicDurationBadge: $("musicDurationBadge"),
    resetMusic: $("resetMusic"),
    musicPreview: $("musicPreview"),
    exportMusicDuration: $("exportMusicDuration"),
    toast: $("tipe3Toast"),
  };

  function init() {
    bindDropzone();
    ui.excelInput.addEventListener("change", () => handleExcelFile(ui.excelInput.files[0]));
    ui.clearExcel.addEventListener("click", () => clearExcel(true));
    ui.columnSelect.addEventListener("change", updateQuotesFromColumn);
    ui.useManual.addEventListener("click", useManualQuote);
    ui.manualQuote.addEventListener("input", () => {
      if (state.source === "manual") {
        state.quotes = [normalizeText(ui.manualQuote.value)].filter(Boolean);
        state.previewIndex = 0;
        updateState();
      }
    });
    ui.prev.addEventListener("click", () => movePreview(-1));
    ui.next.addEventListener("click", () => movePreview(1));
    ui.generate.addEventListener("click", generateAll);
    ui.musicInput.addEventListener("change", () => handleMusicFile(ui.musicInput.files[0]));
    ui.resetMusic.addEventListener("click", () => loadDefaultMusic(true));
    bindMusicDropzone();

    state.quotes = [normalizeText(ui.manualQuote.value)];
    updateState();
    loadDefaultMusic(false);
  }

  function bindDropzone() {
    ["dragenter", "dragover"].forEach((type) => {
      ui.dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        ui.dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      ui.dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        ui.dropzone.classList.remove("dragover");
      });
    });
    ui.dropzone.addEventListener("drop", (event) => handleExcelFile(event.dataTransfer.files[0]));
  }

  function bindMusicDropzone() {
    ["dragenter", "dragover"].forEach((type) => {
      ui.musicDropzone.addEventListener(type, (event) => {
        event.preventDefault();
        ui.musicDropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      ui.musicDropzone.addEventListener(type, (event) => {
        event.preventDefault();
        ui.musicDropzone.classList.remove("dragover");
      });
    });
    ui.musicDropzone.addEventListener("drop", (event) => handleMusicFile(event.dataTransfer.files[0]));
  }

  async function loadDefaultMusic(showMessage = false) {
    try {
      const file = TemplateVideo.getDefaultMusicFile();
      await setMusicFile(file, true);
      ui.musicInput.value = "";
      if (showMessage) showToast("Musik bawaan digunakan kembali.");
    } catch (error) {
      console.error(error);
      showToast(`Musik bawaan gagal dimuat: ${error.message}`, true);
    }
  }

  async function handleMusicFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("audio/") && !/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name)) {
      showToast("Pilih file musik MP3, M4A, WAV, OGG, atau AAC.", true);
      return;
    }
    try {
      await setMusicFile(file, false);
      showToast(`Musik ${file.name} siap digunakan.`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Musik gagal dibaca.", true);
      ui.musicInput.value = "";
    }
  }

  async function setMusicFile(file, isDefault) {
    ui.musicName.textContent = file.name;
    ui.musicInfo.textContent = "Membaca durasi musik…";
    ui.musicDurationBadge.textContent = "Memuat…";
    state.musicFile = null;
    state.musicDuration = 0;
    updateState();

    const info = await TemplateVideo.probeAudio(file);
    if (state.musicUrl) URL.revokeObjectURL(state.musicUrl);
    state.musicUrl = URL.createObjectURL(file);
    state.musicFile = file;
    state.musicDuration = info.duration;
    state.musicIsDefault = isDefault;
    ui.musicPreview.src = state.musicUrl;
    ui.musicName.textContent = file.name;
    ui.musicInfo.textContent = `${formatBytes(file.size)} · video mengikuti seluruh durasi musik`;
    ui.musicDurationBadge.textContent = TemplateVideo.formatDuration(info.duration);
    ui.exportMusicDuration.textContent = `${TemplateVideo.formatDuration(info.duration)} · musik ${isDefault ? "bawaan" : "pilihan"}`;
    updateState();
  }

  async function handleExcelFile(file) {
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "csv"].includes(extension)) {
      showToast("Gunakan file .xlsx atau .csv.", true);
      return;
    }
    ui.excelName.textContent = file.name;
    ui.excelInfo.textContent = "Membaca file…";
    ui.excelStatus.hidden = false;

    try {
      const rows = extension === "csv" ? parseCsv(await file.text()) : await parseXlsxRows(file);
      const cleanRows = trimEmptyRows(rows);
      if (!cleanRows.length) throw new Error("Tidak ada quotes yang dapat dibaca.");
      state.rawRows = cleanRows;
      state.source = "excel";
      configureColumns(cleanRows);
      updateQuotesFromColumn();
      ui.excelInfo.textContent = `${formatBytes(file.size)} · ${state.quotes.length} quotes terbaca`;
      showToast(`${state.quotes.length} quotes berhasil dimuat.`);
    } catch (error) {
      console.error(error);
      clearExcel(false);
      showToast(`File gagal dibaca: ${error.message || "format tidak didukung"}`, true);
    }
  }

  function clearExcel(showMessage = true) {
    state.rawRows = [];
    state.hasHeader = false;
    ui.excelInput.value = "";
    ui.excelStatus.hidden = true;
    ui.columnRow.hidden = true;
    ui.columnSelect.replaceChildren();
    useManualQuote(false);
    if (showMessage) showToast("Excel dihapus. Quotes manual digunakan.");
  }

  function useManualQuote(showMessage = true) {
    const quote = normalizeText(ui.manualQuote.value);
    if (!quote) {
      showToast("Masukkan quotes manual terlebih dahulu.", true);
      return;
    }
    state.source = "manual";
    state.quotes = [quote];
    state.previewIndex = 0;
    updateState();
    if (showMessage) showToast("Quotes manual digunakan.");
  }

  function configureColumns(rows) {
    const firstRow = rows[0] || [];
    const known = ["kalimat", "quotes", "quote", "caption", "teks", "text"];
    const normalized = firstRow.map((value) => normalizeText(value).toLowerCase());
    const detected = normalized.findIndex((value) => known.includes(value));
    const maxColumns = Math.max(1, ...rows.slice(0, 50).map((row) => row.length));
    state.hasHeader = detected >= 0;
    ui.columnSelect.replaceChildren();
    for (let index = 0; index < maxColumns; index += 1) {
      const option = document.createElement("option");
      option.value = String(index);
      const header = normalizeText(firstRow[index]);
      option.textContent = state.hasHeader && header ? `${columnName(index)} · ${header}` : `Kolom ${columnName(index)}`;
      ui.columnSelect.append(option);
    }
    ui.columnSelect.value = String(detected >= 0 ? detected : firstNonEmptyColumn(rows));
    ui.columnRow.hidden = maxColumns <= 1;
  }

  function updateQuotesFromColumn() {
    const column = Number(ui.columnSelect.value || 0);
    const start = state.hasHeader ? 1 : 0;
    state.quotes = state.rawRows.slice(start).map((row) => normalizeText(row[column])).filter(Boolean);
    state.previewIndex = 0;
    updateState();
  }

  function updateState() {
    const count = state.quotes.length;
    ui.quoteCount.textContent = `${count} quotes`;
    ui.exportCount.textContent = String(count);
    ui.generate.disabled = count === 0 || !state.musicFile || !state.musicDuration || state.exporting;
    state.previewIndex = Math.min(state.previewIndex, Math.max(0, count - 1));
    requestPreview();
  }

  function movePreview(direction) {
    const count = Math.max(1, state.quotes.length);
    state.previewIndex = (state.previewIndex + direction + count) % count;
    requestPreview();
  }

  function requestPreview() {
    cancelAnimationFrame(state.previewFrame);
    state.previewFrame = requestAnimationFrame(() => {
      state.previewFrame = 0;
      renderPreview();
    });
  }

  function renderPreview() {
    const quote = state.quotes[state.previewIndex] || "Tulis quotes di sini.";
    const context = ui.canvas.getContext("2d");
    renderTemplate(context, ui.canvas.width, ui.canvas.height, quote);
    const count = state.quotes.length || 1;
    ui.previewIndex.textContent = `${Math.min(state.previewIndex + 1, count)} / ${count}`;
    ui.prev.disabled = count <= 1;
    ui.next.disabled = count <= 1;
    ui.fileName.textContent = `${String(state.previewIndex + 1).padStart(3, "0")}-tipe-3.mp4`;
  }

  function renderTemplate(context, width, height, quote) {
    const scale = width / OUTPUT_WIDTH;
    context.save();
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#FFFFFF";
    context.textAlign = "left";
    context.textBaseline = "middle";

    const left = width * (220 / OUTPUT_WIDTH);
    const maxWidth = width * .80;
    const centerY = height * .50;
    const lineHeightRatio = 1.29;
    let fontSize = 145 * scale;
    const minFontSize = 82 * scale;
    let lines = [];
    let lineHeight = fontSize * lineHeightRatio;

    while (fontSize >= minFontSize) {
      context.font = `400 ${fontSize}px Arial, Helvetica, sans-serif`;
      lines = wrapText(context, quote, maxWidth);
      lineHeight = fontSize * lineHeightRatio;
      const blockHeight = fontSize + Math.max(0, lines.length - 1) * lineHeight;
      if (lines.length <= 5 && blockHeight <= height * .40) break;
      fontSize -= 3 * scale;
    }

    context.font = `400 ${fontSize}px Arial, Helvetica, sans-serif`;
    const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, left, firstY + index * lineHeight, maxWidth));

    context.textBaseline = "alphabetic";
    context.font = `700 ${80 * scale}px Arial, Helvetica, sans-serif`;
    context.fillText("- wordivee", left, height * .96);
    context.restore();
  }

  function wrapText(context, text, maxWidth) {
    const lines = [];
    String(text || "").split(/\r?\n/).forEach((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        return;
      }
      let line = "";
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          if (context.measureText(word).width <= maxWidth) line = word;
          else {
            const chunks = splitLongWord(context, word, maxWidth);
            lines.push(...chunks.slice(0, -1));
            line = chunks.at(-1) || "";
          }
        }
      });
      if (line) lines.push(line);
    });
    return lines.length ? lines : [""];
  }

  function splitLongWord(context, word, maxWidth) {
    const chunks = [];
    let chunk = "";
    [...word].forEach((character) => {
      const next = chunk + character;
      if (chunk && context.measureText(next).width > maxWidth) {
        chunks.push(chunk);
        chunk = character;
      } else chunk = next;
    });
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  async function generateAll() {
    if (!state.quotes.length) {
      showToast("Masukkan minimal satu quotes.", true);
      return;
    }
    if (!state.musicFile || !state.musicDuration) {
      showToast("Tunggu sampai musik selesai dimuat.", true);
      return;
    }
    if (!window.TemplateVideo) {
      showToast("Komponen video tidak tersedia.", true);
      return;
    }

    const total = state.quotes.length;
    const date = new Date().toLocaleDateString("sv-SE");
    state.exporting = true;
    updateState();
    openProgress(total);

    try {
      const result = await TemplateVideo.exportBatch({
        quotes: state.quotes,
        musicFile: state.musicFile,
        duration: state.musicDuration,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fps: 24,
        renderFrame: (context, width, height, quote) => renderTemplate(context, width, height, quote),
        makeBaseName: (index, quote) => makeVideoBaseName(index, quote),
        zipName: `video-tipe-3-${total}-${date}.zip`,
        onProgress: (progress) => setProgress(
          progress.percent,
          Math.min(total, Math.ceil(progress.current || 0)),
          total,
          progress.title,
          progress.detail,
        ),
      });
      await delay(450);
      closeProgress();
      showToast(`${total} video Tipe 3 berhasil dibuat dalam format ${result.extension.toUpperCase()}.`);
    } catch (error) {
      console.error(error);
      closeProgress();
      showToast(`Gagal membuat video: ${error.message || "kesalahan browser"}`, true);
    } finally {
      state.exporting = false;
      updateState();
    }
  }

  function openProgress(total) {
    setProgress(0, 0, total, `Menyiapkan ${total} video…`, "Memeriksa encoder MP4 dan musik.");
    if (typeof ui.dialog.showModal === "function") ui.dialog.showModal();
    else ui.dialog.setAttribute("open", "");
  }

  function closeProgress() {
    if (ui.dialog.open && typeof ui.dialog.close === "function") ui.dialog.close();
    else ui.dialog.removeAttribute("open");
  }

  function setProgress(percent, current, total, title, detail = "Menyiapkan video…") {
    const safe = Math.max(0, Math.min(100, percent));
    ui.progressBar.style.width = `${safe}%`;
    ui.progressPercent.textContent = `${Math.round(safe)}%`;
    ui.progressCounter.textContent = `${current} / ${total}`;
    ui.progressTitle.textContent = title;
    ui.progressDetail.textContent = detail;
  }


  function makeVideoBaseName(index, quote) {
    const number = String(index + 1).padStart(Math.max(3, String(state.quotes.length || 1).length), "0");
    const slug = normalizeText(quote).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54).replace(/-$/g, "");
    return `${number}-tipe-3-${slug || "quotes"}`;
  }



  async function parseXlsxRows(file) {
    if (typeof JSZip === "undefined") throw new Error("Pembaca Excel tidak tersedia.");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const workbookEntry = zip.file("xl/workbook.xml");
    const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
    if (!workbookEntry || !relsEntry) throw new Error("Struktur .xlsx tidak valid.");
    const workbook = parseXml(await workbookEntry.async("string"));
    const relationships = parseXml(await relsEntry.async("string"));
    const relMap = new Map();
    [...relationships.getElementsByTagName("Relationship")].forEach((rel) => relMap.set(rel.getAttribute("Id"), rel.getAttribute("Target")));
    const sheet = workbook.getElementsByTagName("sheet")[0];
    if (!sheet) throw new Error("Worksheet tidak ditemukan.");
    const relationshipId = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relMap.get(relationshipId);
    const path = normalizeZipPath(target ? `xl/${target}` : "xl/worksheets/sheet1.xml");
    let sheetEntry = zip.file(path);
    if (!sheetEntry) {
      const fallback = Object.keys(zip.files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
      sheetEntry = fallback ? zip.file(fallback) : null;
    }
    if (!sheetEntry) throw new Error("Worksheet pertama tidak ditemukan.");
    let sharedStrings = [];
    const sharedEntry = zip.file("xl/sharedStrings.xml");
    if (sharedEntry) {
      const sharedDoc = parseXml(await sharedEntry.async("string"));
      sharedStrings = [...sharedDoc.getElementsByTagName("si")].map((item) => [...item.getElementsByTagName("t")].map((node) => node.textContent || "").join(""));
    }
    const worksheet = parseXml(await sheetEntry.async("string"));
    const rows = [];
    [...worksheet.getElementsByTagName("row")].forEach((rowNode) => {
      const row = [];
      let fallbackIndex = 0;
      [...rowNode.getElementsByTagName("c")].forEach((cell) => {
        const reference = cell.getAttribute("r") || "";
        const letters = reference.match(/[A-Z]+/i);
        const index = letters ? columnIndex(letters[0]) : fallbackIndex;
        fallbackIndex = index + 1;
        const type = cell.getAttribute("t");
        const valueNode = cell.getElementsByTagName("v")[0];
        let value = "";
        if (type === "inlineStr") value = [...cell.getElementsByTagName("t")].map((node) => node.textContent || "").join("");
        else if (type === "s") value = sharedStrings[Number(valueNode?.textContent || 0)] ?? "";
        else if (type === "b") value = valueNode?.textContent === "1" ? "TRUE" : "FALSE";
        else value = valueNode?.textContent || "";
        row[index] = value;
      });
      rows.push(row);
    });
    return rows;
  }

  function parseXml(text) {
    const documentXml = new DOMParser().parseFromString(text, "application/xml");
    if (documentXml.querySelector("parsererror")) throw new Error("XML di dalam Excel rusak.");
    return documentXml;
  }

  function normalizeZipPath(path) {
    const resolved = [];
    String(path || "").replace(/\\/g, "/").split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") resolved.pop();
      else resolved.push(part);
    });
    return resolved.join("/");
  }

  function parseCsv(text) {
    const firstLine = text.slice(0, 4000).split(/\r?\n/)[0] || "";
    const candidates = [",", ";", "\t"];
    const delimiter = candidates.map((candidate) => ({ candidate, count: countOutsideQuotes(firstLine, candidate) })).sort((a, b) => b.count - a.count)[0].candidate;
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (character === '"') {
        if (quoted && next === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(cell); cell = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += character;
    }
    row.push(cell); rows.push(row);
    if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);
    return rows;
  }

  function countOutsideQuotes(line, needle) {
    let quoted = false;
    let count = 0;
    for (const character of line) {
      if (character === '"') quoted = !quoted;
      else if (character === needle && !quoted) count += 1;
    }
    return count;
  }

  function trimEmptyRows(rows) {
    const clean = rows.map((row) => row.map((cell) => normalizeText(cell)));
    while (clean.length && clean[0].every((cell) => !cell)) clean.shift();
    while (clean.length && clean.at(-1).every((cell) => !cell)) clean.pop();
    return clean;
  }

  function firstNonEmptyColumn(rows) {
    const maxColumns = Math.max(1, ...rows.slice(0, 30).map((row) => row.length));
    for (let column = 0; column < maxColumns; column += 1) {
      if (rows.some((row) => normalizeText(row[column]))) return column;
    }
    return 0;
  }

  function columnIndex(letters) {
    return String(letters).toUpperCase().split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }

  function columnName(index) {
    let value = Number(index) + 1;
    let name = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function normalizeText(value) {
    return value == null ? "" : String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function showToast(message, isError = false) {
    clearTimeout(state.toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.toggle("error", isError);
    ui.toast.classList.add("show");
    state.toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 3200);
  }

  init();
})();
