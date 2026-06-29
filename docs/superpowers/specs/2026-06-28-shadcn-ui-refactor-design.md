# 設計：以 Tailwind v4 + shadcn/ui 重構 UI（保留編輯風）

- 日期：2026-06-28
- 狀態：待使用者審查
- 相關：`src/client/**`（全部 UI）、`src/client/index.css`、`src/client/admin/admin.css`、`index.html`、`vite.config.ts`、`tsconfig*.json`、`postcss.config.js`、`biome.json`、`package.json`
- 不動：`src/client/collection.ts`、`src/client/api.ts`、`src/shared/types.ts`、整個 `src/worker/**`、`migrations/**`、`seed/**`

## 1. 背景 / 問題

目前前端是 React 18 + React Router 7 + Vite 6（部署於 Cloudflare Workers / Hono），樣式為**手寫 CSS**：`index.css`（1,488 行、137 個 class、13 區塊）+ `admin.css`（426 行），透過 PostCSS + autoprefixer 編譯。**沒有 Tailwind**。

UI 有一套刻意打造、識別度高的「暗金編輯雜誌風」設計系統（CSS 開頭註明「ported from the meridian-cards artifact」）：暗色暖調背景、金色點綴（`#c9a14a`）、serif 顯示字體（Noto Serif TC、Cormorant Garamond 斜體）、稀有度配色（R/SR/SSR/UR）、radial 漸層背景與 `rise` 進場動畫。

使用者希望改用 **shadcn/ui** 重構 UI——但 shadcn 是建立在 Tailwind CSS 之上、把元件原始碼複製進 repo 的方案。核心挑戰：**在導入 Tailwind + shadcn 的同時，保留既有的視覺識別**，而非套上 shadcn 預設的中性現代風。

## 2. 目標 / 非目標

### 目標
- 導入 Tailwind v4 + shadcn/ui 作為元件與樣式底層，逐步取代 1,914 行手寫 CSS。
- **保留品牌識別**（暗金調、serif 字體、稀有度配色、關鍵動畫）——透過 token 橋接讓 shadcn 元件「穿上」現有配色。
- 換取一致性、可維護性、無障礙（shadcn 基於 Radix）。
- **全範圍**：公開檢視頁（6 view）+ 後台（5 頁）皆遷移。
- **漸進式**：分階段進行，每階段可獨立 `lint→test→build→commit→上線`，隨時可回退。
- **視覺保真度＝同精神可順手精修**：保留識別，但允許在 shadcn 結構更自然處微調間距/狀態/焦點框。

### 非目標（YAGNI）
- **不**做淺色模式或主題切換器（維持暗色 only）。
- **不**把 Grid 收集格表硬塞進 shadcn `Table`（保留客製多層 sticky 表頭）。
- **不**重構後端、資料層（`collection.ts`/`api.ts`/`worker`）。
- **不**新增任何功能——純 UI 重新平台化、零行為變更。
- **不**做不相關的重構。

## 3. 決策摘要（brainstorm 結論）

| 決策點 | 選擇 |
| --- | --- |
| 主要目標 | 保留風格、換底層（非擁抱 shadcn 預設外觀） |
| 範圍 | 全部（公開 + 後台） |
| 推進節奏 | 漸進式、分階段、每階段可上線 |
| 視覺保真度 | 同精神，可順手精修 |
| 遷移策略 | Token 橋接 + 逐 view 拆除 CSS |
| Tailwind 版本 | v4 + `@tailwindcss/vite`（CSS-first 設定） |

## 4. 現況分析

### 4.1 路由與外殼
- `App.tsx`：`/` → `PublicViewer`、`/admin/*` → `Admin`。
- 公開外殼 `.container`：hero（kicker/title/subtitle）+ `StatsBar` + 8 顆 tab 導覽 + `ActiveView` + footer。tab 狀態存 `location.hash`。
- 後台外殼 `.admin`：head + 5 顆 tab 導覽 + 各面板。tab 狀態存 `useState`。

