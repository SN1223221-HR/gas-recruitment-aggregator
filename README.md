# GAS Recruitment Aggregator

複数の管理用スプレッドシートから採用データを収集・統合し、直近1ヶ月の店舗別採用KPI（応募数、選考通過率、内定数など）を自動集計するGoogle Apps Script (GAS) アプリケーションです。

## 📖 Overview

散在する以下の3つのデータソースを一元的に集約し、採用活動中の店舗ごとのパフォーマンスを可視化します。

1.  **新店採用・研修管理表**: 店舗のOPEN日管理
2.  **店舗情報一覧**: 現在のステータス（OPEN/CLOSE等）管理
3.  **AR採用管理**: 候補者ごとの選考ステータス管理

## 🚀 Features

* **Multi-Source Aggregation**: 異なるスプレッドシート間のデータを店舗名キーで自動突合。
* **Smart Filtering**:
    * 「OPEN済み」かつ「採用活動中」の店舗のみを自動抽出。
    * 集計対象を「直近1ヶ月」のデータに自動フィルタリング。
* **KPI Tracking**: 応募、選考中、辞退、不採用、内定、入社の各フェーズを優先度付きロジックで正確にカウント（ダブルカウント防止）。
* **Robust Architecture**: Service/Repositoryパターンを採用。ビジネスロジックとデータアクセス層を分離し、高い保守性を確保。

## 🛠 Architecture

```
mermaid
graph TD
    subgraph Data Sources
        Store[新店採用・研修管理表]
        Info[店舗情報一覧]
        AR[AR採用管理]
    end

    subgraph GAS Application
        Repo[SheetRepository]
        Service[RecruitmentService]
        Main[Main Controller]
    end

    subgraph Output
        Result[AR_応募集計]
    end

    Store --> Repo
    Info --> Repo
    AR --> Repo
    Repo --> Service
    Service --> Main
    Main --> Repo
    Repo --> Result
```

⚙️ Setup & Configuration

本スクリプトはセキュリティ確保のため、スプレッドシートIDをコード内にハードコーディングせず、GASのスクリプトプロパティで管理する設計になっています。

1. Installation
Google Drive上で新規GASプロジェクトを作成、または clasp create。
Code.gs にソースコードを反映。

2. Environment Variables
GASエディタの「プロジェクトの設定 > スクリプトプロパティ」にて、以下のキーと値を設定してください。

Property Key,Description
```
SS_ID_STORE,新店採用・研修管理表のスプレッドシートID
SS_ID_STORE_INFO,店舗情報一覧のスプレッドシートID
SS_ID_AR,AR採用管理（応募データ）のスプレッドシートID
SS_ID_OUTPUT,集計結果を出力するスプレッドシートID
```

3. Internal Settings
カラム位置やシート名が変更になった場合は、コード内の CONFIG オブジェクトを修正してください。
```
const CONFIG = Object.freeze({
  SHEET_NAMES: { ... },
  COLS: { ... },
  // ...
});
```

💻 Usage
1.手動実行: エディタ上から main 関数を実行します。
2.定期実行: GASのトリガー機能を使用し、main 関数を日次（例: 毎朝9時）で実行設定することを推奨します。

```
📂 Directory Structure
src/
├── Code.js            # Entry point, Config, Service, Repository
└── appsscript.json    # Manifest file
```

📝 License

This project is licensed under the MIT License.
