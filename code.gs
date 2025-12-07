/**
 * Recruitment Data Aggregator
 * 採用データ統合集計スクリプト
 * * 複数のスプレッドシートを集約し、店舗ごとの直近1ヶ月の応募・選考状況を集計する。
 */

// ==========================================
// 1. Configuration & Constants
// ==========================================

const CONFIG = Object.freeze({
  SYSTEM: {
    TIMEZONE: 'Asia/Tokyo',
    DATE_FORMAT: 'yyyy/MM/dd',
    TIMESTAMP_FORMAT: 'yyyy/MM/dd HH:mm'
  },
  // Script Properties または 直接入力でIDを管理
  // ※ ハードコーディングする場合は下記のfallback値として記述
  SS_IDS: {
    STORE:      PropertiesService.getScriptProperties().getProperty('SS_ID_STORE')      || '',
    STORE_INFO: PropertiesService.getScriptProperties().getProperty('SS_ID_STORE_INFO') || '',
    AR:         PropertiesService.getScriptProperties().getProperty('SS_ID_AR')         || '',
    OUTPUT:     PropertiesService.getScriptProperties().getProperty('SS_ID_OUTPUT')     || ''
  },
  SHEET_NAMES: {
    STORE:      '新店採用・研修管理表',
    STORE_INFO: '店舗情報一覧',
    AR:         'AR採用管理（2024.2-）',
    OUTPUT:     'AR_応募集計'
  },
  // カラム定義 (0-based index)
  COLS: {
    STORE: {
      NAME: 2,      // C
      OPEN_DATE: 4  // E
    },
    STORE_INFO: {
      NAME: 2,      // C
      STATUS: 7     // H
    },
    AR: {
      APPLIED_AT: 0,       // A
      DESIRED_LOCATION: 12, // M
      DOC_RESULT: 26,       // 書類選考結果
      INTERVIEW_RESULT: 63, // 面接結果
      IS_NAITEI: 74,        // 内定フラグ
      JOINED_AT: 75         // 入社日
    }
  },
  STATUS_KEYWORDS: {
    OPEN: 'OPEN',
    PASS: '合格',
    REJECT: '不採用',
    DECLINE: '辞退'
  }
});

// ==========================================
// 2. Main Entry Point
// ==========================================

function main() {
  try {
    console.time('Execution Time');
    validateConfig();

    // Data Fetching
    const repo = new SheetRepository();
    const rawData = {
      store:     repo.fetchData(CONFIG.SS_IDS.STORE, CONFIG.SHEET_NAMES.STORE),
      storeInfo: repo.fetchData(CONFIG.SS_IDS.STORE_INFO, CONFIG.SHEET_NAMES.STORE_INFO),
      ar:        repo.fetchData(CONFIG.SS_IDS.AR, CONFIG.SHEET_NAMES.AR)
    };

    // Business Logic
    const service = new RecruitmentService();
    
    // 1. 対象店舗の特定 (OPENかつ現在採用中)
    const targetStores = service.extractActiveOpenStores(rawData.store, rawData.storeInfo);
    
    // 2. 集計期間の設定 (直近1ヶ月)
    const dateRange = {
      end: new Date(),
      start: new Date()
    };
    dateRange.start.setMonth(dateRange.end.getMonth() - 1);

    // 3. 集計実行
    const aggregatedData = service.aggregateMetrics(rawData.ar, targetStores, dateRange.start);

    // 4. 出力データ生成
    const outputRows = service.formatForOutput(aggregatedData);

    // Data Export
    if (outputRows.length > 0) {
      repo.appendData(CONFIG.SS_IDS.OUTPUT, CONFIG.SHEET_NAMES.OUTPUT, outputRows);
      console.log(`Success: Exported ${outputRows.length} rows.`);
    } else {
      console.log('No data to export.');
    }

  } catch (error) {
    console.error(`Fatal Error: ${error.message}`);
    // 必要に応じてSlack通知などをここに実装
  } finally {
    console.timeEnd('Execution Time');
  }
}

// ==========================================
// 3. Service Layer (Business Logic)
// ==========================================

class RecruitmentService {
  
