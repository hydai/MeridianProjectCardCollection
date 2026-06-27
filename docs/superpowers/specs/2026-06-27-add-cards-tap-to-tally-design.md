# 設計：開箱新增改為「點選累加」按鈕介面

- 日期：2026-06-27
- 狀態：待使用者審查
- 相關：`src/client/admin/AddCards.tsx`（本次唯一改動的元件）、`seed/catalog-def.ts`（系列／角色／稀有度資料來源）、`src/client/admin/admin.css`（樣式）

## 1. 背景 / 問題

後台「開箱新增」分頁目前用**下拉式選單**選系列、角色、稀有度（`AddCards.tsx:77`、`:95`、`:108`）。
資料其實非常少且固定——4 個系列、約 11–12 個角色、4 種稀有度，全部在 build 時從
`seed/catalog-def.ts` bundle 進前端。用下拉選單要「點開→捲動→選取」三步,對這麼少的選項是多餘摩擦。

使用者希望**每個選項都是平鋪、可直接點到的按鈕**,不用再操作下拉選單。

## 2. 目標 / 非目標

### 目標
- 系列、角色、稀有度三者皆改為**平鋪按鈕**,點一下即選取。
- 配合開箱「一次記一批」的情境,改用**點選累加**互動:先選稀有度(維持選取),點角色即把
  「該角色 + 目前稀有度」加進一份累加清單;下方即時顯示清單與數量,可逐筆遞減移除。
- 送出時把清單展開成與現在**完全相同**的 `AddCardInput[]`。

### 非目標（YAGNI）
- **不動** worker / API / D1：`postCards()`、`/api/admin/cards`、`AddCardInput`、`OpeningInput` 全不變。
- 不改「一次提交 = 一個系列」語意:系列維持單選(也是開箱紀錄的系列)。
- 不改開箱成本區塊(checkbox / 開箱日期 / 總花費)——原樣保留。
- 不在角色按鈕上做「已加入數量」徽章(清單即真實來源,日後可加)。

## 3. 現況分析

| 項目 | 位置 | 狀態 |
| --- | --- | --- |
| 系列選擇 | `AddCards.tsx:77` `<select>` | 改為 button group(單選) |
| 角色選擇 | `AddCards.tsx:95` 每列一個 `<select>` | 改為平鋪角色按鈕(點=加一張) |
| 稀有度選擇 | `AddCards.tsx:108` 每列一個 `<select>` | 改為平鋪稀有度按鈕(sticky 單選) |
| 多列模型 | `rows: Row[]` + 新增一列 / 移除 | 換成累加清單 `tally` |
| 切換系列過濾 | `changeSeries()` `AddCards.tsx:26` | 沿用其「丟掉新系列沒有的角色」邏輯 |
| 送出 | `submit()` `AddCards.tsx:46` | 展開 `tally` → `AddCardInput[]`,其餘不變 |
| 資料來源 | `SERIES` / `charactersFor` / `RARITIES` `catalog-def.ts` | 不變 |
| 樣式 | `.add-row` / `.field` / `.btn` `admin.css` | 新增 `.opt` 選項按鈕族 |

## 4. 設計

### 4.1 元件狀態（`AddCards.tsx`）

```
series: string                         // 單選,預設 SERIES[0]
rarity: Rarity                         // 目前稀有度(sticky),預設 "R"
tally: TallyEntry[]                    // 已加入清單,依首次加入順序
TallyEntry = { character: string; rarity: Rarity; qty: number }
isOpening / openedAt / cost / busy / toast / error   // 不變
```

移除原本的 `rows` / `nextId` / `setRow` / `addRow` / `removeRow`。

### 4.2 互動

1. **點系列** → `setSeries(s)`;同時用 `charactersFor(s)` 過濾 `tally`,丟掉角色不在新系列的項目
   (沿用現有 `changeSeries` 語意——只移除無效項,其餘保留)。
2. **點稀有度** → `setRarity(rr)`;按鈕高亮並維持選取。
3. **點角色** `c` → 對 `(c, rarity)`:
   - 清單已有同組 → `qty + 1`;
   - 否則 append `{ character: c, rarity, qty: 1 }`。
4. **清單每列 `[–]`** → `qty − 1`,歸零即從清單移除。
5. **「新增 N 張」**(`N = Σ qty`) → 展開成 `AddCardInput[]`(每組 `qty` 複製成多筆),
   呼叫 `postCards(cards, opening)`;成功後清空 `tally`、重置 `cost`、顯示 toast。
   `N = 0` 時按鈕 disabled。

### 4.3 資料流(不變)

```
tally  ──展開──▶  AddCardInput[]  ──postCards()──▶  /api/admin/cards  (原封不動)
```

每組 `{character, rarity, qty}` 展開成 `qty` 筆 `{ series, character, rarity }`。
`opening`(若勾選)沿用單一 `series`。送出張數 = 展開後總數,與舊版多列等價。

### 4.4 樣式（`admin.css`）

新增一組可重用選項按鈕:

- `.opt` — 平鋪選項:`inline-flex`、圓角、`.btn-ghost` 等級的邊框/間距;預設灰階文字。
- `.opt.active` — 選取態:系列/角色用金色 accent(`--accent`);稀有度用各自 rarity 顏色
  token(`--r-color` / `--sr-color` / `--ssr-color` / `--ur-color`),沿用 `.pill.r/.sr/...` 的配色。
- 容器 `.opt-group` — `display:flex; flex-wrap:wrap; gap`,手機自動換行。
- 累加清單 `.tally` / `.tally-row` — 每列「角色 · 稀有度  ×N  [–]」。

不動既有 `.add-row` 等 class(可保留或清掉,實作時再定)。

## 5. 邊界情況

- **清單為空**:「新增」按鈕 disabled,顯示提示(例「點角色加入卡片」)。
- **切換系列**:只移除新系列沒有的角色項(如 KSP),其餘維持;`rarity` 不受影響。
- **同角色多稀有度**:`(Mizuki, R)` 與 `(Mizuki, SR)` 是兩列,各自計數。
- **開箱成本**:勾選後的日期/花費邏輯不變;送出成功仍清掉花費。

## 6. 測試（`test/client/admin.test.tsx`）

更新既有測試並涵蓋:
- 點稀有度 → 點角色 → 清單出現該卡;再點同角色 → 數量變 ×2。
- `[–]` 遞減,歸零後該列消失。
- 切換系列會丟掉新系列沒有的角色項(KSP 案例)。
- 送出時 `postCards` 收到展開後正確張數的 `AddCardInput[]`,且 series 正確。
- 清單為空時「新增」按鈕 disabled。

## 7. 風險

低。純前端互動層重構,API / 資料模型零改動,可由 client 測試完整覆蓋。