### 4.2 CSS 區塊（`index.css`）對映元件
| CSS 區塊 | 對應 UI | shadcn 對映 |
| --- | --- | --- |
| HERO | hero 標題區 | 客製 + serif token（保留 kicker 破折號、`rise`） |
| STATS | `StatsBar` | Tailwind 化（grid） |
| TABS | 公開導覽 | `Tabs` |
| VIEWS / CARD | view 容器、卡片 | `Card` |
| TABLE | 角色/系列/稀有度表 | `Table` + 稀有度 `Badge` |
| FOOTER | 頁尾 | Tailwind 化 |
| LOADING / ERROR | `state-msg` | `Skeleton` + 文字 |
| WISHLIST / GLANCE / TRADE | 特化視圖 | Tailwind 化 + `Card`/`Badge`/`Button` |
| GRID | 收集格表 | **保留客製 `<table>`**，僅 Tailwind 化 + 稀有度 token |
| RESPONSIVE | RWD | 改用 Tailwind 斷點 |

### 4.3 `admin.css` 對映元件
| 區塊 | 對應 | shadcn 對映 |
| --- | --- | --- |
| admin / admin-nav / admin-tab | 後台外殼與導覽 | `Tabs` |
| panel / panel-title | 面板容器 | `Card` |
| field / field-label | 表單欄位 | `Input` / `Label` / `Select` |
| btn-primary/ghost/sm | 按鈕 | `Button`（variants） |
| toast | 提示 | `Sonner` |
| error-text | 錯誤 | 文字 + `destructive` token |
| admin-table | 後台表格 | `Table` |
| pill | 稀有度標籤 | `Badge`（稀有度 variants） |
| opt-group / opt | tap-to-tally 切換鈕 | `Toggle` / `ToggleGroup` |
| tally | 開箱清點列 | Tailwind 化 + `Badge` |
| line-editor / action-form | 行內編輯/確認 | `Dialog` / `AlertDialog`（破壞性操作） |

## 5. 設計

### 5.1 架構與檔案佈局
- 新增 path alias `@/*` → `src/client/*`：同步改 `tsconfig.json`（`compilerOptions.paths`）與 `vite.config.ts`（`resolve.alias`）。
- shadcn 慣例落點：
  - `src/client/components/ui/*`：shadcn 元件原始碼（button、card、tabs、table、input、label、select、badge、sonner、skeleton、toggle、toggle-group、dialog、alert-dialog…依需求逐步加入）。
  - `src/client/lib/utils.ts`：`cn()`（clsx + tailwind-merge）。
  - `components.json`：shadcn 設定（style＝new-york 作基底再主題化、TS、RSC=false、tailwind css 指向 `src/client/index.css`、alias 對映上述路徑）。
- 主題與品牌細節集中於改寫後的 `src/client/index.css`（單一樣式入口）。`admin.css` 於 Phase 4 清空並由 `Admin.tsx` 移除 import。

### 5.2 主題策略 — Token 橋接（「保留風格」的心臟）

Tailwind v4 採 CSS-first。在 `index.css`：

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));   /* 保留 shadcn 慣例，但本專案暗色 only，不掛 .dark */

:root {
  /* 既有品牌 token 改名為 shadcn 語意 token（值不變，維持暗金調） */
  --background: #0e0d0c;        /* was --bg */
  --foreground: #ede8df;        /* was --text */
  --card: #181613;              /* was --surface */
  --card-foreground: #ede8df;
  --popover: #1f1c18;           /* was --surface-elevated */
  --popover-foreground: #ede8df;
  --primary: #c9a14a;           /* was --accent（金） */
  --primary-foreground: #0e0d0c;
  --secondary: #1f1c18;
  --muted: #141210;             /* was --bg-subtle */
  --muted-foreground: #a39e93;  /* was --text-secondary */
  --accent: #1f1c18;
  --accent-foreground: #ede8df;
  --destructive: #e07171;       /* 借 UR 紅 */
  --border: #2a2520;
  --input: #2a2520;
  --ring: #c9a14a;              /* 金色焦點環 */
  --radius: 0.5rem;             /* 微調以貼合現有方正感 */

  /* 品牌延伸（shadcn 不內建、必須保留的「靈魂」） */
  --rarity-r: #9a958b;
  --rarity-sr: #d4a857;
  --rarity-ssr: #d68aa3;
  --rarity-ur: #e07171;
}

