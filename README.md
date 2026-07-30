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

## Chrome Web Store用アセット

Chrome Web Storeの掲載に使用する画像は `store-assets/` で管理しています。

- `icon/`: ストア用の128×128アイコン
- `screenshot/`: 1280×800、24ビットRGB、アルファなしのスクリーンショット
- `promo/`: 440×280の小プロモーションタイルと1400×560のマーキープロモーションタイル

これらはストア掲載用の素材であり、配布用ZIPには含まれません。

## 権限

この拡張機能は `tabs` 権限を使用します。これは、開いているタブのタイトルとURLを取得するために必要です。

取得したタブのタイトルとURLは、拡張機能内で一時的に処理されます。タブ情報は保存されず、開発者または外部サーバーへ送信されることもありません。

ページ本文、フォームへの入力内容、Cookie、認証情報、過去の閲覧履歴は読み取りません。外部ライブラリやリモートコードも使用していません。フィードバックおよびOFUSEの外部ページは、ユーザーがリンクを選択した場合にのみ開きます。

詳細は[プライバシーポリシー](PRIVACY.md)をご確認ください。

## ファイル構成

```text
tab-link-exporter/
├─ manifest.json
├─ popup.html
├─ popup.css
├─ popup.js
├─ PRIVACY.md
├─ README.md
├─ scripts/
│  └─ build-package.ps1
├─ icons/
│  ├─ icon16.png
│  ├─ icon32.png
│  ├─ icon48.png
│  └─ icon128.png
└─ store-assets/
   ├─ icon/
   │  └─ icon128.png
   ├─ promo/
   │  ├─ small-440x280.png
   │  └─ marquee-1400x560.png
   └─ screenshot/
      ├─ 01-url-copy.png
      ├─ 02-title-url.png
      └─ 03-scrapbox.png
```

## 動作環境

- Google Chrome
- Manifest V3対応環境

## バージョン

- 1.3.7
