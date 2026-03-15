import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface Land {
  id: number
  plantName?: string
  phaseName?: string
  seedImage?: string
  status: string
  matureInSec: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  [key: string]: any
}

export const useFarmStore = defineStore('farm', () => {
  const lands = ref<Land[]>([])
  const seeds = ref<any[]>([])
  const summary = ref<any>({})
  const loading = ref(false)
  const seedsError = ref('')

  async function fetchLands(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/lands', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok) {
        lands.value = data.data.lands || []
        summary.value = data.data.summary || {}
      }
    }
    finally {
      loading.value = false
    }
  }

  async function fetchSeeds(accountId: string) {
    if (!accountId)
      return
    seedsError.value = ''
    try {
      const { data } = await api.get('/api/seeds', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok) {
        seeds.value = data.data || []
        return
      }
      seeds.value = []
      seedsError.value = data?.message || '获取种子失败'
    }
    catch (error: any) {
      seeds.value = []
      seedsError.value = error?.response?.data?.message || error?.message || '获取种子失败'
    }
  }

  async function operate(accountId: string, opType: string) {
    if (!accountId)
      return
    await api.post('/api/farm/operate', { opType }, {
      headers: { 'x-account-id': accountId },
    })
    await fetchLands(accountId)
  }

  return { lands, summary, seeds, loading, seedsError, fetchLands, fetchSeeds, operate }
})
