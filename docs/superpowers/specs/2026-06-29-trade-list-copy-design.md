# 設計：交換清單一鍵複製

- 日期：2026-06-29
- 狀態：待使用者審查
- 相關：`src/client/views/Trade.tsx`（複製按鈕 UI／狀態／渲染）、`src/client/collection.ts`（新增純函式 `formatTradeList`）、`src/client/index.css`（按鈕樣式）、`test/client/collection.test.ts`（格式單元測試）、`test/client/views.test.tsx`（元件測試）

## 1. 背景 / 問題

交換分頁（`Trade.tsx`）有兩個面板：**可換出**（`surplus`，重複卡，`spare = 擁有數 − 1`）與**想換入**（`needs`，未擁有的卡）。兩者皆由 `computeTradeWithPending()`（`collection.ts:121`）即時從擁有矩陣推導，非資料庫欄位。

使用者實際換卡時要把這兩份清單貼到聊天室／表單，目前只能手動逐筆抄。希望在每個面板標題右側各放一顆**複製 icon 按鈕**，一鍵把該面板清單複製到剪貼簿。

## 2. 目標 / 非目標

### 目標
- 在**可換出**與**想換入**標題（`<h3 class="trade-panel-title">`）的文字**右側**各放一顆 `Copy` icon 按鈕。
- 兩顆按鈕**各自獨立**，各複製自己面板的清單。
- 複製內容**所見即所得（WYSIWYG）**：套用目前稀有度篩選（全部／R／SR／SSR／UR）後可見的卡。
- 複製格式（每筆一行，逗號分隔；系列名含空格如 `MP 4TH`，故用逗號避免歧義）：

  ```
  UR
  Kirari, MP 4TH, 2
  Mococo, MP 4TH, 1

  SSR
  Fuwawa, MP 4TH, 3
  ```

  - 依稀有度分群，群間空一行；尾端不留空行。
  - 稀有度排序沿用畫面順序 **UR → SSR → SR → R**。
  - 行格式 `角色, 系列, 數量`。
  - 數量：**可換出** = `spare`（可換出的重複張數）；**想換入** = `1`（每個缺的種類想換 1 張）。
- 複製成功後 icon 暫時切為 `Check`（約 1.5 秒）再切回，提供視覺回饋。
- 面板無內容（如 `已全部收集 ✓`）時，該按鈕**停用（disabled）**，維持版面穩定。

### 非目標（YAGNI）
- **不動 DB / API / worker**：清單純由前端既有推導資料序列化。
- 不做「一鍵複製兩份清單」的合併按鈕（已與使用者確認採兩顆獨立按鈕）。
- 不為剪貼簿失敗（非安全環境／舊瀏覽器）做 `execCommand` 退化方案——本工具跑在 localhost／https，`navigator.clipboard` 即足夠；失敗時僅不顯示 `Check`。
- 不改既有的篩選列、暫定交換列表、面板內既有排版。
- 不複製暫定交換列表（`pending-list`）。

## 3. 現況分析

| 項目 | 位置 | 狀態 |
| --- | --- | --- |
| 交換推導資料 | `collection.ts:99-146` `computeTrade` / `computeTradeWithPending` → `TradeItem[]` | 不變；複製只是再序列化 |
| `TradeItem` 結構 | `collection.ts:91-96` `{ ri, si, ci, spare }` | 不變 |
| 稀有度／名稱對照 | `RARITIES`（`collection.ts:8`）、`m.series[si]`、`m.characters[ci]` | 序列化時用來把索引轉名稱 |
| 篩選 | `Trade.tsx:91-94` `filterItems` | 沿用；複製吃 `filterItems` 後的結果 |
| 面板標題 | `Trade.tsx:220-231` `<h3 class="trade-panel-title">` 內：文字 + `.trade-panel-sub` | 插入 icon 按鈕；標題文字包一層 span |
| 標題版面 | `index.css:1172-1191` `.trade-panel-title`（`display:flex; justify-content:space-between; align-items:baseline`） | 需確保新增按鈕不破壞「左標題／右計數」的兩端對齊 |
| icon | master 無 icon 函式庫（`lucide-react` 是 shadcn 重構分支才加，未進 master） | 以 inline SVG 自製 `CopyIcon`／`CheckIcon`，**零新相依**、與 shadcn 分支無 `package.json` 衝突 |
| 剪貼簿 | 全專案目前無 `navigator.clipboard` 用法 | 首次引入 |

## 4. 設計

### 4.1 純函式 `formatTradeList`（`src/client/collection.ts`）

把「資料 → 字串」抽成純函式，獨立可測，讓 `Trade.tsx` 專注渲染。格式規則（分隔符、排序、數量）日後最可能微調，集中於此每條規則各有測試。

```ts
export function formatTradeList(
  items: TradeItem[],
  m: Matrix,
  kind: "surplus" | "needs",
): string {
  // 依畫面順序排序：稀有度高→低、系列依矩陣序、角色依矩陣序
  const ordered = [...items].sort(
    (a, b) => b.ri - a.ri || a.si - b.si || a.ci - b.ci,
  );
  const groups: string[] = [];
  let curRi = -1;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) groups.push(lines.join("\n"));
    lines = [];
  };
  for (const it of ordered) {
    if (it.ri !== curRi) {
      flush();
      curRi = it.ri;
      lines.push(RARITIES[it.ri]); // 稀有度標頭行
    }
    const qty = kind === "surplus" ? it.spare : 1;
    lines.push(`${m.characters[it.ci]}, ${m.series[it.si]}, ${qty}`);
  }
  flush();
  return groups.join("\n\n"); // 群間空一行；空輸入回傳 ""
}
```

