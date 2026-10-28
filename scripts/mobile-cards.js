import { ratingMood } from './rating-colors.js';
const extractReviewMoods = () => [];

// Separate 360-unit canvases keep phone text readable without altering desktop cards.
const W = 360;
const palettes = [ ['#332b4a', '#dccdff'], ['#36302d', '#f3d4aa'], ['#243a3a', '#b1e9e1'] ];
function esc(value = '') {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
export function mobileLines(value, limit, maxLines) {
  const words = String(value ?? '').trim().split(/\s+/).flatMap(word => word.match(new RegExp(`.{1,${limit}}`, 'gu')) || []);
  const lines = [];
  for (const word of words) {
    if (lines.length && `${lines.at(-1)} ${word}`.length <= limit) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, limit - 1).trimEnd()}…`];
  return lines;
}
function text(value, x, y, size = 14, fill = '#c9d6e3', extra = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
}
function lines(value, x, y, width, size = 20, max = 3, fill = '#fffaf5', weight = 750) {
  const rows = mobileLines(value, Math.floor(width / (size * .57)), max);
  const step = size + 5;
  return { svg: rows.map((row, i) => text(row, x, y + i * step, size, fill, `font-weight="${weight}"`)).join(''), bottom: y + (rows.length - 1) * step };
}
function frame(height, label, body, end = '#252532', edge = '#61788d') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="${height}" viewBox="0 0 360 ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#19232e"/><stop offset="1" stop-color="${end}"/></linearGradient><style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs><rect x="1" y="1" width="358" height="${height - 2}" rx="18" fill="url(#bg)" stroke="${edge}" stroke-width="1.5"/><circle cx="352" cy="0" r="90" fill="#89c9f8" opacity=".045"/>${body}</svg>`;
}
function art(uri, x, y, width, height, circle = false) {
  const shape = circle ? `<circle cx="${x + width / 2}" cy="${y + height / 2}" r="${width / 2}"/>` : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8"/>`;
  return uri ? `<defs><clipPath id="art">${shape}</clipPath></defs><image href="${esc(uri)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#art)"/>` : `<g fill="#334659">${shape}</g>`;
}
function pill(value, x, y, width, bg, fg, size = 13) {
  return `<rect x="${x}" y="${y}" width="${width}" height="28" rx="14" fill="${bg}"/>${text(value, x + width / 2, y + 19, size, fg, 'text-anchor="middle" font-weight="650"')}`;
}
export function bookDescription(book, kit) {
  const rating = kit.normaliseRating(book.rating);
  const moods = extractReviewMoods(book.review);
  return `${book.title} by ${book.author}. ${rating ? `${rating} out of 5 stars` : 'Unrated'}.${moods.length ? ` ${moods.join('; ')}.` : ''}${book.pages ? ` ${book.pages} pages.` : ''}${book.published ? ` Published ${book.published}.` : ''}${book.review ? ' Read full review.' : ' No written review.'}`;
}
export function currentDescription(book) {
  if (!book) return 'not reading anything , rn';
  const p = book.progress;
  return `currently reading ${book.title} by ${book.author}.${p ? ` ${p.page != null ? `Page ${p.page}${p.total != null ? ` of ${p.total}` : ''}; ` : ''}${p.percent}% read.` : ' Progress not shared yet.'}`;
}

export function renderMobileBook(book, artwork, index, kit) {
  const title = lines(book.title, 82, 49, 260);
  const author = lines(book.author, 82, title.bottom + 20, 260, 14, 2);
  const publication = [kit.publicationLabel(book.published), book.averageRating && `GR ${Number(book.averageRating).toFixed(2)}`].filter(Boolean).join(' · ');
  const pub = lines(publication, 82, author.bottom + 20, 260, 13, 2, '#c0cbd7', 500);
  const facts = [book.pages && `${book.pages}p`, book.readAt && `read ${kit.monthYear(book.readAt)}`].filter(Boolean).join(' · ');
  const factsY = (publication ? pub.bottom : author.bottom) + 19;
  const startY = Math.max(132, factsY + 13);
  const rating = kit.normaliseRating(book.rating);
  const mood = ratingMood(rating);
  let x = 16, y = startY;
  const chips = [{ label: rating ? `${rating} ★` : 'unrated', bg: mood.background, fg: mood.color, width: 67 }];
  const moods = extractReviewMoods(book.review);
  moods.forEach((label, i) => chips.push({ label, bg: palettes[i][0], fg: palettes[i][1], width: 22 + label.length * 7.3 }));
  if (!moods.length) chips.push({ label: book.review ? 'read full review ↗' : 'no written review', bg: '#302a3d', fg: '#d3c7df', width: 155 });
  let chipSvg = '';
  chips.forEach((chip, i) => {
    if (x + chip.width > W - 16) { x = 16; y += 34; }
    chipSvg += pill(chip.label, x, y, chip.width, chip.bg, chip.fg);
    x += chip.width + (i === 0 ? 19 : 7);
    if (i === 0) chipSvg += `<path d="M${x - 10} ${y + 5}v18" stroke="#8995a6" stroke-width="1.5"/>`;
  });
  return frame(y + 42, bookDescription(book, kit), `${text(`READ / 0${index + 1}`, 16, 23, 12, '#e9c995', 'font-weight="750"')}${text(book.review ? 'read full review ↗' : 'view on Goodreads ↗', 344, 23, 12, '#c3dae9', 'text-anchor="end"')}${art(artwork, 16, 37, 52, 80)}${title.svg}${author.svg}${publication ? pub.svg : ''}${text(facts, 82, factsY, 13, '#c0cbd7')}${chipSvg}`);
}

