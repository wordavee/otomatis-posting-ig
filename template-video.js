(() => {
  "use strict";

  const DEFAULT_FPS = 24;
  const AUDIO_BITRATE = 192_000;

  function dataUriToFile(dataUri, name, mimeType = "audio/mpeg") {
    const comma = dataUri.indexOf(",");
    if (comma < 0) throw new Error("Data musik bawaan tidak valid.");
    const binary = atob(dataUri.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], name, { type: mimeType, lastModified: Date.now() });
  }

  function getDefaultMusicFile() {
    const asset = window.DEFAULT_MUSIC;
    if (!asset?.dataUri) throw new Error("Musik bawaan tidak ditemukan.");
    return dataUriToFile(asset.dataUri, asset.name || "musik-bawaan.mp3", asset.mimeType || "audio/mpeg");
  }

  function probeAudio(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      const cleanup = () => {
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
      };
      audio.addEventListener("loadedmetadata", () => {
        const duration = Number(audio.duration);
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error("Durasi musik tidak dapat dibaca."));
        else resolve({ duration });
      }, { once: true });
      audio.addEventListener("error", () => {
        cleanup();
        reject(new Error("File musik tidak dapat diputar oleh browser."));
      }, { once: true });
      audio.src = url;
    });
  }

  function formatDuration(seconds) {
    const totalHundredths = Math.max(0, Math.round((Number(seconds) || 0) * 100));
    const minutes = Math.floor(totalHundredths / 6000);
    const secs = Math.floor((totalHundredths % 6000) / 100);
    const hundredths = totalHundredths % 100;
    return `${minutes}:${String(secs).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function normalizeFileName(name) {
    return String(name || "video")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "video";
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function hasStableRuntime() {
    return Boolean(window.Mediabunny && window.VideoEncoder && window.AudioEncoder && window.AudioDecoder);
  }

  function videoBitrate(width, height) {
    const pixels = width * height;
    if (pixels >= 5_000_000) return 8_000_000;
    if (pixels >= 3_000_000) return 6_000_000;
    return 4_000_000;
  }

  function stableVideoCapability(width, height, fps) {
    return {
      width,
      height,
      bitrate: videoBitrate(width, height),
      framerate: fps,
      hardwareAcceleration: "prefer-hardware",
      fullCodecString: "avc1.420033",
    };
  }

  function stableVideoEncoding(width, height) {
    return {
      codec: "avc",
      fullCodecString: "avc1.420033",
      bitrate: videoBitrate(width, height),
      keyFrameInterval: 5,
      bitrateMode: "variable",
      latencyMode: "quality",
      hardwareAcceleration: "prefer-hardware",
      contentHint: "detail",
    };
  }

  function stableAudioCapability() {
    return {
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: AUDIO_BITRATE,
      fullCodecString: "mp4a.40.2",
    };
  }

  function stableAudioEncoding() {
    return {
      codec: "aac",
      bitrate: AUDIO_BITRATE,
      fullCodecString: "mp4a.40.2",
      transform: { sampleRate: 48_000, numberOfChannels: 2 },
    };
  }

  async function canUseStableMp4(width, height, fps) {
    if (!hasStableRuntime()) return false;
    try {
      const M = window.Mediabunny;
      const [videoOk, audioOk] = await Promise.all([
        M.canEncodeVideo("avc", stableVideoCapability(width, height, fps)),
        M.canEncodeAudio("aac", stableAudioCapability()),
      ]);
      return Boolean(videoOk && audioOk);
    } catch (error) {
      console.warn("Pemeriksaan MP4 stabil gagal", error);
      return false;
    }
  }

  async function encodeStableMp4({ musicFile, duration, width, height, fps, renderFrame, quote, onFrameProgress }) {
    const M = window.Mediabunny;
    let input = null;
    let output = null;
    try {
      input = new M.Input({ source: new M.BlobSource(musicFile), formats: M.ALL_FORMATS });
      const audioTrack = await input.getPrimaryAudioTrack();
      if (!audioTrack || !(await audioTrack.canDecode())) throw new Error("Codec musik tidak dapat dibaca oleh browser.");

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
      renderFrame(context, width, height, quote);

      const target = new M.BufferTarget();
      output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: "in-memory" }), target });
      const videoSource = new M.CanvasSource(canvas, stableVideoEncoding(width, height));
      const audioSource = new M.AudioSampleSource(stableAudioEncoding());
      output.addVideoTrack(videoSource, { frameRate: fps });
      output.addAudioTrack(audioSource);
      await output.start();

      const frameCount = Math.max(1, Math.ceil(duration * fps));
      const videoTask = (async () => {
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          const timestamp = frameIndex / fps;
          const frameDuration = Math.min(1 / fps, Math.max(0.001, duration - timestamp));
          await videoSource.add(timestamp, frameDuration);
          onFrameProgress?.((frameIndex + 1) / frameCount);
        }
        videoSource.close();
      })();

      const audioTask = (async () => {
        const sink = new M.AudioSampleSink(audioTrack);
        for await (const sample of sink.samples(0, duration)) {
          await audioSource.add(sample);
          sample.close();
        }
        audioSource.close();
      })();

      await Promise.all([videoTask, audioTask]);
      await output.finalize();
      if (!target.buffer) throw new Error("Encoder tidak menghasilkan file MP4.");
      return new Blob([target.buffer], { type: "video/mp4" });
    } catch (error) {
      try {
        if (output && !["finalized", "canceled"].includes(output.state)) await output.cancel();
      } catch (cancelError) {
        console.warn("Gagal menutup encoder", cancelError);
      }
      throw error;
    } finally {
      try { input?.dispose?.(); } catch (error) { console.warn("Gagal melepas input musik", error); }
    }
  }

  function getRecorderConfig() {
    if (typeof MediaRecorder === "undefined") return null;
    const options = [
      { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
      { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
      { mimeType: "video/webm", extension: "webm" },
      { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
      { mimeType: "video/mp4", extension: "mp4" },
    ];
    return options.find((item) => MediaRecorder.isTypeSupported(item.mimeType)) || null;
  }

  async function encodeRealtime({ musicFile, duration, width, height, fps, renderFrame, quote, onFrameProgress }) {
    const config = getRecorderConfig();
    if (!config) throw new Error("Browser ini belum mendukung pembuatan video.");

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("AudioContext tidak didukung oleh browser.");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    renderFrame(context, width, height, quote);

    const audioUrl = URL.createObjectURL(musicFile);
    const audio = document.createElement("audio");
    audio.src = audioUrl;
    audio.preload = "auto";
    audio.playsInline = true;

    let audioContext = null;
    let outputStream = null;
    let recorder = null;
    let redrawTimer = null;
    let progressTimer = null;

    try {
      audioContext = new AudioContextClass();
      const audioSource = audioContext.createMediaElementSource(audio);
      const audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);

      const canvasStream = canvas.captureStream(0);
      const canvasTrack = canvasStream.getVideoTracks()[0];
      outputStream = new MediaStream([
        canvasTrack,
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const chunks = [];
      recorder = new MediaRecorder(outputStream, {
        mimeType: config.mimeType,
        videoBitsPerSecond: videoBitrate(width, height),
        audioBitsPerSecond: AUDIO_BITRATE,
      });

      const done = new Promise((resolve, reject) => {
        recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) chunks.push(event.data); });
        recorder.addEventListener("stop", resolve, { once: true });
        recorder.addEventListener("error", () => reject(recorder.error || new Error("Perekam video gagal.")), { once: true });
      });
      const playbackDone = new Promise((resolve, reject) => {
        audio.addEventListener("ended", resolve, { once: true });
        audio.addEventListener("error", () => reject(new Error("Musik berhenti karena gagal diputar.")), { once: true });
      });

      await audioContext.resume();
      recorder.start(1000);
      canvasTrack.requestFrame?.();
      redrawTimer = setInterval(() => {
        renderFrame(context, width, height, quote);
        canvasTrack.requestFrame?.();
      }, Math.max(250, 1000 / fps));
      progressTimer = setInterval(() => onFrameProgress?.(Math.min(1, audio.currentTime / duration)), 200);
      await audio.play();
      await playbackDone;
      if (recorder.state !== "inactive") recorder.stop();
      await done;
      onFrameProgress?.(1);
      return {
        blob: new Blob(chunks, { type: config.mimeType }),
        extension: config.extension,
      };
    } finally {
      clearInterval(redrawTimer);
      clearInterval(progressTimer);
      if (recorder?.state && recorder.state !== "inactive") recorder.stop();
      outputStream?.getTracks().forEach((track) => track.stop());
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(audioUrl);
      await audioContext?.close().catch(() => {});
    }
  }

  async function exportBatch(options) {
    const {
      quotes,
      musicFile,
      duration,
      width,
      height,
      renderFrame,
      makeBaseName,
      zipName,
      onProgress,
      fps = DEFAULT_FPS,
    } = options;
    if (!quotes?.length) throw new Error("Tidak ada quotes untuk diekspor.");
    if (!musicFile) throw new Error("Musik belum tersedia.");

    let stable = await canUseStableMp4(width, height, fps);
    const recorderConfig = getRecorderConfig();
    if (!stable && !recorderConfig) throw new Error("Gunakan Chrome atau Edge terbaru agar video dapat dibuat.");

    const useZip = quotes.length > 1;
    if (useZip && typeof JSZip === "undefined") throw new Error("Komponen ZIP tidak tersedia.");
    const zip = useZip ? new JSZip() : null;
    let singleResult = null;
    let finalExtension = stable ? "mp4" : recorderConfig.extension;

    for (let index = 0; index < quotes.length; index += 1) {
      const quote = quotes[index];
      const baseProgress = index / quotes.length;
      const itemShare = 1 / quotes.length;
      onProgress?.({
        percent: baseProgress * 92,
        current: index,
        total: quotes.length,
        title: `Membuat video ${index + 1} dari ${quotes.length}`,
        detail: stable ? "MP4 H.264 + AAC sedang dirender." : "Mode kompatibilitas merekam sesuai durasi musik.",
      });

      let blob;
      if (stable) {
        try {
          blob = await encodeStableMp4({
            musicFile, duration, width, height, fps, renderFrame, quote,
            onFrameProgress: (ratio) => onProgress?.({
              percent: (baseProgress + itemShare * ratio) * 92,
              current: index + ratio,
              total: quotes.length,
              title: `Membuat video ${index + 1} dari ${quotes.length}`,
              detail: `${Math.round(ratio * 100)}% · ${width} × ${height} px · ${formatDuration(duration)}`,
            }),
          });
          finalExtension = "mp4";
        } catch (error) {
          if (index > 0 || !recorderConfig) throw error;
          console.warn("Encoder MP4 stabil gagal, beralih ke mode kompatibilitas.", error);
          stable = false;
          onProgress?.({
            percent: baseProgress * 92,
            current: index,
            total: quotes.length,
            title: "Beralih ke mode kompatibilitas…",
            detail: "Video akan direkam sesuai durasi musik.",
          });
        }
      }
      if (!stable) {
        const result = await encodeRealtime({
          musicFile, duration, width, height, fps, renderFrame, quote,
          onFrameProgress: (ratio) => onProgress?.({
            percent: (baseProgress + itemShare * ratio) * 92,
            current: index + ratio,
            total: quotes.length,
            title: `Merekam video ${index + 1} dari ${quotes.length}`,
            detail: `${Math.round(ratio * 100)}% · jangan tutup tab selama musik berjalan`,
          }),
        });
        blob = result.blob;
        finalExtension = result.extension;
      }

      const baseName = normalizeFileName(makeBaseName(index, quote));
      const fileName = `${baseName}.${finalExtension}`;
      if (zip) zip.file(fileName, blob, { binary: true });
      else singleResult = { blob, fileName };
    }

    if (zip) {
      zip.file("INFO.txt", [
        `Jumlah video: ${quotes.length}`,
        `Ukuran: ${width} x ${height} px`,
        `Durasi setiap video: ${formatDuration(duration)}`,
        `Musik: ${musicFile.name}`,
        `Format: ${finalExtension.toUpperCase()}`,
        "Setiap quotes dibuat menjadi satu video dengan durasi mengikuti musik.",
      ].join("\n"));
      onProgress?.({ percent: 94, current: quotes.length, total: quotes.length, title: "Mengemas ZIP…", detail: "Menyiapkan semua video untuk diunduh." });
      const output = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true }, (metadata) => {
        onProgress?.({ percent: 94 + metadata.percent * .06, current: quotes.length, total: quotes.length, title: "Mengemas ZIP…", detail: `${Math.round(metadata.percent)}%` });
      });
      downloadBlob(output, zipName);
    } else {
      downloadBlob(singleResult.blob, singleResult.fileName);
    }

    onProgress?.({ percent: 100, current: quotes.length, total: quotes.length, title: "Video selesai!", detail: `${formatDuration(duration)} · ${width} × ${height} px · ${finalExtension.toUpperCase()}` });
    return { extension: finalExtension, stable, count: quotes.length };
  }

  window.TemplateVideo = {
    getDefaultMusicFile,
    probeAudio,
    formatDuration,
    exportBatch,
  };
})();