  /**
   * "OPEN"ステータスの店舗とOPEN日をマッピングする
   */
  extractActiveOpenStores(storeRows, storeInfoRows) {
    const openDateMap = new Map();
    const activeStoreSet = new Set();

    // 1. 店舗名とOPEN日のマッピング作成
    storeRows.slice(1).forEach(row => {
      const name = row[CONFIG.COLS.STORE.NAME];
      const date = row[CONFIG.COLS.STORE.OPEN_DATE];
      if (name && date instanceof Date) {
        openDateMap.set(name, date);
      }
    });

    // 2. "OPEN"ステータスの店舗を抽出
    storeInfoRows.slice(1).forEach(row => {
      const name = row[CONFIG.COLS.STORE_INFO.NAME];
      const status = row[CONFIG.COLS.STORE_INFO.STATUS];
      if (name && status === CONFIG.STATUS_KEYWORDS.OPEN) {
        activeStoreSet.add(name);
      }
    });

    // 3. 両方の条件を満たす店舗のみを返却
    const result = {};
    for (const name of activeStoreSet) {
      if (openDateMap.has(name)) {
        result[name] = {
          openDate: openDateMap.get(name),
          metrics: this._initMetrics()
        };
      }
    }
    return result;
  }

  /**
   * ARデータを走査し、各店舗の指標を集計する
   */
  aggregateMetrics(arRows, stores, sinceDate) {
    const C = CONFIG.COLS.AR;
    const K = CONFIG.STATUS_KEYWORDS;

    arRows.slice(1).forEach(row => {
      const appliedAt = row[C.APPLIED_AT];
      
      // 日付フィルタ & バリデーション
      if (!(appliedAt instanceof Date) || appliedAt < sinceDate) return;

      const location = row[C.DESIRED_LOCATION];
      if (!location || !stores[location]) return;

      const metrics = stores[location].metrics;
      const docRes = row[C.DOC_RESULT];
      const interviewRes = row[C.INTERVIEW_RESULT];
      const isNaitei = row[C.IS_NAITEI] === true;
      const joinedAt = row[C.JOINED_AT];

      // 総応募数
      metrics.applied++;

      // ステータス判定 (優先順位付き排他制御)
      if (joinedAt instanceof Date) {
        metrics.joined++;
      } else if (isNaitei) {
        metrics.offer++;
      } else if (docRes === K.DECLINE || interviewRes === K.DECLINE) {
        metrics.declined++;
      } else if (docRes === K.REJECT || interviewRes === K.REJECT) {
        metrics.rejected++;
      } else {
        // 選考中判定: 未入力 or 合格 の場合のみ
        const isDocProcess = (docRes === '' || docRes === K.PASS);
        const isIntProcess = (interviewRes === '' || interviewRes === K.PASS);
        if (isDocProcess && isIntProcess) {
          metrics.inProcess++;
        }
      }
    });

    return stores;
  }

  /**
   * 出力用の2次元配列に整形する
   */
  formatForOutput(storesData) {
    const timestamp = Utilities.formatDate(new Date(), CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.TIMESTAMP_FORMAT);
    
    // ソート: OPEN日順 > 店舗名順
    const sortedNames = Object.keys(storesData).sort((a, b) => {
      const timeA = storesData[a].openDate.getTime();
      const timeB = storesData[b].openDate.getTime();
      return (timeA - timeB) || a.localeCompare(b);
    });

    return sortedNames.map(name => {
      const data = storesData[name];
      const m = data.metrics;
      return [
        timestamp,
        name,
        formatDate(data.openDate),
        m.applied,
        m.inProcess,
        m.rejected,
        m.declined,
        m.offer,
        m.joined
      ];
    });
  }

  _initMetrics() {
    return {
      applied: 0,
      inProcess: 0,
      rejected: 0,
      declined: 0,
      offer: 0,
      joined: 0
    };
  }
}

// ==========================================
// 4. Repository Layer (Data Access)
// ==========================================

class SheetRepository {
  fetchData(ssId, sheetName) {
    const sheet = this._getSheet(ssId, sheetName);
    return sheet.getDataRange().getValues();
  }

  appendData(ssId, sheetName, rows) {
    if (!rows || rows.length === 0) return;
    const sheet = this._getSheet(ssId, sheetName);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  _getSheet(ssId, sheetName) {
    if (!ssId) throw new Error(`Spreadsheet ID is missing for: ${sheetName}`);
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found in ID: ${ssId}`);
    return sheet;
  }
}

// ==========================================
// 5. Utilities
// ==========================================

function validateConfig() {
  const missingIds = Object.entries(CONFIG.SS_IDS)
    .filter(([_, value]) => !value)
    .map(([key, _]) => key);

  if (missingIds.length > 0) {
    throw new Error(`Missing Configuration IDs: ${missingIds.join(', ')}. Please set Script Properties.`);
  }
}

function formatDate(date) {
  if (!date) return '';
  return Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.DATE_FORMAT);
}
