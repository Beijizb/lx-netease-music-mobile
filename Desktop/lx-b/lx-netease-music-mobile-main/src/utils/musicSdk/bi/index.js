import musicSearch from './musicSearch'
import { httpFetch } from '../../request'

const playHeaders = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63',
  accept: '*/*',
  'accept-encoding': 'gzip, deflate, br',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
}

// 获取音乐 URL
async function getMusicUrl(songInfo, type) {
  try {
    const bvid = songInfo.meta?.bvid
    const aid = songInfo.meta?.aid
    const cid = songInfo.meta?.cid

    if (!bvid && !aid) {
      throw new Error('缺少 bvid 或 aid')
    }

    // 如果没有 cid，先获取
    let finalCid = cid
    if (!finalCid) {
      const params = bvid ? { bvid } : { aid }
      const viewUrl = `https://api.bilibili.com/x/web-interface/view?${Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&')}`

      const requestObj = httpFetch(viewUrl, {
        method: 'GET',
        headers: playHeaders,
      })

      const resp = await requestObj.promise
      const data = resp.body?.data

      if (data && data.pages && data.pages.length > 0) {
        finalCid = data.pages[0].cid
      } else {
        throw new Error('无法获取 cid')
      }
    }

    // 获取播放地址
    const params = {
      ...(bvid ? { bvid } : { aid }),
      cid: finalCid,
      fnval: 16, // 请求 dash 格式
    }

    const playUrl = `https://api.bilibili.com/x/player/playurl?${Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')}`

    const requestObj = httpFetch(playUrl, {
      method: 'GET',
      headers: playHeaders,
    })

    const resp = await requestObj.promise
    const data = resp.body?.data

    if (!data) {
      throw new Error('获取播放地址失败')
    }

    let url = null

    // 优先使用 dash.audio
    if (data.dash && data.dash.audio && data.dash.audio.length > 0) {
      const audios = data.dash.audio
      // 按带宽排序，选择合适音质
      audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
      url = audios[0].base_url || audios[0].backup_url?.[0]
    } else if (data.durl && data.durl.length > 0) {
      // 降级使用 durl
      url = data.durl[0].url
    }

    if (!url) {
      throw new Error('无法获取播放地址')
    }

    // 返回 URL（移动端可能需要特殊处理 headers）
    return url
  } catch (error) {
    console.error('[Bilibili] getMusicUrl error:', error.message || error)
    throw error
  }
}

const bi = {
  musicSearch,
  getMusicUrl(songInfo, type) {
    return {
      promise: getMusicUrl(songInfo, type).then((url) => {
        return { type, url }
      }),
      canceleFn() {
        // 取消请求（如果需要）
      },
    }
  },
  getMusicDetailPageUrl(songInfo) {
    const bvid = songInfo.meta?.bvid
    const aid = songInfo.meta?.aid
    if (bvid) {
      return `https://www.bilibili.com/video/${bvid}`
    } else if (aid) {
      return `https://www.bilibili.com/video/av${aid}`
    }
    return null
  },
}

export default bi