- 傳入的 `items` 已是篩選後的陣列，故 WYSIWYG 自然成立。
- 排序鍵 `(ri desc, si asc, ci asc)` 對齊 `groupedList`（`Trade.tsx:128-163`）的視覺順序，複製順序＝畫面順序。
- 空輸入 → `""`（呼叫端用 `disabled` 擋掉，不會真的複製空字串）。

### 4.2 Icon 與 `CopyButton` 區域元件（`src/client/views/Trade.tsx`）

icon 以 inline SVG 自製（lucide 風格、`currentColor` 描邊，由 CSS `color` 控色），不引入 `lucide-react`：

```tsx
import { useRef, useState } from "react";

const ICON = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function CopyIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyButton({
  text,
  label,
  disabled,
}: { text: string; label: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClick = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {}); // 失敗則不顯示已複製回饋
  };
  return (
    <button
      type="button"
      className={`trade-copy-btn ${copied ? "copied" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={copied ? "已複製" : label}
      title={label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
```

- `copied` 狀態**留在 `CopyButton` 內**：兩顆按鈕各自獨立回饋，不必在 `Trade` 追蹤是哪顆被按。
- `useRef` 持有 timer，重複點擊時重置，避免殘留 timeout。
- icon 大小 `15`，與 16px 標題協調。

### 4.3 接入面板標題（`Trade.tsx`）

先把篩選結果各算一次，避免重複過濾：

```tsx
const fSurplus = filterItems(surplus);
const fNeeds = filterItems(needs);
```

`surplusSub` / `needsSub` 改用 `fSurplus` / `fNeeds`；`panelBody` 改為吃「已篩選」的陣列（移除其內部的 `filterItems`，由呼叫端傳入 `fSurplus` / `fNeeds`）。

標題結構：把標題文字與按鈕包成一個 `.trade-panel-titletext`（靠左群組），`.trade-panel-sub` 仍靠右——維持 `.trade-panel-title` 既有的 `space-between` 兩端對齊。

```tsx
<h3 className="trade-panel-title">
  <span className="trade-panel-titletext">
    可換出
    <CopyButton
      text={formatTradeList(fSurplus, m, "surplus")}
      label="複製可換出清單"
      disabled={fSurplus.length === 0}
    />
  </span>
  <span className="trade-panel-sub">{surplusSub}</span>
</h3>
```

想換入面板對稱：`formatTradeList(fNeeds, m, "needs")`、`label="複製想換入清單"`、`disabled={fNeeds.length === 0}`。

### 4.4 樣式（`src/client/index.css`，沿用既有 token）

```css
.trade-panel-titletext {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.trade-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.trade-copy-btn:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-elevated);
}
.trade-copy-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.trade-copy-btn.copied {
  color: var(--text); /* 配合 Check icon；無綠色 token，靠提亮 + 換 icon 表達 */
}
```

採與本檢視一致的自製扁平按鈕風格（`Trade.tsx` 既有按鈕皆自製 class，未用 shadcn `Button`；shadcn icon 尺寸 36px 對 16px 標題過大）。

### 4.5 資料流

```
computeTradeWithPending(m, pending) → { surplus, needs }（TradeItem[]）
        │ filterItems（套用稀有度篩選）
        ▼
fSurplus / fNeeds
        │ formatTradeList(items, m, kind)
        ▼
字串 ──▶ CopyButton.text ──(點擊)──▶ navigator.clipboard.writeText ──▶ Check 回饋 1.5s
```

## 5. 邊界情況

- **面板為空**（該稀有度無重複／已收齊）：`disabled`，icon 變淡、不可點。
- **篩選到某稀有度後為空**：同上，因 `fSurplus`／`fNeeds` 已是篩選後結果。
- **系列名含空格**（`MP 4TH`）：逗號分隔故無歧義（`Kirari, MP 4TH, 2`）。
- **剪貼簿不可用**（非安全環境／舊瀏覽器）：`.catch` 吞掉，不顯示 `Check`，不報錯。
- **快速連點**：`useRef` timer 重置，回饋窗不疊加。
- **可換出 `spare`**：恆 ≥ 1（`n ≥ 2` 才入列），不會出現 `數量 0`；想換入恆為 `1`。

## 6. 測試

### `test/client/collection.test.ts`（`formatTradeList` 單元測試）
- **可換出**：依 UR→R 分群、行格式 `角色, 系列, 數量`、數量＝`spare`。
- **想換入**：數量恆為 `1`。
- **分群空行**：群間恰一空行，尾端無多餘換行。
- **排序**：跨稀有度／系列／角色的輸入，輸出順序為 `(ri desc, si asc, ci asc)`。
- **空輸入** → `""`。
- **系列含空格**：`MP 4TH` 正確出現在中欄。

### `test/client/views.test.tsx`（元件）
- 渲染後出現兩顆複製按鈕（以 `aria-label` 取得）。
- 面板有內容時按鈕可用；面板為空時 `disabled`。
- （連線驗證）以 `vi.fn()` 模擬 `navigator.clipboard.writeText`，點擊後以預期字串被呼叫。

## 7. 風險

低。純前端、零 migration、零 API 改動、**零新相依**。新增一個純函式、一個區域元件與兩個 inline SVG icon，序列化邏輯由單元測試覆蓋。唯一外部相依為 `navigator.clipboard`（安全環境限定），已以 `.catch` 與 `disabled` 守門。**刻意不引入 `lucide-react`**（那是 shadcn 重構分支才加的相依），讓本 master 基底分支與 shadcn 進行中的工作互不干擾、合併時不產生 `package.json` 衝突。
