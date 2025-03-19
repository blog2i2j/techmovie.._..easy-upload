import { PT_SITE } from '../const';
import {
  getLocationSearchValueByKey,
  getBDTypeBasedOnSize,
  parseMedia,
} from '../common';
import $ from 'jquery';

export default async (info:TorrentInfo.Info) => {
  const currentSiteInfo = PT_SITE.PTP;
  const {
    title, imdbUrl, tags, size,
    videoCodec = '', videoType,
    resolution,
  } = info;
  const groupId = getLocationSearchValueByKey('groupid');
  if (!groupId) {
    $(currentSiteInfo.imdb.selector).val(imdbUrl || 0);
    AutoFill();
  }
  info.resolution = getResolution(resolution, videoType, title);
  info.videoCodec = getVideoCodec(videoCodec, videoType, size);

  const keyArray = ['category', 'source', 'videoCodec', 'resolution'] as const;
  type Key = typeof keyArray[number]
  keyArray.forEach(key => {
    const { selector = '', map } = currentSiteInfo[key as Key];
    type MapKey = keyof typeof map
    if (map) {
      const mapValue = map[info[key as Key] as MapKey];
      $(selector).val(mapValue);
    } else {
      $(selector).val(info[key as Key] as MapKey);
    }
  });
  if (info.sourceSite.match(/PTP/i)) {
    $(currentSiteInfo.description.selector).val(info.originalDescription || '');
  } else {
    const description = getDescription(info);
    $(currentSiteInfo.description.selector).val(description);
  }

  const editionInfo = getEditionInfo(videoType, tags);
  if (editionInfo.length > 0) {
    $('#remaster').attr('checked', 'true');
    Remaster();
    editionInfo.forEach(edition => {
      const event = new Event('click');
      $('#remaster_tags a').filter(function () {
        return new RegExp(edition).test($(this).text());
      })[0].dispatchEvent(event);
    });
  }
  const infoFromMediaInfoinfo = parseMedia(info.mediaInfos[0]);
  if (infoFromMediaInfoinfo.subtitles && infoFromMediaInfoinfo.subtitles[0]) {
    infoFromMediaInfoinfo.subtitles.forEach(subtitle => {
      const subtitleSelector = $('.languageselector li').filter(function () {
        return new RegExp(subtitle).test($(this).text());
      });
      if (subtitle !== 'English' && subtitleSelector[0]) {
        subtitleSelector.find('input').attr('checked', 'true');
      }
    });
  }
};
const getEditionInfo = (videoType:string, tags:TorrentInfo.MediaTags) => {
  const editionInfo = [];
  if (videoType === 'remux') {
    editionInfo.push('Remux');
  }
  if (tags.hdr) {
    editionInfo.push('HDR10');
  }
  if (tags.hdr10_plus) {
    editionInfo.push('HDR10+');
  }
  if (tags.dolby_vision) {
    editionInfo.push('Dolby Vision');
  }
  if (tags.dolby_atmos) {
    editionInfo.push('Dolby Atmos');
  }
  if (tags.dts_x) {
    editionInfo.push('DTS:X');
  }
  return editionInfo;
};
const getVideoCodec = (videoCodec:string, videoType:string, size:number) => {
  if (videoType === 'bluray') {
    return getBDTypeBasedOnSize(size);
  } else if (videoType === 'dvd') {
    const GBSize = size / 1e9;
    if (GBSize < 5) {
      return 'DVD5';
    }
    return 'DVD9';
  }
  return videoCodec;
};
const getResolution = (resolution:string, videoType:string, title:string) => {
  if (videoType === 'DVD' && title.match(/NTSC/i)) {
    return 'NTSC';
  } else if (videoType === 'DVD' && title.match(/PAL/i)) {
    return 'PAL';
  }
  return resolution;
};
const getDescription = (info: TorrentInfo.Info) => {
  const { mediaInfos, comparisons, screenshots } = info;
  let filterDescription = '';
  if (mediaInfos.length > 0) {
    mediaInfos.forEach(mediaInfo => {
      /* eslint-disable no-irregular-whitespace */
      mediaInfo = mediaInfo.replace(/[\u00A0\u1680​\u180e\u2000-\u2009\u200a​\u200b​\u202f\u205f​\u3000]/g, '');
      filterDescription += `[mediainfo]${mediaInfo}[/mediainfo]\n`;
    });
  }
  if (comparisons && comparisons.length > 0) {
    for (const comparison of comparisons) {
      filterDescription += `\n${comparison.reason}[comparison=${comparison.title}]\n${comparison.imgs.join('\n')}\n[/comparison]\n\n`;
    }
  }
  return `${filterDescription}\n${screenshots.map(item => `[img]${item}[/img]`).join('\n')}`;
};
