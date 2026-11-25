import { describe, expect, it } from 'vitest'
import { leggiConfigurazione } from './configurazione'

// Su Vercel le chiavi sono nel bundle; sul NAS le scrive il server nella pagina.
const BUILD = {
  VITE_SUPABASE_URL: 'https://progetto.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-cloud',
  VITE_VAPID_PUBLIC_KEY: 'vapid-cloud',
  VITE_AI_DAILY_LIMIT: '5',
}
const NAS = 'https://bloodnas.esempio.ts.net:8443'

describe('leggiConfigurazione', () => {
  it('senza il server del NAS valgono quelle della build', () => {
    expect(leggiConfigurazione(undefined, BUILD, NAS)).toEqual({
      supabaseUrl: 'https://progetto.supabase.co',
      supabaseAnonKey: 'anon-cloud',
      vapidPublicKey: 'vapid-cloud',
      aiDailyLimit: 5,
    })
  })

  it('sul NAS Supabase sta sulla stessa origine della pagina, con la chiave del NAS', () => {
    expect(leggiConfigurazione({ supabaseAnonKey: 'anon-nas', vapidPublicKey: 'vapid-nas', aiDailyLimit: 10 }, BUILD, NAS)).toEqual({
      supabaseUrl: NAS,
      supabaseAnonKey: 'anon-nas',
      vapidPublicKey: 'vapid-nas',
      aiDailyLimit: 10,
    })
  })

  it('un indirizzo dato dal server vale quello', () => {
    expect(leggiConfigurazione({ supabaseAnonKey: 'k', supabaseUrl: 'https://altro' }, {}, NAS).supabaseUrl).toBe('https://altro')
  })

  it('un server senza chiave non mescola il suo indirizzo con la chiave della build', () => {
    const c = leggiConfigurazione({ supabaseUrl: 'https://altro' }, BUILD, NAS)
    expect([c.supabaseUrl, c.supabaseAnonKey]).toEqual(['https://progetto.supabase.co', 'anon-cloud'])
  })

  it('senza niente il tetto dell’AI è 3', () => {
    expect(leggiConfigurazione(undefined, {}, undefined).aiDailyLimit).toBe(3)
  })
})
