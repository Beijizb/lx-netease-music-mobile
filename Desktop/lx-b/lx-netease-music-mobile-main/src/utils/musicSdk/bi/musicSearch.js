import { httpFetch } from '../../request'
import { formatPlayTime } from '../../index'

// 将秒数转换为 MM:SS 格式（用于处理字符串格式的时长）
function secToDuration(sec) {
  if (typeof sec !== 'number') {
    if (typeof sec === 'string') {
      // 如果已经是字符串格式，直接返回
      if (/^\d+:\d{2}$/.test(sec)) return sec
      // 尝试解析
      const dur = sec.split(':')
      if (dur.length >= 2) {
        const totalSec = dur.reduce((prev, curr) => 60 * prev + +curr, 0)
        return formatPlayTime(totalSec)
      }
    }
    return null
  }
  return formatPlayTime(sec)
}

const searchHeaders = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63',
  accept: 'application/json, text/plain, */*',
  'accept-encoding': 'gzip, deflate, br',
  origin: 'https://search.bilibili.com',
  'sec-fetch-site': 'same-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
  referer: 'https://search.bilibili.com/',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
}

let cookie = null

// 获取 Cookie
async function getCookie() {
  if (cookie) {
    return cookie
  }
  try {
    const requestObj = httpFetch('https://api.bilibili.com/x/frontend/finger/spi', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/114.0.0.0',
      },
    })
    const resp = await requestObj.promise
    const data = resp.body?.data
    if (data) {
      cookie = data
      return cookie
    }
  } catch (error) {
    console.error('[Bilibili] getCookie error:', error.message || error)
  }
  return null
}

// 将时长转换为秒数
function durationToSec(duration) {
  if (typeof duration === 'number') {
    return duration
  }
  if (typeof duration === 'string') {
    const dur = duration.split(':')
    return dur.reduce((prev, curr) => 60 * prev + +curr, 0)
  }
  return 0
}


export default {
  limit: 20,
  total: 0,
  page: 0,
  allPage: 1,

  async musicSearch(str, page, limit) {
    try {
      await getCookie()
      const pageSize = limit || this.limit

      const params = {
        context: '',
        page: page,
        order: '',
        page_size: pageSize,
        keyword: str,
        duration: '',
        tids_1: '',
        tids_2: '',
        __refresh__: true,
        _extra: '',
        highlight: 1,
        single_column: 0,
        platform: 'pc',
        from_source: '',
        search_type: 'video',
        dynamic_offset: 0,
      }

      const cookieStr = cookie ? `buvid3=${cookie.b_3};buvid4=${cookie.b_4}` : ''
      const headers = { ...searchHeaders }
      if (cookieStr) headers.cookie = cookieStr

      const searchUrl = `https://api.bilibili.com/x/web-interface/search/type?${Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&')}`

      const requestObj = httpFetch(searchUrl, {
        method: 'GET',
        headers,
      })

      const resp = await requestObj.promise

      // 处理响应数据
      let bodyData = resp.body
      if (typeof bodyData === 'string') {
        try {
          bodyData = JSON.parse(bodyData)
        } catch (e) {
          console.error('[Bilibili] 解析响应 JSON 失败:', e)
          throw new Error('搜索失败：响应数据格式错误')
        }
      }

      // B站 API 返回格式: { code: 0, data: { result: [...], numResults: number } }
      if (bodyData?.code !== 0 && bodyData?.code !== undefined) {
        console.error('[Bilibili] API 返回错误码:', bodyData.code, bodyData.message)
        throw new Error(`搜索失败：${bodyData.message || '未知错误'}`)
      }

      const resultData = bodyData?.data
      if (!resultData) {
        throw new Error('搜索失败：返回数据格式错误')
      }

      // result 可能是数组，也可能是对象（包含 vlist 等）
      let resultList = resultData.result
      if (!resultList) {
        throw new Error('搜索失败：搜索结果为空')
      }

      // 如果 result 是对象，尝试获取 vlist
      if (!Array.isArray(resultList)) {
        if (resultList.vlist && Array.isArray(resultList.vlist)) {
          resultList = resultList.vlist
        } else {
          throw new Error('搜索失败：搜索结果格式错误')
        }
      }

      return {
        result: resultList,
        numResults: resultData.numResults || resultList.length,
        page: resultData.page,
      }
    } catch (error) {
      console.error('[Bilibili] musicSearch error:', error.message || error)
      throw error
    }
  },

  handleResult(rawList) {
    if (!rawList || !Array.isArray(rawList)) return []

    return rawList.map((item) => {
      const title = item.title?.replace(/(<em(.*?)>)|(<\/em>)/g, '') || ''
      const duration = durationToSec(item.duration)

      return {
        singer: item.author || item.owner?.name || '未知UP主',
        name: title,
        source: 'bi',
        interval: secToDuration(duration),
        songmid: item.bvid || item.aid || `bi_${item.cid || Math.random()}`,
        img: item.pic?.startsWith('//') ? `http:${item.pic}` : item.pic || null,
        types: [{ type: '128k', size: null }],
        _types: { '128k': {} },
        typeUrl: {},
        meta: {
          songId: item.bvid || item.aid || '',
          albumName: item.bvid || item.aid || '',
          picUrl: item.pic?.startsWith('//') ? `http:${item.pic}` : item.pic || null,
          qualitys: [{ type: '128k', size: null }],
          _qualitys: { '128k': {} },
          bvid: item.bvid,
          cid: item.cid,
          aid: item.aid,
        },
      }
    })
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit)
      .then((result) => {
        const list = this.handleResult(result.result || [])
        if (!list || list.length === 0) {
          if (retryNum < 3) {
            return this.search(str, page, limit, retryNum)
          }
          return {
            list: [],
            allPage: 1,
            limit: this.limit,
            total: 0,
            source: 'bi',
          }
        }

        this.total = result.numResults || list.length
        this.page = page
        this.allPage = Math.ceil(this.total / this.limit)

        return {
          list,
          allPage: this.allPage,
          limit: this.limit,
          total: this.total,
          source: 'bi',
        }
      })
      .catch((err) => {
        console.log('[Bilibili] 搜索错误，准备重试:', err.message, '次数:', retryNum)
        if (retryNum < 3) {
          return this.search(str, page, limit, retryNum)
        }
        return Promise.reject(err)
      })
  },
}

