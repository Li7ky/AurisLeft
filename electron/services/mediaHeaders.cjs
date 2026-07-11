/**
 * Shared CDN headers for audio download / stream proxy.
 */
function pickMediaHeaders(targetUrl) {
  const u = String(targetUrl || '');
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  if (/music\.126\.net|126\.net|music\.163\.com/i.test(u)) {
    headers.Referer = 'https://music.163.com/';
    headers.Origin = 'https://music.163.com';
  } else if (/kuwo|kwcdn|sycdn\.kuwo|panspace\.kuwo/i.test(u)) {
    headers.Referer = 'https://www.kuwo.cn/';
    headers.Origin = 'https://www.kuwo.cn';
  } else if (/kugou|kgimg|fanxing/i.test(u)) {
    headers.Referer = 'https://www.kugou.com/';
    headers.Origin = 'https://www.kugou.com';
  } else if (
    /gtimg|qq\.com|myqcloud|tencentmusic|qqmusic|isure\d*\.stream\.qqmusic/i.test(u)
  ) {
    headers.Referer = 'https://y.qq.com/';
    headers.Origin = 'https://y.qq.com';
  } else if (/migu/i.test(u)) {
    headers.Referer = 'https://music.migu.cn/';
  }
  return headers;
}

module.exports = { pickMediaHeaders };
