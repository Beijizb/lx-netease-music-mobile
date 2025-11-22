import music from '@/utils/musicSdk'

export declare interface ListInfo {
  list: LX.Music.MusicInfoOnline[]
  total: number
  page: number
  maxPage: number
  limit: number
  key: string | null
}

interface ListInfos extends Partial<Record<LX.OnlineSource, ListInfo>> {
  all: ListInfo
}

export type Source = LX.OnlineSource | 'all'

export interface InitState {
  searchText: string
  source: Source
  sources: Source[]
  listInfos: ListInfos
  maxPages: Partial<Record<LX.OnlineSource, number>>
}

const state: InitState = {
  searchText: '',
  source: 'wy',
  sources: [],
  listInfos: {
    all: {
      page: 1,
      maxPage: 0,
      limit: 30,
      total: 0,
      list: [],
      key: null,
    },
  },
  maxPages: {},
}

for (const source of music.sources) {
  // bilibili 现在是内置源，需要 musicSearch 方法
  if (music[source.id as LX.OnlineSource]?.musicSearch) {
    state.sources.push(source.id as LX.OnlineSource)
    state.listInfos[source.id as LX.OnlineSource] = {
      page: 1,
      maxPage: 0,
      limit: 30,
      total: 0,
      list: [],
      key: '',
    }
    state.maxPages[source.id as LX.OnlineSource] = 0
    // 调试日志：确认 B站源已添加
    if (source.id === 'bi') {
      console.log('[Search] B站源已添加到搜索源列表:', state.sources)
    }
  }
}
state.sources.push('all')
console.log('[Search] 最终搜索源列表:', state.sources)

export default state
