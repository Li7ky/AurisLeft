/* Probe Kuwo free APIs */
async function main() {
  const keyword = process.argv[2] || 'daoxiang zhoujielun';
  const searchUrl =
    `https://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}` +
    `&ft=music&itemset=web_2013&client=kt&pn=0&rn=5&rformat=json&encoding=utf8`;
  const text = await (
    await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.kuwo.cn/',
      },
    })
  ).text();
  let data;
  try {
    data = JSON.parse(text.replace(/'/g, '"'));
  } catch {
    data = JSON.parse(text);
  }
  const list = data.abslist || [];
  console.log('found', list.length);
  for (const s of list.slice(0, 3)) {
    console.log('-', s.SONGNAME, s.ARTIST, s.MUSICRID);
  }
  const rid = String(list[0]?.MUSICRID || '')
    .replace(/^MUSIC_/i, '')
    .trim();
  if (!rid) return;
  const tries = [
    `https://www.kuwo.cn/api/v1/www/music/playUrl?mid=${rid}&type=music&httpsStatus=1`,
    `http://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=${rid}&format=mp3&response=url&br=320kmp3`,
    `https://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=MUSIC_${rid}&format=mp3&response=url&br=128kmp3`,
    `https://mobi.kuwo.cn/mobi.s?f=web&type=convert_url_with_sign&rid=${rid}&br=320kmp3`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          Referer: 'https://www.kuwo.cn/',
        },
        redirect: 'follow',
      });
      const t = await r.text();
      console.log('\nSTATUS', r.status, u.slice(0, 100));
      console.log(t.slice(0, 300));
    } catch (e) {
      console.log('\nERR', u.slice(0, 80), e.message);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
