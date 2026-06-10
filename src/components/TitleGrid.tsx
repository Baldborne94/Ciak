import type { TmdbTitle } from '@/types'
import TitleCard from './TitleCard'

interface Props {
  titles: TmdbTitle[]
}

export default function TitleGrid({ titles }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {titles.map((t) => (
        <TitleCard key={`${t.media_type}-${t.id}`} title={t} />
      ))}
    </div>
  )
}
