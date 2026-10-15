import Modal from './Modal'
import ScegliPassword from './ScegliPassword'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'

// Si è entrati dal link di «Password dimenticata?»: Supabase fa entrare, ma la
// password resta quella di prima (o nessuna, per chi entrava con Google). Si
// chiede subito la nuova, in qualunque pagina il link abbia portato: senza,
// alla prossima uscita si sarebbe di nuovo fuori.
export default function RecuperoPassword() {
  const { recuperoPassword, fineRecuperoPassword, cambiaPassword } = useAuth()
  const { showToast } = useToast()
  if (!recuperoPassword) return null
  return (
    <Modal title="Scegli la password nuova" onClose={fineRecuperoPassword}>
      <p className="mb-4 text-sm text-zinc-400">
        Sei entrato dal link dell’email. Scegli la password con cui entrerai d’ora in poi, insieme alla tua email.
      </p>
      <ScegliPassword
        onSalva={cambiaPassword}
        onFatto={() => {
          // La finestra si chiude: il «salvata» lo dice un avviso che resta.
          fineRecuperoPassword()
          showToast('Password salvata: d’ora in poi entri con la tua email e questa password.', 'success')
        }}
      />
    </Modal>
  )
}
