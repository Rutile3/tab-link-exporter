"use strict";

const scopeSelect = document.querySelector("#scopeSelect");
const formatSelect = document.querySelector("#formatSelect");
const webOnlyCheckbox = document.querySelector("#webOnlyCheckbox");
const resultText = document.querySelector("#resultText");
const tabCount = document.querySelector("#tabCount");
const statusMessage = document.querySelector("#statusMessage");
const refreshButton = document.querySelector("#refreshButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");

let currentTabs = [];

const SETTINGS_KEY = "tabLinkExporterSettings";

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (saved.scope === "current" || saved.scope === "all") {
      scopeSelect.value = saved.scope;
    }

    const formats = new Set(["title-url", "url", "markdown", "csv", "json"]);
    if (formats.has(saved.format)) {
      formatSelect.value = saved.format;
    }

    if (typeof saved.webOnly === "boolean") {
      webOnlyCheckbox.checked = saved.webOnly;
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      scope: scopeSelect.value,
      format: formatSelect.value,
      webOnly: webOnlyCheckbox.checked
    })
  );
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function isWebUrl(url) {
  return /^https?:\/\//i.test(url);
}

function normalizeTabs(tabs) {
  return tabs
    .filter((tab) => typeof tab.url === "string" && tab.url.length > 0)
    .filter((tab) => !webOnlyCheckbox.checked || isWebUrl(tab.url))
    .sort((a, b) => {
      if (a.windowId !== b.windowId) {
        return a.windowId - b.windowId;
      }
      return a.index - b.index;
    })
    .map((tab) => ({
      title: tab.title?.trim() || "タイトルなし",
      url: tab.url,
      pinned: Boolean(tab.pinned),
      windowId: tab.windowId,
      index: tab.index
    }));
}

function escapeMarkdown(text) {
  return text.replace(/([\\[\]])/g, "\\$1");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function formatTabs(tabs, format) {
  switch (format) {
    case "url":
      return tabs.map((tab) => tab.url).join("\n");

    case "markdown":
      return tabs
        .map((tab) => `- [${escapeMarkdown(tab.title)}](${tab.url})`)
        .join("\n");

    case "csv": {
      const header = ["title", "url", "pinned", "windowId", "index"];
      const rows = tabs.map((tab) => [
        tab.title,
        tab.url,
        tab.pinned,
        tab.windowId,
        tab.index
      ]);
      return [header, ...rows]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n");
    }

    case "json":
      return JSON.stringify(tabs, null, 2);

    case "title-url":
    default:
      return tabs.map((tab) => `${tab.title}\n${tab.url}`).join("\n\n");
  }
}

function render() {
  const output = formatTabs(currentTabs, formatSelect.value);
  resultText.value = output;
  tabCount.textContent = `${currentTabs.length}件`;

  const hasResults = currentTabs.length > 0;
  copyButton.disabled = !hasResults;
  downloadButton.disabled = !hasResults;
}

async function fetchTabs() {
  saveSettings();
  setStatus("取得中…");
  refreshButton.disabled = true;

  try {
    const query = scopeSelect.value === "current" ? { currentWindow: true } : {};
    const tabs = await chrome.tabs.query(query);
    currentTabs = normalizeTabs(tabs);
    render();

    if (currentTabs.length === 0) {
      setStatus("条件に一致するタブがありません。");
    } else {
      setStatus(`${currentTabs.length}件のタブを取得しました。`);
    }
  } catch (error) {
    currentTabs = [];
    render();
    setStatus(`取得に失敗しました: ${error.message}`, true);
  } finally {
    refreshButton.disabled = false;
  }
}

async function copyResult() {
  if (!resultText.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(resultText.value);
    setStatus("クリップボードにコピーしました。");
  } catch (error) {
    resultText.focus();
    resultText.select();

    const copied = document.execCommand("copy");
    setStatus(
      copied ? "クリップボードにコピーしました。" : `コピーに失敗しました: ${error.message}`,
      !copied
    );
  }
}

function getDownloadInfo() {
  const format = formatSelect.value;

  if (format === "csv") {
    return { extension: "csv", mime: "text/csv;charset=utf-8", bom: "\uFEFF" };
  }

  if (format === "json") {
    return { extension: "json", mime: "application/json;charset=utf-8", bom: "" };
  }

  if (format === "markdown") {
    return { extension: "md", mime: "text/markdown;charset=utf-8", bom: "\uFEFF" };
  }

  return { extension: "txt", mime: "text/plain;charset=utf-8", bom: "\uFEFF" };
}

function downloadResult() {
  if (!resultText.value) {
    return;
  }

  try {
    const { extension, mime, bom } = getDownloadInfo();
    const timestamp = new Date()
      .toLocaleString("sv-SE")
      .replace(" ", "_")
      .replaceAll(":", "");
    const filename = `tab-links_${timestamp}.${extension}`;

    const blob = new Blob([bom, resultText.value], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${filename} を保存しました。`);
  } catch (error) {
    setStatus(`保存に失敗しました: ${error.message}`, true);
  }
}

scopeSelect.addEventListener("change", fetchTabs);
webOnlyCheckbox.addEventListener("change", fetchTabs);

formatSelect.addEventListener("change", () => {
  saveSettings();
  render();
  setStatus(`${currentTabs.length}件を再整形しました。`);
});

refreshButton.addEventListener("click", fetchTabs);
copyButton.addEventListener("click", copyResult);
downloadButton.addEventListener("click", downloadResult);

loadSettings();
fetchTabs();
