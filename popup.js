"use strict";

const scopeSelect = document.querySelector("#scopeSelect");
const formatSelect = document.querySelector("#formatSelect");
const webOnlyCheckbox = document.querySelector("#webOnlyCheckbox");
const resultText = document.querySelector("#resultText");
const tabCount = document.querySelector("#tabCount");
const statusMessage = document.querySelector("#statusMessage");
const refreshButton = document.querySelector("#refreshButton");
const copyButton = document.querySelector("#copyButton");

let currentTabs = [];

const SETTINGS_KEY = "tabLinkExporterSettings";

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (saved.scope === "current" || saved.scope === "all") {
      scopeSelect.value = saved.scope;
    }

    const formats = new Set([
      "title-url",
      "url",
      "markdown",
      "scrapbox",
      "csv",
      "json"
    ]);
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

function getErrorMessage(error) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.length > 0
  ) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "不明なエラーが発生しました。";
}

function isWebUrl(url) {
  return /^https?:\/\//i.test(url);
}

function normalizeTabs(tabs, webOnly) {
  return tabs
    .filter((tab) => typeof tab.url === "string" && tab.url.length > 0)
    .filter((tab) => !webOnly || isWebUrl(tab.url))
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

function formatUrl(tabs) {
  return tabs.map((tab) => tab.url).join("\n");
}

function formatTitleUrl(tabs) {
  return tabs.map((tab) => `${tab.title}\n${tab.url}`).join("\n\n");
}

function formatMarkdown(tabs) {
  return tabs
    .map((tab) => `- [${escapeMarkdown(tab.title)}](${tab.url})`)
    .join("\n");
}

function formatScrapbox(tabs) {
  return tabs.map((tab) => `[${tab.url} ${tab.title}]`).join("\n");
}

function formatCsv(tabs) {
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

function formatJson(tabs) {
  return JSON.stringify(tabs, null, 2);
}

function formatTabs(tabs, format) {
  switch (format) {
    case "url": return formatUrl(tabs);
    case "title-url": return formatTitleUrl(tabs);
    case "markdown": return formatMarkdown(tabs);
    case "scrapbox": return formatScrapbox(tabs);
    case "csv": return formatCsv(tabs);
    case "json": return formatJson(tabs);
    default: return formatUrl(tabs);
  }
}

function render() {
  const output = formatTabs(currentTabs, formatSelect.value);
  resultText.value = output;
  tabCount.textContent = `${currentTabs.length}件`;

  const hasResults = currentTabs.length > 0;
  copyButton.disabled = !hasResults;
}

async function fetchTabs() {
  saveSettings();
  setStatus("取得中…");
  refreshButton.disabled = true;

  try {
    const query = scopeSelect.value === "current" ? { currentWindow: true } : {};
    const tabs = await chrome.tabs.query(query);
    currentTabs = normalizeTabs(tabs, webOnlyCheckbox.checked);
    render();

    if (currentTabs.length === 0) {
      setStatus("条件に一致するタブがありません。");
    } else {
      setStatus(`${currentTabs.length}件のタブを取得しました。`);
    }
  } catch (error) {
    currentTabs = [];
    render();
    setStatus(`取得に失敗しました: ${getErrorMessage(error)}`, true);
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
      copied
        ? "クリップボードにコピーしました。"
        : `コピーに失敗しました: ${getErrorMessage(error)}`,
      !copied
    );
  }
}

function initialize() {
  scopeSelect.addEventListener("change", fetchTabs);
  webOnlyCheckbox.addEventListener("change", fetchTabs);

  formatSelect.addEventListener("change", () => {
    saveSettings();
    render();
    setStatus(`${currentTabs.length}件を再整形しました。`);
  });

  refreshButton.addEventListener("click", fetchTabs);
  copyButton.addEventListener("click", copyResult);

  loadSettings();
  fetchTabs();
}

initialize();
