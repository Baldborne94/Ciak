import { describe, it, expect } from 'vitest'
import { idDaUrlInfo, taglia } from './filmOffline'

describe('taglia', () => {
  it('scrive GB con la virgola e MB tondi', () => {
    expect(taglia(2147483648)).toBe('2,0 GB')
    expect(taglia(325058560)).toBe('310 MB')
  })

  it('niente per una dimensione sconosciuta', () => {
    expect(taglia(null)).toBe('')
    expect(taglia(0)).toBe('')
  })
})

describe('idDaUrlInfo', () => {
  it('riconosce la scheda di un film in cache', () => {
    expect(idDaUrlInfo('https://ciak.vercel.app/film-offline/1AbC_dEf-GhI/info.json')).toBe('1AbC_dEf-GhI')
  })

  it('ignora il file del film e tutto il resto', () => {
    expect(idDaUrlInfo('https://ciak.vercel.app/film-offline/1AbC_dEf-GhI')).toBeNull()
    expect(idDaUrlInfo('https://ciak.vercel.app/index.html')).toBeNull()
  })
})