@theme inline {
  /* 把 :root 變數暴露成 Tailwind utility（bg-primary / text-foreground …） */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-muted: var(--muted);
  --color-border: var(--border);
  --color-ring: var(--ring);
  /* …其餘語意 token… */

  /* 品牌色與字體族 */
  --color-rarity-r: var(--rarity-r);
  --color-rarity-sr: var(--rarity-sr);
  --color-rarity-ssr: var(--rarity-ssr);
  --color-rarity-ur: var(--rarity-ur);
  --font-sans: "IBM Plex Sans TC", "IBM Plex Sans", -apple-system, sans-serif;
  --font-serif: "Noto Serif TC", serif;          /* 顯示標題 */
  --font-accent: "Cormorant Garamond", serif;    /* 斜體點綴 */
  --font-mono: "JetBrains Mono", monospace;
}

@layer base {
  /* 保留品牌靈魂：漸層背景、進場動畫、hero 破折號等 */
  body {
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,161,74,0.06), transparent 60%),
      linear-gradient(180deg, var(--background) 0%, var(--muted) 100%);
    background-attachment: fixed;
  }
  @keyframes rise { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
}
```

設計重點：
- **間接層**：品牌色住 `:root`，`@theme inline` 轉成 utility。日後微調金色只改一處，全站跟著變。
- **暗色 only**：品牌值直接寫 `:root`，不掛 `.dark`、不做淺色版。
- **字體**：`index.html` 既有的 Google Fonts 連結不動；只在 theme 綁定字體族，元件以 `font-serif`/`font-accent` 取用。

### 5.3 元件對映與兩個特例
- 一般對映見 §4.2 / §4.3。
- **順手升級（同精神可精修允許範圍）**：`.mode-btn`、稀有度/系列篩選、`.opt` 等「切換鈕」改用 `Toggle` / `ToggleGroup`——語意正確、鍵盤無障礙更好。
- **特例 1｜Grid 收集格表**：維持語意 `<table>`，僅以 Tailwind utility 重寫並套用 `--rarity-*` token；多層 sticky 表頭與稀有度色欄不交給 shadcn Table。
- **特例 2｜稀有度 Badge**：擴充 `Badge` 增加 `rarity-r/sr/ssr/ur` 四個 variant（用 `bg-rarity-* / text-rarity-*`）。
- **按鈕 variant 對映**：`.btn-primary`→default（金）、`.btn-ghost`→ghost/outline、`.btn-sm`→size sm。
- **toast**：移除 `.toast` + `useState` 自管，改 `sonner` 的 `toast()`；於外殼掛 `<Toaster />`。

### 5.4 漸進式分階段（每階段：lint→typecheck→test→build→commit）

| Phase | 內容 | 完成後刪除的 CSS |
| --- | --- | --- |
| **0 地基** | 裝 Tailwind v4 + `@tailwindcss/vite`；`shadcn init`；path alias；寫 token 橋接主題；加入基礎 primitives 與 `cn()`。**視覺近乎零變化**（舊 CSS 仍主導；Tailwind preflight 的 reset 差異以 smoke check 把關，必要時於並存期縮限 preflight）。先確認 build/test 綠。 | — |
| **1 外殼** | 公開 hero/footer/tabs + 後台 shell/nav → Tailwind + `Tabs`/`Button`。 | HERO、TABS、FOOTER、admin 外殼 |
| **2 公開資料視圖** | tables.tsx（角色/系列/稀有度）→ `Table` + 稀有度 `Badge`；`StatsBar`；載入/錯誤 → `Skeleton`。 | STATS、TABLE、LOADING/ERROR |
| **3 特化視圖** | Wishlist、Glance、Trade、Market；Grid（Tailwind 化、保留客製表）。 | WISHLIST、GLANCE、TRADE、GRID、CARD、VIEWS、RESPONSIVE |
| **4 後台** | AddCards（tap-to-tally→Toggle）、ManageCards（Table/Dialog/Input/Select）、PendingTrades、Openings、History；toast→Sonner；pill→Badge。 | 整個 `admin.css` |
| **5 收尾** | 刪殘餘 CSS；移除 autoprefixer/postcss（v4 不需）；RWD 與視覺 QA 總驗收；**ARIA tabs a11y 補強**：roving tabindex + 方向鍵焦點導航（Arrow/Home/End，公開與後台兩個 tablist；單獨加 `tabIndex` 而無方向鍵會使非作用 tab 無法鍵盤抵達，故整批一起做）；更新 README/DEPLOY 註記。 | 殘餘 |

> 並存期特異性策略：Tailwind 的 reset 在 `@layer base`（低特異性），舊 `index.css` 為無 layer（高特異性），故並存期間舊樣式「贏」，確保逐 view 替換安全、不會一次崩。

### 5.5 資料流（主題層）

```
index.html Google Fonts ──┐
                          ▼
