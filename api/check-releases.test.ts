import { describe, it, expect } from 'vitest'
import { cronAuthError } from './check-releases'

// Questo endpoint scrive nel database con la chiave service_role (aggira la
// RLS) e manda notifiche a tutti gli utenti. L'autorizzazione è l'unica cosa
// che lo separa da chiunque: merita test propri.

const SEGRETO = 'segreto-del-cron'

describe('cronAuthError', () => {
  it('lascia passare la richiesta del cron con il segreto giusto', () => {
    expect(cronAuthError(SEGRETO, `Bearer ${SEGRETO}`)).toBeNull()
  })

  it('rifiuta quando il segreto non è configurato, invece di aprire a tutti', () => {
    // Il bug che questo test blocca: prima l'autorizzazione era condizionata
    // alla presenza del segreto, quindi una variabile dimenticata su Vercel
    // lasciava l'endpoint aperto in silenzio.
    expect(cronAuthError(undefined, `Bearer ${SEGRETO}`)?.status).toBe(503)
    expect(cronAuthError('', `Bearer ${SEGRETO}`)?.status).toBe(503)
  })

  it('rifiuta una richiesta senza intestazione', () => {
    expect(cronAuthError(SEGRETO, undefined)?.status).toBe(401)
  })

  it('rifiuta un segreto sbagliato', () => {
    expect(cronAuthError(SEGRETO, 'Bearer sbagliato')?.status).toBe(401)
  })

  it('non accetta il segreto senza lo schema Bearer', () => {
    expect(cronAuthError(SEGRETO, SEGRETO)?.status).toBe(401)
  })

  it('non si lascia ingannare da un segreto che è solo un prefisso', () => {
    expect(cronAuthError(SEGRETO, `Bearer ${SEGRETO}-in-piu`)?.status).toBe(401)
    expect(cronAuthError(SEGRETO, 'Bearer segreto')?.status).toBe(401)
  })

  it('gestisce l intestazione ripetuta prendendo la prima', () => {
    expect(cronAuthError(SEGRETO, [`Bearer ${SEGRETO}`, 'Bearer altro'])).toBeNull()
    expect(cronAuthError(SEGRETO, ['Bearer sbagliato'])?.status).toBe(401)
  })

  it('il messaggio a segreto mancante dice cosa configurare', () => {
    // Se il cron smette di partire, il motivo dev'essere leggibile subito.
    expect(cronAuthError(undefined, undefined)?.error).toContain('CRON_SECRET')
  })
})