export function renderMobileCurrent(book, artwork) {
  if (!book) return frame(118, currentDescription(book), `<g transform="translate(46 60)" fill="none" stroke="#a7d1f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="-29" y="-32" width="58" height="64" rx="16" fill="#2b3e50" stroke-opacity=".3"/><path d="M0-15q-10-5-20-3v34q10-2 20 3q10-5 20-3v-34q-10-2-20 3v34"/><path d="M8-18v14l4-3 4 3v-15" fill="#8edfd4" stroke="none"/></g>${text('SHELF STATUS', 91, 31, 12, '#a9e7de', 'font-weight="750"')}${text('not reading anything , rn', 91, 65, 17, '#fffaf5', 'font-style="italic" font-weight="600"')}${pill('...', 91, 79, 54, '#363750', '#d4c1ff')}`, '#263244');
  const title = lines(book.title, 82, 49, 260);
  const author = lines(`by ${book.author}`, 82, title.bottom + 20, 260, 14, 2);
  const pages = book.progress?.total || book.pages;
  const facts = [pages && `${pages} pages`, book.published].filter(Boolean).join(' · ');
  const factsY = author.bottom + 21;
  const y = Math.max(140, factsY + 30);
  const p = book.progress;
  const label = p ? `${p.page != null ? `page ${p.page}${p.total != null ? ` of ${p.total}` : ''} · ` : ''}${p.percent}%` : 'progress not shared yet';
  return frame(y + 30, currentDescription(book), `${text('CURRENTLY READING', 16, 23, 12, '#e9c995', 'font-weight="750"')}${art(artwork, 16, 37, 52, 80)}${title.svg}${author.svg}${text(facts, 82, factsY, 13)}${text(label, 16, y, 15, '#f1d4a6', 'font-weight="650"')}<rect x="16" y="${y + 12}" width="328" height="5" rx="2.5" fill="#45474b"/>${p ? `<rect x="16" y="${y + 12}" width="${Math.max(0, Math.min(100, Number(p.percent) || 0)) * 3.28}" height="5" rx="2.5" fill="#e9c995"/>` : ''}`, '#292b2c');
}

export function renderMobileFilm(film, artwork, index, kit) {
  const title = lines(film.title, 80, 48, 264);
  const meta = `${film.year || ''}${film.liked ? ' · ♥ liked' : ''}`;
  const note = lines(film.review || (film.liked ? 'liked. evidence duly noted.' : 'logged without further comment.'), 16, Math.max(125, title.bottom + 47), 328, 14, 3, '#d0dce5', 500);
  const rating = kit.normaliseRating(film.rating);
  const alt = `${film.title}${film.year ? ` (${film.year})` : ''}. ${rating ? `${rating} out of 5 stars.` : 'Unrated.'} ${film.review || ''}`;
  return frame(note.bottom + 17, alt, `${text(`WATCH / 0${index + 1}`, 16, 23, 12, '#96d6ec', 'font-weight="750"')}${text(rating ? `${rating} ★` : 'unrated', 344, 23, 14, '#ffe58c', 'text-anchor="end" font-weight="700"')}${art(artwork, 16, 37, 50, 76)}${title.svg}${text(meta, 80, title.bottom + 23, 14)}${note.svg}`, '#21313d');
}

export function renderMobileMusic(data, artwork) {
  const unknown = data.playbackState === 'unknown' || data.source === 'unavailable';
  const label = unknown ? 'awaiting playback' : data.isNowPlaying ? 'now playing' : data.playbackState === 'paused' ? 'paused' : 'last played';
  const title = lines(unknown ? 'waiting for a signal' : data.title, 105, 48, 239, 20, 3);
  const artist = lines(unknown ? 'no track is guessed' : data.artist, 105, title.bottom + 21, 239, 14, 2, '#e0ced9', 600);
  const album = unknown ? { svg: '', bottom: artist.bottom } : lines(data.album || 'album metadata not listed', 105, artist.bottom + 20, 239, 13, 2, '#d0bbcb', 500);
  const y = Math.max(136, album.bottom + 14);
  const record = `<circle cx="75" cy="77" r="43" fill="#100f18" stroke="#6a546c"/><circle cx="75" cy="77" r="12" fill="#f95378"/>${art(artwork, 16, 37, 73, 80)}`;
  return frame(y + 43, `${unknown ? 'Apple Music: awaiting verified playback' : `${label}: ${data.title} by ${data.artist}. Album: ${data.album || 'not listed'}`}`, `${text('APPLE MUSIC', 16, 23, 12, '#ff94ab', 'font-weight="750"')}${record}${title.svg}${artist.svg}${album.svg}${pill(label, 16, y, 151, '#40334e', '#eddfec')}${text('open Apple Music ↗', 344, y + 19, 13, '#e4cbd9', 'text-anchor="end" font-weight="600"')}`, '#302333');
}

