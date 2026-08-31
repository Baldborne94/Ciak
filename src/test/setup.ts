import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library non smonta da sola fra un test e l'altro: senza questo, il
// secondo test troverebbe due copie dello stesso componente nel documento e i
// `getBy*` fallirebbero per ambiguità — un errore che sembra un bug del
// componente e non lo è.
afterEach(() => {
  cleanup()
})
