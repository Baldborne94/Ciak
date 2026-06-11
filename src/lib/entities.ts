import { supabase } from './supabase'
import type { EntityType, SavedEntity } from './types'

const TABLE = 'user_entities'

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

export interface EntityRef {
  entityType: EntityType
  entityId: number
  name: string
  imagePath: string | null
  subtitle: string | null
}

export async function getEntity(
  userId: string,
  entityType: EntityType,
  entityId: number,
): Promise<SavedEntity | null> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as SavedEntity | null
}

export async function addEntity(userId: string, ref: EntityRef): Promise<SavedEntity> {
  const { data, error } = await client()
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        entity_type: ref.entityType,
        entity_id: ref.entityId,
        name: ref.name,
        image_path: ref.imagePath,
        subtitle: ref.subtitle,
      },
      { onConflict: 'user_id,entity_type,entity_id' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as SavedEntity
}

export async function removeEntity(
  userId: string,
  entityType: EntityType,
  entityId: number,
): Promise<void> {
  const { error } = await client()
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)

  if (error) throw new Error(error.message)
}

export async function listEntities(
  userId: string,
  entityType: EntityType,
): Promise<SavedEntity[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as SavedEntity[]
}
