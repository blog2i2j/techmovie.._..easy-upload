import { base64ToBlob } from './common';
import { Buffer } from 'buffer/index';
import { CURRENT_SITE_INFO, CURRENT_SITE_NAME } from '../const';
import { getLocationSearchValueByKey, GMFetch } from '../common';
import $ from 'jquery';

export default async (info:TorrentInfo.Info) => {
  const { musicJson } = info;
  if (!musicJson) {
    return;
  }
  const { name, year, recordLabel, catalogueNumber } = musicJson.group;
  const { remasterTitle, remasterCatalogueNumber, remasterRecordLabel } = musicJson.torrent;
  const groupId = getLocationSearchValueByKey('groupid');
  if (!groupId) {
    const searchResult = await GMFetch(`/ajax.php?action=browse&searchstr=${name} ${year}`, {
      responseType: 'json',
    });
    if (searchResult.status === 'success' && searchResult.response.results.length > 0) {
      const groupId = searchResult.response.results[0].groupId;
      const timestampMatchArray = location.hash && location.hash.match(/(^|#)timestamp=([^#]*)(#|$)/);
      const timestamp = timestampMatchArray?.[2] ?? '';
      location.href = `${CURRENT_SITE_INFO.url}${CURRENT_SITE_INFO.uploadPath}?groupid=${groupId}#timestamp=${timestamp}`;
      return;
    }
  }
  if (CURRENT_SITE_NAME === 'Orpheus') {
    if (!remasterCatalogueNumber && !remasterRecordLabel && !remasterTitle && !recordLabel && !catalogueNumber) {
      musicJson.torrent.remastered = false;
    }
  }
  if (CURRENT_SITE_NAME === 'DicMusic') {
    musicJson.group.wikiBody = toUnicodeEntities(musicJson.group.wikiBody);
  }
  fillJsonToUploadTable(musicJson, name);
};
function fillJsonToUploadTable (musicJson:MusicJson.Info, name:string) {
  const buf = Buffer.from(JSON.stringify({
    status: 'success',
    response: musicJson,
  }));
  attachFile({
    data: buf,
    selector: '#torrent-json-file',
    contentType: 'application/json',
    fileName: name,
    format: 'json',
  });
}

interface AttachFileOptions {
  data: string | Buffer;
  selector: string;
  contentType: string;
  fileName: string;
  format: string;
  charset?: string;
}

function attachFile ({ data, selector, contentType, fileName, format, charset = 'UTF-8' }: AttachFileOptions): void {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, charset);
  const base64Data = buf.toString('base64');
  const fileInput = $(selector);
  if (base64Data && fileInput.length > 0) {
    const blob = base64ToBlob(base64Data, contentType);
    const file = new File([blob], `${fileName}.${format}`, { type: contentType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const uploadInput = fileInput[0] as HTMLInputElement;
    uploadInput.files = dataTransfer.files;
    uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function toUnicodeEntities (str:string) {
  const excludedChars = ['<', '>', '&', ';', '/'];
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    if (code > 127 && !excludedChars.includes(char)) {
      const hexCode = code.toString(16);
      return `&#${parseInt(hexCode, 16)};`;
    }
    return char;
  }).join('');
}
