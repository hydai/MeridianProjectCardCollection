import type { CardSource, Rarity } from "../src/shared/types";

export interface OwnedCard {
  series: string;
  character: string;
  rarity: Rarity;
  source: CardSource;
}

// Raw export of the Google Sheet "開箱記錄" tab, one card per line:
//   series,character,rarity[,購入]
// A trailing "購入" marks a purchased card (source = purchase); otherwise pull.
// 258 rows total: NEW YEAR 50, BUNNY GIRL 47, KILLER 41, MP 4TH 120.
const RAW = `
NEW YEAR,Hiyori,R
KILLER,Mizuki,SR
KILLER,Rei,SR
KILLER,Hitomi,SSR
NEW YEAR,Sachi,R
KILLER,Hitomi,R
NEW YEAR,Koyuki,SR
NEW YEAR,Rei,SSR
KILLER,Mizuki,R
KILLER,Rei,R
KILLER,Yuzumi,SR
BUNNY GIRL,Hitomi,SSR
KILLER,Iruni,R
KILLER,Mizuki,R
KILLER,Hiyori,SR
KILLER,Itsuki,SSR
BUNNY GIRL,Koyuki,R
BUNNY GIRL,Hitomi,R
NEW YEAR,Hiyori,SR
BUNNY GIRL,Iruni,SSR
KILLER,Iruni,R
BUNNY GIRL,Hitomi,R
BUNNY GIRL,Rei,SR
KILLER,Yuzumi,SSR
NEW YEAR,Hitomi,R
NEW YEAR,Mizuki,R
NEW YEAR,Iruni,SR
BUNNY GIRL,Yuzumi,SSR
NEW YEAR,Yuzumi,R
NEW YEAR,Rei,R
KILLER,Iruni,SR
BUNNY GIRL,Kirari,SSR
NEW YEAR,Koyuki,R
BUNNY GIRL,Sachi,R
BUNNY GIRL,Hiyori,SR
KILLER,998,SSR
BUNNY GIRL,998,SR
BUNNY GIRL,Mizuki,SR
BUNNY GIRL,Rei,SR
NEW YEAR,Yuzumi,SSR
BUNNY GIRL,Mizuki,R
BUNNY GIRL,Rei,R
NEW YEAR,Sachi,SR
NEW YEAR,Koyuki,SSR
NEW YEAR,Mizuki,R
NEW YEAR,Rei,R
BUNNY GIRL,Kirari,SR
KILLER,Hiyori,SSR
BUNNY GIRL,Rei,R
BUNNY GIRL,Yuzumi,R
BUNNY GIRL,Iruni,SR
BUNNY GIRL,Itsuki,SSR
NEW YEAR,Itsuki,R
NEW YEAR,998,R
BUNNY GIRL,Mizuki,SR
BUNNY GIRL,Yuzumi,SSR
KILLER,Rei,R
KILLER,Yuzumi,R
NEW YEAR,Koyuki,SR
BUNNY GIRL,Itsuki,SSR
NEW YEAR,Rei,SR
NEW YEAR,Yuzumi,SR
NEW YEAR,Kirari,SR
BUNNY GIRL,Hiyori,UR
NEW YEAR,Hitomi,R
NEW YEAR,Sachi,R
NEW YEAR,Iruni,SR
KILLER,Itsuki,UR
NEW YEAR,Sachi,R
NEW YEAR,Hiyori,R
KILLER,998,SR
NEW YEAR,Koyuki,SSR
BUNNY GIRL,Yuzumi,SR
BUNNY GIRL,Kirari,SR
NEW YEAR,Sachi,SR
NEW YEAR,Hiyori,SSR
KILLER,998,R
KILLER,Rei,R
NEW YEAR,Itsuki,SR
KILLER,Mizuki,SSR
NEW YEAR,Hitomi,R
NEW YEAR,Itsuki,R
KILLER,Hiyori,SR
BUNNY GIRL,Rei,UR
KILLER,Koyuki,R
KILLER,Rei,R
NEW YEAR,Yuzumi,SR
KILLER,Kirari,UR
KILLER,Iruni,R
NEW YEAR,Hitomi,R
KILLER,Itsuki,SR
NEW YEAR,998,SSR
KILLER,Rei,SR
BUNNY GIRL,Itsuki,SR
KILLER,Mizuki,SR
BUNNY GIRL,Iruni,UR
BUNNY GIRL,Hiyori,SR
BUNNY GIRL,Hitomi,SR
BUNNY GIRL,Iruni,SR
NEW YEAR,Koyuki,SSR
BUNNY GIRL,Itsuki,R
BUNNY GIRL,998,R
BUNNY GIRL,Kirari,SR
NEW YEAR,Iruni,SSR
NEW YEAR,Koyuki,R
BUNNY GIRL,Hitomi,SR
BUNNY GIRL,Itsuki,SR
NEW YEAR,Hiyori,SSR
KILLER,Hitomi,R
BUNNY GIRL,Kirari,SR
NEW YEAR,Sachi,SR
KILLER,Iruni,SSR
BUNNY GIRL,Hitomi,R
BUNNY GIRL,Koyuki,R
KILLER,Yuzumi,SR
NEW YEAR,Kirari,SSR
NEW YEAR,998,R
NEW YEAR,Mizuki,R
NEW YEAR,Sachi,SR
KILLER,Koyuki,UR
BUNNY GIRL,Mizuki,UR,購入
BUNNY GIRL,Mizuki,SSR,購入
NEW YEAR,Mizuki,SSR,購入
NEW YEAR,Mizuki,UR,購入
KILLER,998,UR,購入
BUNNY GIRL,Koyuki,SSR,購入
KILLER,Kirari,SR,購入
NEW YEAR,Mizuki,SR,購入
NEW YEAR,Kirari,R,購入
BUNNY GIRL,Iruni,R,購入
BUNNY GIRL,Hiyori,R,購入
BUNNY GIRL,Kirari,R,購入
NEW YEAR,Iruni,R,購入
KILLER,Hiyori,R,購入
KILLER,Mizuki,UR,購入
KILLER,Sachi,R,購入
BUNNY GIRL,Koyuki,SR,購入
KILLER,Itsuki,R,購入
MP 4TH,Rei,R
MP 4TH,Mizuki,R
MP 4TH,Iruni,SR
MP 4TH,998,SSR
MP 4TH,Yuzumi,R
MP 4TH,Kirari,R
MP 4TH,Mizuki,SR
MP 4TH,Rei,SSR
MP 4TH,Hiyori,R
MP 4TH,Hitomi,R
MP 4TH,Yuzumi,SR
MP 4TH,Rei,SSR
MP 4TH,Rei,R
MP 4TH,Yuzumi,R
MP 4TH,Iruni,SR
MP 4TH,998,UR
MP 4TH,Yuzumi,R
MP 4TH,Kirari,R
MP 4TH,Iruni,SR
MP 4TH,Itsuki,SR
MP 4TH,Sachi,R
MP 4TH,Yuzumi,SR
MP 4TH,Itsuki,SR
MP 4TH,Kirari,UR
MP 4TH,Sachi,R
MP 4TH,Koyuki,R
MP 4TH,998,SR
MP 4TH,KSP,SR
MP 4TH,Yuzumi,R
MP 4TH,Kirari,R
MP 4TH,Hiyori,SR
MP 4TH,Hitomi,SSR
MP 4TH,Sachi,R
MP 4TH,Koyuki,R
MP 4TH,Mizuki,SR
MP 4TH,998,SSR
MP 4TH,Itsuki,SR
MP 4TH,Hitomi,SR
MP 4TH,Yuzumi,SR
MP 4TH,Iruni,SSR
MP 4TH,Hiyori,R
MP 4TH,Hitomi,R
MP 4TH,Iruni,SR
MP 4TH,Rei,SSR
MP 4TH,Iruni,R
MP 4TH,Koyuki,R
MP 4TH,Hiyori,SR
MP 4TH,Hitomi,SSR
MP 4TH,Mizuki,R
MP 4TH,Rei,R
MP 4TH,Itsuki,SR
MP 4TH,998,SSR
MP 4TH,Hiyori,R
MP 4TH,Hitomi,R
MP 4TH,Sachi,SR
MP 4TH,Itsuki,SSR
MP 4TH,Itsuki,R
MP 4TH,998,R
MP 4TH,Sachi,SR
MP 4TH,Hiyori,UR
MP 4TH,Kirari,R
MP 4TH,Sachi,R
MP 4TH,998,SR
MP 4TH,Itsuki,SSR
MP 4TH,Kirari,R
MP 4TH,Sachi,R
MP 4TH,Itsuki,SR
MP 4TH,KSP,UR
MP 4TH,Yuzumi,R
MP 4TH,Kirari,R
MP 4TH,Iruni,SR
MP 4TH,Itsuki,SR
MP 4TH,Itsuki,R
MP 4TH,998,R
MP 4TH,Hitomi,SR
MP 4TH,Mizuki,SR
MP 4TH,Mizuki,R
MP 4TH,Iruni,SR
MP 4TH,Itsuki,SR
MP 4TH,998,SSR
MP 4TH,Hiyori,R
MP 4TH,Iruni,R
MP 4TH,KSP,SR
MP 4TH,Hitomi,SSR
MP 4TH,Itsuki,R
MP 4TH,KSP,R
MP 4TH,998,SR
MP 4TH,Kirari,SSR
MP 4TH,Hiyori,R
MP 4TH,Hitomi,R
MP 4TH,Sachi,SR
MP 4TH,Koyuki,SR
MP 4TH,Yuzumi,R
MP 4TH,Sachi,SR
MP 4TH,Koyuki,SR
MP 4TH,KSP,SSR
MP 4TH,Iruni,R
MP 4TH,Itsuki,R
MP 4TH,Koyuki,SR
MP 4TH,Hiyori,SSR
MP 4TH,Hiyori,SR
MP 4TH,Hitomi,SR
MP 4TH,Koyuki,SR
MP 4TH,Yuzumi,SSR
MP 4TH,Koyuki,R
MP 4TH,Hiyori,R
MP 4TH,998,SR
MP 4TH,Sachi,UR
MP 4TH,Itsuki,R
MP 4TH,Hiyori,SR
MP 4TH,Hitomi,SR
MP 4TH,Kirari,SSR
MP 4TH,Sachi,R
MP 4TH,Koyuki,R
MP 4TH,Hitomi,SR
MP 4TH,Mizuki,SSR
MP 4TH,Hitomi,R
MP 4TH,Iruni,R
MP 4TH,KSP,SR
MP 4TH,998,SSR
`;

export const ownedCards: OwnedCard[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [series, character, rarity, note] = line.split(",");
    return {
      series,
      character,
      rarity: rarity as Rarity,
      source: note === "購入" ? "purchase" : "pull",
    };
  });
