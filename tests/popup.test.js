"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const popupSource = fs.readFileSync(
  path.resolve(__dirname, "..", "popup.js"),
  "utf8"
);

const REQUIRED_SELECTORS = [
  "#scopeSelect",
  "#formatSelect",
  "#webOnlyCheckbox",
  "#resultText",
  "#tabCount",
  "#statusMessage",
  "#refreshButton",
  "#copyButton"
];

function createMockElement(selector) {
  const element = {
    value: selector === "#scopeSelect"
      ? "current"
      : selector === "#formatSelect"
        ? "url"
        : "",
    checked: true,
    disabled: false,
    textContent: "",
    errorClass: false,
    listeners: [],
    focusCalls: 0,
    selectCalls: 0,
    addEventListener(type, handler) {
      this.listeners.push({ type, handler });
    },
    focus() {
      this.focusCalls++;
    },
    select() {
      this.selectCalls++;
    }
  };

  element.classList = {
    toggle(_name, value) {
      element.errorClass = value;
    }
  };

  return element;
}

function createPopupContext(options = {}) {
  const elements = new Map();
  const calls = {
    queriedSelectors: [],
    tabQueries: [],
    clipboardWrites: [],
    execCommand: 0,
    savedSettings: null
  };

  function getElement(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, createMockElement(selector));
    }

    return elements.get(selector);
  }

  const context = {
    document: {
      querySelector(selector) {
        calls.queriedSelectors.push(selector);
        return selector === options.missingSelector
          ? null
          : getElement(selector);
      },
      execCommand(command) {
        assert.equal(command, "copy");
        calls.execCommand++;
        return options.execCommandResult ?? true;
      }
    },
    localStorage: {
      getItem() {
        return options.savedSettings === undefined
          ? null
          : JSON.stringify(options.savedSettings);
      },
      setItem(_key, value) {
        calls.savedSettings = value;
      },
      removeItem() {}
    },
    chrome: {
      tabs: {
        async query(query) {
          calls.tabQueries.push(query);
          return options.tabs ?? [];
        }
      }
    },
    navigator: {
      clipboard: {
        async writeText(value) {
          calls.clipboardWrites.push(value);

          if (options.clipboardError) {
            throw options.clipboardError;
          }
        }
      }
    },
    console,
    setTimeout
  };

  vm.createContext(context);
  vm.runInContext(popupSource, context);

  return {
    calls,
    context,
    getElement,
    settle: () => new Promise(setImmediate)
  };
}

function createTabs() {
  return [
    {
      title: " Example ",
      url: "https://example.com",
      pinned: true,
      windowId: 1,
      index: 0
    },
    {
      title: "Chrome",
      url: "chrome://extensions",
      pinned: false,
      windowId: 1,
      index: 1
    }
  ];
}

test("必須のDOM要素をすべて取得する", () => {
  const { calls } = createPopupContext();

  assert.deepEqual(
    calls.queriedSelectors,
    REQUIRED_SELECTORS
  );
});

test("必須のDOM要素がない場合はセレクターを含むエラーになる", () => {
  const missingSelector = "#resultText";

  assert.throws(
    () => createPopupContext({ missingSelector }),
    new RegExp(missingSelector)
  );
});

test("有効な保存設定だけを画面へ反映する", () => {
  const valid = createPopupContext({
    savedSettings: {
      scope: "all",
      format: "markdown",
      webOnly: false
    }
  });

  assert.equal(valid.getElement("#scopeSelect").value, "all");
  assert.equal(valid.getElement("#formatSelect").value, "markdown");
  assert.equal(valid.getElement("#webOnlyCheckbox").checked, false);

  const invalid = createPopupContext({
    savedSettings: {
      scope: "invalid",
      format: "text",
      webOnly: "yes"
    }
  });

  assert.equal(invalid.getElement("#scopeSelect").value, "current");
  assert.equal(invalid.getElement("#formatSelect").value, "url");
  assert.equal(invalid.getElement("#webOnlyCheckbox").checked, true);
});

test("現在の画面設定を生成して保存する", () => {
  const popup = createPopupContext();

  popup.getElement("#scopeSelect").value = "all";
  popup.getElement("#formatSelect").value = "json";
  popup.getElement("#webOnlyCheckbox").checked = false;

  const settings = JSON.parse(
    JSON.stringify(popup.context.getCurrentSettings())
  );

  assert.deepEqual(settings, {
    scope: "all",
    format: "json",
    webOnly: false
  });

  popup.context.saveSettings();
  assert.deepEqual(
    JSON.parse(popup.calls.savedSettings),
    settings
  );
});

