import { SLIDES } from './defaults.mjs';
import { LOCALES, DEVICES } from '../../scripts/locales.mjs';

const q = new URLSearchParams(location.search);
const slideIndex = Number(q.get('slide') ?? 0);
const locale = q.get('locale') ?? 'ja';
const store = q.get('store') ?? 'apple';
const deviceId = q.get('device') ?? 'iphone';

const device = DEVICES[deviceId];
if (!device) throw new Error(`unknown device: ${deviceId}`);
if (!LOCALES.some((l) => l.editor === locale)) throw new Error(`unknown locale: ${locale}`);
const slide = SLIDES[slideIndex];
if (!slide) throw new Error(`unknown slide: ${slideIndex}`);

const W = device.width;
const H = device.height;

// 端末フレームはスライド幅に対する比率で決める（端末種が増えても比率が共通）
const DEV_W = Math.round(W * 0.86);
const CAPTION_TOP = Math.round(H * 0.072);
const PAD_X = Math.round(W * 0.085);
const HEADLINE_FS = Math.round(W * 0.082);
const SUBTITLE_FS = Math.round(W * 0.036);
const GAP_MIN = Math.round(H * 0.06); // キャプション下端と端末上端の最小距離

function linesWithMarkers(text) {
  return text.split('\n').map((line) => {
    const span = document.createElement('span');
    span.className = 'line';
    // *語* → マーカー付き span
    const parts = line.split(/\*([^*]+)\*/g);
    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const m = document.createElement('span');
        m.className = 'marker';
        m.textContent = p;
        span.appendChild(m);
      } else if (p) {
        span.appendChild(document.createTextNode(p));
      }
    });
    return span;
  });
}

function fitLines(container, baseSize, maxWidth) {
  // 各行は nowrap。入りきらなければフォントを縮める（語の途中では折らない）
  let fs = baseSize;
  for (let i = 0; i < 60; i++) {
    container.style.fontSize = `${fs}px`;
    const over = [...container.querySelectorAll('.line')].some(
      (el) => el.scrollWidth > maxWidth,
    );
    if (!over) break;
    fs = Math.max(20, fs - 4);
  }
  return fs;
}

async function main() {
  const root = document.getElementById('root');

  const el = document.createElement('div');
  el.className = 'slide';
  el.dataset.bg = slide.editorialBg;
  el.style.width = `${W}px`;
  el.style.height = `${H}px`;
  el.style.setProperty('--pad-top', `${CAPTION_TOP}px`);
  el.style.setProperty('--pad-x', `${PAD_X}px`);

  const stage = document.createElement('div');
  stage.className = 'stage';
  el.appendChild(stage);

  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.dataset.slideCaption = '1';
  stage.appendChild(caption);

  const headline = document.createElement('h1');
  headline.className = 'headline';
  const headText = slide.headline[locale] ?? slide.headline.ja ?? '';
  linesWithMarkers(headText).forEach((n) => headline.appendChild(n));
  caption.appendChild(headline);

  const subText = slide.subtitle?.[locale] ?? slide.subtitle?.ja;
  if (subText) {
    const sub = document.createElement('p');
    sub.className = 'subtitle';
    sub.dataset.slideSub = '1';
    linesWithMarkers(subText).forEach((n) => sub.appendChild(n));
    caption.appendChild(sub);
    sub.style.fontSize = `${SUBTITLE_FS}px`;
  }

  const deviceArea = document.createElement('div');
  deviceArea.className = 'device-area';
  deviceArea.style.marginTop = `${GAP_MIN}px`;
  stage.appendChild(deviceArea);

  const dev = document.createElement('div');
  dev.className = 'device';
  dev.dataset.slideDevice = '1';
  dev.style.width = `${DEV_W}px`;
  dev.style.setProperty('--dev-radius', `${Math.round(DEV_W * 0.14)}px`);
  dev.style.setProperty('--dev-bezel', `${Math.round(DEV_W * 0.022)}px`);
  // 下端はスライド外にはみ出してよい（端末を下部で切る定番レイアウト）
  dev.style.height = `${H}px`;
  const img = document.createElement('img');
  img.alt = '';
  img.src = slide.screenshot
    .replace('{store}', store)
    .replace('{device}', deviceId)
    .replace('{locale}', locale);
  dev.appendChild(img);
  const island = document.createElement('div');
  island.className = 'island';
  dev.appendChild(island);
  deviceArea.appendChild(dev);

  if (slide.frame) {
    const f = document.createElement('div');
    f.className = 'frame';
    el.appendChild(f);
  }

  root.appendChild(el);

  // フォント適用後に縮小判定（フォールバック書体で測ると誤判定する）
  await document.fonts.ready;
  fitLines(headline, HEADLINE_FS, W - PAD_X * 2);
  const sub = caption.querySelector('[data-slide-sub]');
  if (sub) fitLines(sub, SUBTITLE_FS, W - PAD_X * 2);

  await img.decode().catch(() => {});
  document.documentElement.dataset.renderReady = '1';
}

main().catch((e) => {
  document.documentElement.dataset.renderError = String(e);
  throw e;
});
