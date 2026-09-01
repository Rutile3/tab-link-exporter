"use strict";

/**
 * 必須のDOM要素を取得する。
 *
 * @param {string} selector CSSセレクター
 * @returns {Element} 取得したDOM要素
 * @throws {Error} 要素が存在しない場合
 */
function getRequiredElement(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`必須のDOM要素が見つかりません: ${selector}`);
  }

  return element;
}

const scopeSelect = getRequiredElement("#scopeSelect");
const formatSelect = getRequiredElement("#formatSelect");
const webOnlyCheckbox = getRequiredElement("#webOnlyCheckbox");
const resultText = getRequiredElement("#resultText");
const tabCount = getRequiredElement("#tabCount");
const statusMessage = getRequiredElement("#statusMessage");
const refreshButton = getRequiredElement("#refreshButton");
const copyButton = getRequiredElement("#copyButton");
const customTemplateField = getRequiredElement("#customTemplateField");
const customTemplateInput = getRequiredElement("#customTemplateInput");

/** @type {NormalizedTab[]} */
let currentTabs = [];

const SETTINGS_KEY = "tabLinkExporterSettings";
const DEFAULT_CUSTOM_TEMPLATE = "{{title}}\n{{url}}";

/**
 * Chromeから取得したタブ情報。
 *
 * @typedef {Object} ChromeTab
 * @property {string} [title] タブのタイトル
 * @property {string} [url] タブのURL
 * @property {boolean} [pinned] 固定タブかどうか
 * @property {number} windowId ウィンドウID
 * @property {number} index ウィンドウ内のタブ位置
 */

/**
 * 出力処理で使用する正規化済みのタブ情報。
 *
 * @typedef {Object} NormalizedTab
 * @property {string} title タブのタイトル
 * @property {string} url タブのURL
 * @property {boolean} pinned 固定タブかどうか
 * @property {number} windowId ウィンドウID
 * @property {number} index ウィンドウ内のタブ位置
 */

/**
 * 拡張機能の画面設定。
 *
 * @typedef {Object} Settings
 * @property {"current"|"all"} scope タブの取得範囲
 * @property {"url"|"title-url"|"markdown"|"scrapbox"|"csv"|"json"|"custom"} format 出力形式
 * @property {boolean} webOnly Webページだけに絞り込むかどうか
 * @property {string} customTemplate カスタムテンプレート
 */

/**
 * 保存済みの設定を読み込み、画面へ反映する。
 *
 * @returns {void}
 */
function loadSettings() {
  try {
    /** @type {Partial<Settings>} */
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
      "json",
      "custom"
    ]);
    if (formats.has(saved.format)) {
      formatSelect.value = saved.format;
    }

    if (typeof saved.webOnly === "boolean") {
      webOnlyCheckbox.checked = saved.webOnly;
    }

    if (typeof saved.customTemplate === "string") {
      customTemplateInput.value = saved.customTemplate;
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

/**
 * 現在の画面設定を取得する。
 *
 * @returns {Settings} 現在の画面設定
 */
function getCurrentSettings() {
  return {
    scope: scopeSelect.value,
    format: formatSelect.value,
    webOnly: webOnlyCheckbox.checked,
    customTemplate: customTemplateInput.value
  };
}

/**
 * 現在の画面設定をローカルストレージへ保存する。
 *
 * @returns {void}
 */
function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(getCurrentSettings())
  );
}

/**
 * ステータスメッセージを画面へ表示する。
 *
 * @param {string} message 表示するメッセージ
 * @param {boolean} [isError=false] エラー表示にするかどうか
 * @returns {void}
 */
function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

/**
 * 例外値から表示用のエラーメッセージを取得する。
 *
 * @param {unknown} error 例外値
 * @returns {string} 表示用のエラーメッセージ
 */
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

/**
 * URLがHTTPまたはHTTPSかどうかを判定する。
 *
 * @param {string} url 判定するURL
 * @returns {boolean} WebページのURLの場合はtrue
 */
