/*!
 * @name Bilibili 音源
 * @description 支持 Bilibili 视频/音频搜索和播放
 * @version v1.0.0
 * @author LX Music
 */

const { EVENT_NAMES, request, on, send, utils, env, version } = globalThis.lx;

// Bilibili API 相关配置
const searchHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
  accept: "application/json, text/plain, */*",
  "accept-encoding": "gzip, deflate, br",
  origin: "https://search.bilibili.com",
  "sec-fetch-site": "same-site",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  referer: "https://search.bilibili.com/",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};

const playHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
  accept: "*/*",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};

let cookie = null;

// 获取 Cookie
async function getCookie() {
  if (cookie) return cookie;
  try {
    const resp = await new Promise((resolve, reject) => {
      request(
        "https://api.bilibili.com/x/frontend/finger/spi",
        {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/114.0.0.0",
          },
        },
        (err, resp) => {
          if (err) return reject(err);
          resolve(resp);
        }
      );
    });
    const data = resp.body?.data;
    if (data) {
      cookie = data;
      return cookie;
    }
  } catch (error) {
    console.log("getCookie error:", error);
  }
  return null;
}

// 将时长转换为秒数
function durationToSec(duration) {
  if (typeof duration === "number") {
    return duration;
  }
  if (typeof duration === "string") {
    const dur = duration.split(":");
    return dur.reduce((prev, curr) => 60 * prev + +curr, 0);
  }
  return 0;
}