test("Webページ限定とタブの並び順を正規化する", () => {
  const { context } = createPopupContext();
  const tabs = [
    {
      title: "Chrome",
      url: "chrome://extensions",
      windowId: 1,
      index: 1
    },
    {
      title: " Example ",
      url: "https://example.com",
      pinned: true,
      windowId: 1,
      index: 0
    },
    {
      title: "",
      url: "file:///example.txt",
      windowId: 2,
      index: 0
    }
  ];

  const webTabs = JSON.parse(
    JSON.stringify(context.normalizeTabs(tabs, true))
  );
  const allTabs = JSON.parse(
    JSON.stringify(context.normalizeTabs(tabs, false))
  );

  assert.equal(webTabs.length, 1);
  assert.equal(webTabs[0].url, "https://example.com");
  assert.equal(webTabs[0].title, "Example");
  assert.deepEqual(
    allTabs.map((tab) => [tab.windowId, tab.index]),
    [[1, 0], [1, 1], [2, 0]]
  );
  assert.notEqual(allTabs[2].title, "");
});

test("各出力形式でタブを整形する", () => {
  const { context } = createPopupContext();
  const tabs = [
    {
      title: "Example [A]",
      url: "https://example.com/a",
      pinned: false,
      windowId: 1,
      index: 0
    },
    {
      title: 'Quote, "B"',
      url: "https://example.com/b",
      pinned: true,
      windowId: 2,
      index: 3
    }
  ];

  assert.equal(
    context.formatUrl(tabs),
    "https://example.com/a\nhttps://example.com/b"
  );
  assert.equal(
    context.formatTitleUrl(tabs),
    'Example [A]\nhttps://example.com/a\n\nQuote, "B"\nhttps://example.com/b'
  );
  assert.equal(
    context.formatMarkdown(tabs),
    '- [Example \\[A\\]](https://example.com/a)\n- [Quote, "B"](https://example.com/b)'
  );
  assert.equal(
    context.formatScrapbox(tabs),
    '[https://example.com/a Example [A]]\n[https://example.com/b Quote, "B"]'
  );
  assert.equal(
    context.formatCsv(tabs),
    [
      '"title","url","pinned","windowId","index"',
      '"Example [A]","https://example.com/a","false","1","0"',
      '"Quote, ""B""","https://example.com/b","true","2","3"'
    ].join("\r\n")
  );
  assert.equal(
    context.formatJson(tabs),
    JSON.stringify(tabs, null, 2)
  );
});

test("不明な出力形式はURL形式へフォールバックする", () => {
  const { context } = createPopupContext();
  const tabs = createTabs();

  assert.equal(
    context.formatTabs(tabs, "unknown"),
    context.formatUrl(tabs)
  );
});

test("タブ取得結果を描画する", async () => {
  const popup = createPopupContext({
    tabs: [createTabs()[0]]
  });

  await popup.settle();

  assert.deepEqual(
    JSON.parse(JSON.stringify(popup.calls.tabQueries)),
    [{ currentWindow: true }]
  );
  assert.equal(
    popup.getElement("#resultText").value,
    "https://example.com"
  );
  assert.equal(
    popup.getElement("#tabCount").textContent,
    "1件"
  );
  assert.equal(
    popup.getElement("#copyButton").disabled,
    false
  );
});

test("Clipboard APIで出力結果をコピーする", async () => {
  const popup = createPopupContext();

  await popup.settle();
  popup.getElement("#resultText").value = "test";
  await popup.context.copyResult();

  assert.deepEqual(popup.calls.clipboardWrites, ["test"]);
  assert.equal(popup.calls.execCommand, 0);
  assert.equal(
    popup.getElement("#statusMessage").errorClass,
    false
  );
});

test("Clipboard API失敗時はexecCommandへフォールバックする", async () => {
  const popup = createPopupContext({
    clipboardError: new Error("clipboard failed"),
    execCommandResult: true
  });

  await popup.settle();
  const resultText = popup.getElement("#resultText");
  resultText.value = "test";
  await popup.context.copyResult();

  assert.equal(resultText.focusCalls, 1);
  assert.equal(resultText.selectCalls, 1);
  assert.equal(popup.calls.execCommand, 1);
  assert.equal(
    popup.getElement("#statusMessage").errorClass,
    false
  );
});

test("両方のコピー方式が失敗した場合はエラー表示する", async () => {
  const popup = createPopupContext({
    clipboardError: new Error("clipboard failed"),
    execCommandResult: false
  });

  await popup.settle();
  popup.getElement("#resultText").value = "test";
  await popup.context.copyResult();

  assert.equal(popup.calls.execCommand, 1);
  assert.equal(
    popup.getElement("#statusMessage").errorClass,
    true
  );
});