export function renderMobileInstagram(data, avatar) {
  return frame(126, `Instagram profile @${data.username}. Photos, stories, and whatever made the grid.`, `${art(avatar, 16, 26, 64, 64, true)}<circle cx="70" cy="82" r="13" fill="#c13584" stroke="#19232e" stroke-width="3"/><rect x="64" y="76" width="12" height="12" rx="4" fill="none" stroke="#fff"/><circle cx="70" cy="82" r="3" fill="none" stroke="#fff"/>${text('INSTAGRAM', 96, 28, 12, '#ffadd3', 'font-weight="750"')}${text(`@${data.username}`, 96, 55, 22, '#fffaf5', 'font-weight="750"')}${text('open ↗', 344, 55, 14, '#e3d1df', 'text-anchor="end"')}${lines('photos , stories , and whatever made the grid.', 96, 78, 248, 14, 2, '#dcc8d9', 500).svg}`, '#29303d');
}

export function renderMobileDiscord(data, avatar) {
  const statuses = { online: ['online', '#74cba4'], idle: ['idle', '#f2c578'], dnd: ['do not disturb', '#ff8d9c'], offline: ['offline', '#b7c2d0'], unknown: ['presence unavailable', '#b7c2d0'] };
  const [status, color] = statuses[data.status] || statuses.unknown;
  const name = lines(data.displayName, 86, 52, 258, 22, 2);
  const user = lines(`@${data.username}${data.guildTag ? ` · ${data.guildTag}` : ''}`, 86, name.bottom + 21, 258, 14, 2);
  const activity = lines(data.activity, 16, Math.max(115, user.bottom + 25), 328, 14, 2);
  const y = activity.bottom + 18;
  return frame(y + 38, `Discord profile @${data.username}. ${status}. ${data.activity}. ${data.devices?.length ? `Active on ${data.devices.join(', ')}.` : ''}`, `${text('DISCORD / PRESENCE', 16, 24, 12, '#aebdff', 'font-weight="750"')}${text('open profile ↗', 344, 24, 12, '#d8dcff', 'text-anchor="end"')}${art(avatar, 16, 39, 54, 54, true)}${name.svg}${user.svg}<circle cx="64" cy="87" r="7" fill="${color}" stroke="#20283a" stroke-width="2"/>${activity.svg}${pill(status, 16, y, 184, '#313f54', color)}${text(`since ${data.memberSince}`, 344, y + 19, 13, '#c9d6e3', 'text-anchor="end"')}`, '#203c49', '#7b99c4');
}

export function renderMobileHero(desktop) {
  const heading = desktop.match(/<!-- HERO-HEADING:START -->\s*([\s\S]*?)\s*<!-- HERO-HEADING:END -->/)?.[1];
  if (!heading) throw new Error('Cannot find outlined hero heading for mobile rendering');
  const moved = heading.replace('translate(54 139) scale(1 -1)', 'translate(20 79) scale(.9 -.9)');
  return frame(176, "hii , i'm hn. i build things for screens. off-screen , there’s usually a book involved and music playing somewhere.", `${text('●  HN / ONLINE-ISH', 20, 27, 12, '#cfe5f3', 'font-weight="650"')}${moved}${text('i build things for screens.', 20, 111, 15, '#dce9f3')}${text('off-screen , there’s usually a book involved', 20, 133, 14, '#dce9f3')}${text('and music playing somewhere.', 20, 154, 14, '#dce9f3')}<path d="M300 42h30v37h-30zM307 52h16m-16 8h11" fill="#9ed8ed" fill-opacity=".08" stroke="#a7d1f0" stroke-width="1.5" stroke-linecap="round"/>`, '#2a495c', '#8ebcd5');
}

export function renderMobileSocial() {
  const chips = [['BOOKS', '#f0cf94'], ['FILMS', '#96d6ec'], ['MUSIC', '#ff869f'], ['PRESENCE', '#a6a6ff']];
  return frame(145, "stalk me , but keep it legal. on socials , go ahead. everything else? that's red , red (cortis). Books, films, music and presence.", `${text('SOCIAL DIRECTORY / 04 TRAILS', 16, 24, 12, '#a3e2de', 'font-weight="750"')}${text('stalk me , but keep it legal.', 16, 53, 22, '#fffaf5', 'font-weight="750"')}${text('on socials , go ahead. everything else?', 16, 77, 14)}${text("that's red , red", 16, 97, 14, '#ff9f9a')}${text('(cortis)', 119, 91, 11, '#c8bbd4')}${chips.map(([label, fg], i) => pill(label, 16 + i * 83, 109, i === 3 ? 80 : 76, '#323b50', fg, 12)).join('')}`, '#223a46');
}