:root 品牌 token（暗金值）
   │  @theme inline
   ▼
Tailwind utility（bg-primary / text-foreground / font-serif / bg-rarity-ur …）
   │
   ├─▶ shadcn 元件（Button/Card/Tabs/Table/Badge/…）自動穿上品牌色
   └─▶ 客製元件（Grid 表、hero）直接取用同一批 token
```

## 6. 邊界情況

- **Tailwind preflight vs 舊 CSS**：並存期可能有細微 reset 差異 → Phase 0 後先做視覺 smoke check 再開始遷移 view。
- **Biome 重排 shadcn 元件**：必要時於 `biome.json` 對 `components/ui/**` 放寬或忽略格式規則。
- **autoprefixer/postcss**：v4 自帶 pipeline，不需 autoprefixer → 收尾階段移除 `postcss.config.js`。
- **client 測試查詢**：以角色/文字查詢為主者多半更穩（Radix）；少數斷言 class/DOM 結構處於該階段同步更新。
- **字體 FOUT**：字體載入策略不變（沿用 `index.html`）。
- **hash tab / history**：公開頁 tab 改用 `Tabs` 時，仍保留 `location.hash` 同步邏輯（行為不變）。

## 7. 測試與驗收

- 每階段執行：`npm run lint`（Biome）、`npm run typecheck`（3 個 tsconfig）、`npm test`（worker + client）、`npm run build`。
- client 測試（`test/client/**`，`@testing-library/react`）：以使用者可見的文字/角色為主，遷移後應大致沿用；class 名稱變動處同步修測試。
- 每階段結束以 Conventional Commits commit（並視情況 deploy 驗證）。
- 視覺驗收：每階段對照遷移前後關鍵畫面（hero、tabs、表格、稀有度色、Grid、後台表單/toast），確認「同精神」。

## 8. 風險與緩解

- **整體風險：中**。屬大範圍 UI 重新平台化，但零後端/資料變更、可逐階段回退。
- 主要風險集中在「並存期樣式衝突」與「測試選擇器更新」，皆有上述緩解；漸進式 + 每階段綠燈把爆炸半徑限制在單一 view。
- Tailwind v4 / shadcn 的精確版本與 CLI 指令於實作時透過 **shadcn skill** 取得當前正確值（本設計不鎖死指令細節）。
