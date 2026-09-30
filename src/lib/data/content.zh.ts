import { pastEvents, perks } from "./content";
import type { FaqItem, PastEvent, PitchItem, Perk } from "./types";

const HAVEN_EMAIL = "mailto:hong-kong@haven.hackclub.com";

const translatedPerks: Perk[] = perks.map((perk, index) => ({
  ...perk,
  title: ["學習與創作", "認識新朋友", "免費食物及獎品"][index] ?? perk.title,
  blurb: [
    "參加工作坊，或者按照自己的步伐創作",
    "認識新朋友，建立一生難忘的友誼",
    "免費小食和獎品，誰能拒絕呢？ :)",
  ][index]
    ? [["參加工作坊，或者按照自己的步伐創作", "認識新朋友，建立一生難忘的友誼", "免費小食和獎品，誰能拒絕呢？ :)"][index]!]
    : perk.blurb,
}));

const translatedPitches: PitchItem[] = [
  {
    id: "invite",
    align: "end",
    body: [
      { text: "今年十一月，" },
      { text: "你可以參加全球最大的青少年遊戲開發活動。", mark: true },
      { text: "無論你是經驗豐富，還是今天才第一次聽到遊戲開發，都歡迎你！" },
    ],
  },
  {
    id: "support",
    align: "start",
    body: [
      { text: "你會和" },
      { text: "來自世界各地的青少年一起製作遊戲", mark: true },
      { text: "。不懂遊戲開發？沒問題，我們有大量工作坊幫助你開始！" },
    ],
  },
  {
    id: "impact",
    align: "center",
    body: [
      { text: "這是你" },
      { text: "學習新事物", mark: true },
      { text: "、" },
      { text: "認識新朋友", mark: true },
      { text: "，一起展開精彩冒險的機會！" },
    ],
  },
];

const translatedFaqs: FaqItem[] = [
  {
    q: "我符合資格嗎？",
    a: [{ text: "只要你年滿 13 至 18 歲，就符合資格！不需要任何經驗。" }],
  },
  {
    q: "活動是免費的嗎？",
    a: [{ text: "是的！Hack Club 是一個非牟利組織，免費幫助青少年製作技術作品。" }],
  },
  {
    q: "但我從未寫過程式！",
    a: [{ text: "太好了！遊戲開發活動就是為初學者而設。我們有工作坊、導師和隊友一路協助你。" }],
  },
  {
    q: "如果我的家長有疑問呢？",
    a: [
      { text: "我們很樂意提供協助！你可以查看我們的 " },
      { text: "家長指南" },
      { text: "，或者電郵 " },
      { text: "hong-kong@haven.hackclub.com", href: HAVEN_EMAIL },
      { text: " 聯絡我們。" },
    ],
  },
  {
    q: "還有其他問題？",
    a: [
      { text: "歡迎加入 " },
      { text: "Slack", href: "https://hackclub.com/slack/" },
      { text: " 的 #haven-hong-kong 頻道，或電郵 " },
      { text: "hong-kong@haven.hackclub.com", href: HAVEN_EMAIL },
      { text: " 聯絡我們！" },
    ],
  },
];

const translatedPastEvents: PastEvent[] = pastEvents.map((event, index) => ({
  ...event,
  caption: [
    "製作古怪又有趣的作品，贏取驚喜獎品！遍及 70 多個城市的線下黑客松。",
    "學生在全球 200 個城市帶領遊戲開發活動，從倫敦、紐約到檳城都有！",
    "我們至今最大型的遊戲開發活動：一個週末，10,000 名青少年同時製作遊戲！",
  ][index] ?? event.caption,
  alt: [
    "青少年在 Scrapyard 製作作品",
    "參加者參與 Daydream 遊戲開發活動",
    "一群青少年參與 Campfire 活動",
  ][index] ?? event.alt,
}));

export const chineseContent = {
  tagline: ["為 13 至 18 歲青少年而設的遊戲開發活動", "Nov 14–15, 2026 · Hong Kong"],
  about: {
    title: "甚麼是遊戲開發活動？",
    body: "這是一個社交編程活動，你可以和朋友一起製作遊戲，享受免費食物！",
    perks: translatedPerks,
  },
  pitch: {
    heading: "遊戲開發活動是不是很棒？",
    items: translatedPitches,
  },
  steps: {
    heading: "今年十一月，加入遊戲開發活動！",
    subheading: "不用擔心，我們會一步一步帶你完成。",
  },
  schedule: {
    heading: "活動當日會做甚麼？",
    tbd: {
      title: "待定！",
      body: "我們仍在安排活動流程。先報名，我們確定後會第一時間通知你！",
    },
  },
  sponsorsHeading: "我們的贊助商",
  pastEvents: {
    heading: [
      "Hack Club 協助青少年在世界各地舉辦了數百場活動！",
      "一起看看我們過去的活動 ~",
    ],
    items: translatedPastEvents,
  },
  faq: {
    heading: "常見問題",
    cta: "報名！",
    items: translatedFaqs,
  },
} as const;

