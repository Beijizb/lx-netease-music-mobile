import searchMusicState, { type Source } from '@/store/search/music/state'
import searchMusicActions, { type SearchResult } from '@/store/search/music/action'
import musicSdk from '@/utils/musicSdk'
import { sendAction, type ResponseParams } from '@/utils/nativeModules/userApi'
import BackgroundTimer from 'react-native-background-timer'
import { toNewMusicInfo } from '@/utils'

export const setSource: (typeof searchMusicActions)['setSource'] = (source) => {
  searchMusicActions.setSource(source)
}
export const setSearchText: (typeof searchMusicActions)['setSearchText'] = (text) => {
  searchMusicActions.setSearchText(text)
}
export const setListInfo: typeof searchMusicActions.setListInfo = (result, id, page) => {
  return searchMusicActions.setListInfo(result, id, page)
}

export const clearListInfo: typeof searchMusicActions.clearListInfo = (source) => {
  searchMusicActions.clearListInfo(source)
}

// 调用自定义源的 searchMusic action
const searchMusicFromUserApi = async (
  source: 'bi',
  keyword: string,
  page: number,
  limit: number
): Promise<SearchResult> => {
  return new Promise<SearchResult>((resolve, reject) => {
    const requestKey = `search__${Math.random().toString().substring(2)}`
    let timeout: number | null = null
    let isResolved = false

    const cleanup = () => {
      if (timeout) BackgroundTimer.clearTimeout(timeout)
      global.state_event.off('userApiSearchResponse', handleResponse)
    }

    const handleResponse = (event: { requestKey: string; result: any; status: boolean; errorMessage?: string }) => {
      if (event.requestKey !== requestKey || isResolved) return
      isResolved = true
      cleanup()

      if (!event.status) {
        reject(new Error(event.errorMessage ?? 'search failed'))
        return
      }

      try {
        // 自定义源返回的数据结构：{ data: { list: [...], total: number, page: number, limit: number } }
        const result = event.result
        const list = (result?.data?.list ?? []).map((item: any) => {
          // 将自定义源返回的歌曲数据转换为标准格式
          const musicId = item.id || `${source}_${item.bvid || item.aid || item.cid || Math.random()}`
          const duration = item.interval || item.duration
          const durationStr = typeof duration === 'number' 
            ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
            : duration || null

          return {
            id: musicId,
            name: item.name || item.title || '',
            singer: item.singer || item.artist || item.author || '',
            source: source as LX.OnlineSource,
            interval: durationStr,
            meta: {
              songId: item.id || item.bvid || item.aid || '',
              albumName: item.albumName || item.album || '',
              picUrl: item.picUrl || item.pic || item.artwork || null,
              qualitys: item.qualitys || [{ type: '128k', size: null }],
              _qualitys: item._qualitys || { '128k': {} },
              // 保存扩展字段到 meta 中
              ...(item.bvid ? { bvid: item.bvid } : {}),
              ...(item.cid ? { cid: item.cid } : {}),
              ...(item.aid ? { aid: item.aid } : {}),
            },
          } as LX.Music.MusicInfoOnline
        })

        resolve({
          list: list.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[],
          total: result?.data?.total ?? list.length,
          allPage: Math.ceil((result?.data?.total ?? list.length) / limit),
          limit,
          source: source as LX.OnlineSource,
        })
      } catch (err: any) {
        reject(new Error(err.message || 'parse search result failed'))
      }
    }

    global.state_event.on('userApiSearchResponse', handleResponse)

    timeout = BackgroundTimer.setTimeout(() => {
      if (!isResolved) {
        isResolved = true
        cleanup()
        reject(new Error('search timeout'))
      }
    }, 20_000)

    // 发送搜索请求
    sendAction('request', {
      requestKey,
      data: {
        source,
        action: 'searchMusic',
        info: {
          keyword,
          page,
          limit,
        },
      },
    })
  })
}

export const search = async (
  text: string,
  page: number,
  sourceId: Source
): Promise<LX.Music.MusicInfoOnline[]> => {
  const listInfo = searchMusicState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${text}`
  
  // 处理 bilibili 自定义源
  if (sourceId === 'bi') {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    listInfo.key = key
    try {
      const data = await searchMusicFromUserApi('bi', text, page, listInfo.limit)
      if (key != listInfo.key) return []
      return setListInfo(data, page, text)
    } catch (err: any) {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    }
  }

  if (sourceId == 'all') {
    listInfo.key = key
    let task = []
    for (const source of searchMusicState.sources) {
      if (source == 'all') continue
      if (source === 'bi') {
        // bilibili 使用自定义源搜索
        task.push(
          searchMusicFromUserApi('bi', text, page, searchMusicState.listInfos.all.limit).catch((error: any) => {
            console.log(error)
            return {
              allPage: 1,
              limit: 30,
              list: [],
              source: 'bi' as LX.OnlineSource,
              total: 0,
            }
          })
        )
      } else {
        task.push(
          (
            (musicSdk[source]?.musicSearch.search(
              text,
              page,
              searchMusicState.listInfos.all.limit
            ) as Promise<SearchResult>) ?? Promise.reject(new Error('source not found: ' + source))
          ).catch((error: any) => {
            console.log(error)
            return {
              allPage: 1,
              limit: 30,
              list: [],
              source,
              total: 0,
            }
          })
        )
      }
    }
    return Promise.all(task).then((results: SearchResult[]) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(results, page, text)
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    listInfo.key = key
    return (
      musicSdk[sourceId]?.musicSearch
        .search(text, page, listInfo.limit)
        .then((data: SearchResult) => {
          if (key != listInfo.key) return []
          return setListInfo(data, page, text)
        }) ?? Promise.reject(new Error('source not found: ' + sourceId))
    ).catch((err: any) => {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}