function isWebUrl(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * タブを絞り込み、ウィンドウとタブ位置の順に並べて正規化する。
 *
 * @param {ChromeTab[]} tabs Chromeから取得したタブ情報
 * @param {boolean} webOnly Webページのタブだけに絞り込むかどうか
 * @returns {NormalizedTab[]} 正規化済みのタブ情報
 */
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

/**
 * Markdownのリンクテキストで特別扱いされる文字をエスケープする。
 *
 * @param {string} text エスケープする文字列
 * @returns {string} エスケープ済みの文字列
 */
function escapeMarkdown(text) {
  return text.replace(/([\\[\]])/g, "\\$1");
}

/**
 * 値をCSVのフィールドとして二重引用符で囲み、引用符をエスケープする。
 *
 * @param {unknown} value CSVへ出力する値
 * @returns {string} CSV用にエスケープした文字列
 */
function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * タブをURLのみの形式へ整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @returns {string} 整形済みの文字列
 */
function formatUrl(tabs) {
  return tabs.map((tab) => tab.url).join("\n");
}

/**
 * タブをタイトルとURLの形式へ整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @returns {string} 整形済みの文字列
 */
function formatTitleUrl(tabs) {
  return tabs.map((tab) => `${tab.title}\n${tab.url}`).join("\n\n");
}

/**
 * タブをMarkdownのリンク一覧へ整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @returns {string} 整形済みの文字列
 */
function formatMarkdown(tabs) {
  return tabs
    .map((tab) => `- [${escapeMarkdown(tab.title)}](${tab.url})`)
    .join("\n");
}

/**
 * タブをScrapbox（現Cosense）のリンク一覧へ整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @returns {string} 整形済みの文字列
 */
function formatScrapbox(tabs) {
  return tabs.map((tab) => `[${tab.url} ${tab.title}]`).join("\n");
}

/**
 * タブをヘッダー付きのCSVへ整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @returns {string} CRLF区切りのCSV文字列
 */
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

/**
 * タブをインデント付きのJSONへ整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @returns {string} JSON文字列
 */
function formatJson(tabs) {
  return JSON.stringify(tabs, null, 2);
}

/**
 * 1件のタブ情報をカスタムテンプレートへ適用する。
 *
 * @param {NormalizedTab} tab 正規化済みのタブ情報
 * @param {string} template カスタムテンプレート
 * @returns {string} 置換済みの文字列
 */
function formatCustomTab(tab, template) {
  return template
    .replaceAll("{{title}}", tab.title)
    .replaceAll("{{url}}", tab.url);
}

/**
 * タブをカスタムテンプレートで整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @param {string} template カスタムテンプレート
 * @returns {string} 改行で連結した整形済みの文字列
 */
function formatCustom(tabs, template) {
  if (template.length === 0) {
    return "";
  }

  return tabs
    .map((tab) => formatCustomTab(tab, template))
    .join("\n");
}

/**
 * 指定された出力形式に応じてタブを整形する。
 *
 * @param {NormalizedTab[]} tabs 正規化済みのタブ情報
 * @param {string} format 出力形式
 * @param {string} [customTemplate=""] カスタムテンプレート
 * @returns {string} 整形済みの文字列
 */
function formatTabs(tabs, format, customTemplate = "") {
  switch (format) {
    case "url": return formatUrl(tabs);
    case "title-url": return formatTitleUrl(tabs);
    case "markdown": return formatMarkdown(tabs);
    case "scrapbox": return formatScrapbox(tabs);
    case "csv": return formatCsv(tabs);
    case "json": return formatJson(tabs);
    case "custom": return formatCustom(tabs, customTemplate);
    default: return formatUrl(tabs);
  }
}

/**
 * 現在のタブ情報を選択中の形式で画面へ描画する。
 *
 * @returns {void}
 */
function render() {
  const output = formatTabs(
    currentTabs,
    formatSelect.value,
    customTemplateInput.value
  );
  resultText.value = output;
  tabCount.textContent = `${currentTabs.length}件`;

  const hasResults = currentTabs.length > 0;
  copyButton.disabled = !hasResults || output.length === 0;
}

/**
 * 選択中の取得条件でChromeのタブを取得し、画面を更新する。
 *
 * @returns {Promise<void>}
 */
async function fetchTabs() {
  saveSettings();
  setStatus("取得中…");
  refreshButton.disabled = true;

  try {
    const query = scopeSelect.value === "current" ? { currentWindow: true } : {};
    const tabs = await chrome.tabs.query(query);
    currentTabs = normalizeTabs(tabs, webOnlyCheckbox.checked);
    render();

    setStatus(
      currentTabs.length === 0
        ? "条件に一致するタブがありません。"
        : `${currentTabs.length}件のタブを取得しました。`
    );
  } catch (error) {
    currentTabs = [];
    render();
    setStatus(`取得に失敗しました: ${getErrorMessage(error)}`, true);
  } finally {
    refreshButton.disabled = false;
  }
}

/**
 * execCommandを使って出力結果をクリップボードへコピーする。
 *
 * @returns {boolean} コピーに成功した場合はtrue
 */
function copyWithExecCommand() {
  resultText.focus();
  resultText.select();
  return document.execCommand("copy");
}

/**
 * 現在の出力結果をクリップボードへコピーする。
 *
 * @returns {Promise<void>}
 */
async function copyResult() {
  if (!resultText.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(resultText.value);
    setStatus("クリップボードにコピーしました。");
  } catch (error) {
    const copied = copyWithExecCommand();
    setStatus(
      copied
        ? "クリップボードにコピーしました。"
        : `コピーに失敗しました: ${getErrorMessage(error)}`,
      !copied
    );
  }
}

/**
 * 出力形式の変更を保存し、取得済みのタブを再整形する。
 *
 * @returns {void}
 */
function handleFormatChange() {
  updateCustomTemplateVisibility();
  saveSettings();
  render();
  setStatus(`${currentTabs.length}件を再整形しました。`);
}

/**
 * カスタムテンプレートの入力内容を取得結果へ反映する。
 *
 * @returns {void}
 */
function handleCustomTemplateInput() {
  saveSettings();
  render();
  setStatus(`${currentTabs.length}件を再整形しました。`);
}

/**
 * 選択中の出力形式に応じてカスタムテンプレート欄を表示する。
 *
 * @returns {void}
 */
function updateCustomTemplateVisibility() {
  const isCustom = formatSelect.value === "custom";
  customTemplateField.hidden = !isCustom;
  resultText.classList.toggle("compact", isCustom);
}

/**
 * イベントリスナーを登録し、保存済み設定とタブ一覧を読み込む。
 *
 * @returns {void}
 */
function initialize() {
  scopeSelect.addEventListener("change", fetchTabs);
  webOnlyCheckbox.addEventListener("change", fetchTabs);
  formatSelect.addEventListener("change", handleFormatChange);
  customTemplateInput.addEventListener("input", handleCustomTemplateInput);
  refreshButton.addEventListener("click", fetchTabs);
  copyButton.addEventListener("click", copyResult);

  customTemplateInput.value = DEFAULT_CUSTOM_TEMPLATE;
  loadSettings();
  updateCustomTemplateVisibility();
  fetchTabs();
}

initialize();