// 将秒数转换为 MM:SS 格式
function secToDuration(sec) {
  if (typeof sec !== "number") return null;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 搜索音乐
async function handleSearchMusic(keyword, page, limit) {
  try {
    await getCookie();
    const pageSize = limit || 20;
    
    const params = {
      context: "",
      page: page,
      order: "",
      page_size: pageSize,
      keyword: keyword,
      duration: "",
      tids_1: "",
      tids_2: "",
      __refresh__: true,
      _extra: "",
      highlight: 1,
      single_column: 0,
      platform: "pc",
      from_source: "",
      search_type: "video",
      dynamic_offset: 0,
    };

    const cookieStr = cookie ? `buvid3=${cookie.b_3};buvid4=${cookie.b_4}` : "";
    const headers = { ...searchHeaders };
    if (cookieStr) headers.cookie = cookieStr;

    const resp = await new Promise((resolve, reject) => {
      const url = `https://api.bilibili.com/x/web-interface/search/type?${Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join("&")}`;
      request(url, { method: "GET", headers }, (err, resp) => {
        if (err) return reject(err);
        resolve(resp);
      });
    });

    const resultData = resp.body?.data;
    if (!resultData || !resultData.result) {
      throw new Error("搜索失败：返回数据格式错误");
    }

    const list = resultData.result.map((item) => {
      const title = item.title?.replace(/(<em(.*?)>)|(<\/em>)/g, "") || "";
      const duration = durationToSec(item.duration);
      
      return {
        id: item.bvid || item.aid || `bi_${item.cid || Math.random()}`,
        name: title,
        singer: item.author || item.owner?.name || "未知UP主",
        source: "bi",
        interval: secToDuration(duration),
        meta: {
          songId: item.bvid || item.aid || "",
          albumName: item.bvid || item.aid || "",
          picUrl: item.pic?.startsWith("//") ? `http:${item.pic}` : item.pic || null,
          qualitys: [{ type: "128k", size: null }],
          _qualitys: { "128k": {} },
          bvid: item.bvid,
          cid: item.cid,
          aid: item.aid,
        },
      };
    });

    return {
      list,
      total: resultData.numResults || list.length,
      page: page,
      limit: pageSize,
    };
  } catch (error) {
    console.log("handleSearchMusic error:", error);
    throw error;
  }
}

// 获取音乐 URL
async function handleGetMusicUrl(musicInfo, quality) {
  try {
    const bvid = musicInfo.meta?.bvid;
    const aid = musicInfo.meta?.aid;
    const cid = musicInfo.meta?.cid;

    if (!bvid && !aid) {
      throw new Error("缺少 bvid 或 aid");
    }

    // 如果没有 cid，先获取
    let finalCid = cid;
    if (!finalCid) {
      const params = bvid ? { bvid } : { aid };
      const resp = await new Promise((resolve, reject) => {
        const url = `https://api.bilibili.com/x/web-interface/view?${Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
          .join("&")}`;
        request(url, { method: "GET", headers: playHeaders }, (err, resp) => {
          if (err) return reject(err);
          resolve(resp);
        });
      });
      const data = resp.body?.data;
      if (data && data.pages && data.pages.length > 0) {
        finalCid = data.pages[0].cid;
      } else {
        throw new Error("无法获取 cid");
      }
    }

    // 获取播放地址
    const params = {
      ...(bvid ? { bvid } : { aid }),
      cid: finalCid,
      fnval: 16, // 请求 dash 格式
    };

    const resp = await new Promise((resolve, reject) => {
      const url = `https://api.bilibili.com/x/player/playurl?${Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join("&")}`;
      request(url, { method: "GET", headers: playHeaders }, (err, resp) => {
        if (err) return reject(err);
        resolve(resp);
      });
    });

    const data = resp.body?.data;
    if (!data) {
      throw new Error("获取播放地址失败");
    }

    let url = null;
    let headers = {};

    // 优先使用 dash.audio
    if (data.dash && data.dash.audio && data.dash.audio.length > 0) {
      const audios = data.dash.audio;
      // 按带宽排序，选择合适音质
      audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
      url = audios[0].base_url || audios[0].backup_url?.[0];
      
      if (url) {
        const hostUrl = url.substring(url.indexOf("/") + 2);
        headers = {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
          accept: "*/*",
          host: hostUrl.substring(0, hostUrl.indexOf("/")),
          "accept-encoding": "gzip, deflate, br",
          connection: "keep-alive",
          referer: `https://www.bilibili.com/video/${bvid || aid}`,
        };
      }
    } else if (data.durl && data.durl.length > 0) {
      // 降级使用 durl
      url = data.durl[0].url;
    }

    if (!url) {
      throw new Error("无法获取播放地址");
    }

    // 返回 URL（移动端可能需要特殊处理 headers）
    return url;
  } catch (error) {
    console.log("handleGetMusicUrl error:", error);
    throw error;
  }
}

// 定义支持的源
const musicSources = {
  bi: {
    name: "bilibili",
    type: "music",
    actions: ["searchMusic", "musicUrl"],
    qualitys: ["128k"], // Bilibili 音频质量
  },
};

// 处理请求
on(EVENT_NAMES.request, ({ action, source, info }) => {
  switch (action) {
    case "searchMusic":
      if (env != "mobile") {
        console.group(`Handle Action(searchMusic)`);
        console.log("source", source);
        console.log("keyword", info.keyword);
        console.log("page", info.page);
      } else {
        console.log(`Handle Action(searchMusic)`);
        console.log("source", source);
        console.log("keyword", info.keyword);
        console.log("page", info.page);
      }
      return handleSearchMusic(info.keyword, info.page || 1, info.limit || 20)
        .then((data) => Promise.resolve(data))
        .catch((err) => Promise.reject(err));

    case "musicUrl":
      if (env != "mobile") {
        console.group(`Handle Action(musicUrl)`);
        console.log("source", source);
        console.log("quality", info.type);
        console.log("musicInfo", info.musicInfo);
      } else {
        console.log(`Handle Action(musicUrl)`);
        console.log("source", source);
        console.log("quality", info.type);
        console.log("musicInfo", info.musicInfo);
      }
      return handleGetMusicUrl(info.musicInfo, info.type)
        .then((data) => Promise.resolve(data))
        .catch((err) => Promise.reject(err));

    default:
      console.error(`action(${action}) not support`);
      return Promise.reject("action not support");
  }
});

// 导出 sources
if (typeof module !== "undefined" && module.exports) {
  module.exports = { sources: musicSources };
} else {
  globalThis.lx.sources = musicSources;
}

