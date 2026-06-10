interface Props {
  label?: string
}

/** Bobina di pellicola che gira — loader a tema. */
export default function Spinner({ label = 'Carico la pellicola…' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-zinc-500">
      <div className="relative h-12 w-12 animate-spin">
        <div className="absolute inset-0 rounded-full border-2 border-cinema-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold" />
        <div className="absolute inset-[38%] rounded-full bg-gold" />
      </div>
      <p className="text-sm">{label}</p>
    </div>
  )
}
