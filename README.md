# Tab Link Exporter

Chromeで現在開いているタブのタイトルとURLを一覧化する、Manifest V3形式の拡張機能です。

## 主な機能

- 現在のウィンドウ、またはすべてのChromeウィンドウからタブを取得
- HTTP / HTTPSのWebページだけに絞り込み
- 次の形式で出力
  - URLのみ
  - タイトル + URL
  - Markdown
  - Scrapbox（現Cosense）
  - CSV
  - JSON
- クリップボードへコピー
- 最後に使用した設定をローカルに保存
- [Googleフォーム](https://docs.google.com/forms/d/e/1FAIpQLSch4KYJ68lTU_qY-siJ0CaKtTxbBTfoRv2wZa7h2bpbm5bTTg/viewform?usp=pp_url&entry.1006266992=Tab+Link+Exporter)からフィードバックを送信
- [OFUSE](https://ofuse.me/rutile3)から開発者を応援

## インストール方法

1. `tab-link-exporter.zip`を展開します。
2. Chromeのアドレスバーに `chrome://extensions` と入力します。
3. 右上の「デベロッパー モード」をオンにします。
4. 「パッケージ化されていない拡張機能を読み込む」を押します。
5. 展開した `tab-link-exporter` フォルダを選択します。
6. 必要に応じて、拡張機能メニューからツールバーへ固定します。

## 使い方

1. ツールバーの拡張機能アイコンを押します。
2. 「取得範囲」と「出力形式」を選択します。
3. 必要に応じて「Webページのみ」のチェックを切り替えます。
4. 「クリップボードにコピー」を押します。

## 配布用ZIPの作成

PowerShellでリポジトリのルートから次のコマンドを実行します。

```powershell
.\scripts\build-package.ps1
```

実行ポリシーによってスクリプトを実行できない場合は、次のコマンドを使用します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-package.ps1
```

スクリプトは `manifest.json` からバージョン番号を取得し、配布に必要なファイルだけを格納した `dist/tab-link-exporter-<バージョン>.zip` を生成します。ZIP直下のファイル構成も自動で検証します。

`dist/` は `.gitignore` に登録されているため、生成したZIPはGitの監視対象になりません。

## 権限

この拡張機能は `tabs` 権限を使用します。これは、開いているタブのタイトルとURLを取得するために必要です。

ページ本文の読み取り、閲覧履歴の収集、外部サーバーへの送信は行いません。外部ライブラリや外部通信も使用していません。

## ファイル構成

```text
tab-link-exporter/
├─ manifest.json
├─ popup.html
├─ popup.css
├─ popup.js
├─ README.md
├─ scripts/
│  └─ build-package.ps1
└─ icons/
   ├─ icon16.png
   ├─ icon32.png
   ├─ icon48.png
   └─ icon128.png
```

## 動作環境

- Google Chrome
- Manifest V3対応環境

## バージョン

- 1.3.1
