import type { CollectionSchema, ColumnDefinition } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
const readOnly = { read: true, create: false, update: false, delete: false }
const privateAccess = { ...readOnly, read: false }
const numerical = (name: string): ColumnDefinition => ({
  name,
  storage: 'number',
  interpretation: 'plain',
  required: true,
})
const text = (name: string, maxLength: number): ColumnDefinition => ({
  name,
  storage: 'text',
  interpretation: 'plain',
  maxLength,
})
export const schemas: CollectionSchema[] = [
  usersSchema,
  {
    name: 'access',
    uniqueOn: ['slot'],
    columns: [
      { ...text('slot', 12), required: true },
      { ...text('ownerHash', 64), required: true },
    ],
    permissions: {
      '*': privateAccess,
      viewer: privateAccess,
      member: privateAccess,
      admin: privateAccess,
    },
  },
  {
    name: 'releases',
    uniqueOn: ['revision'],
    columns: [
      numerical('revision'),
      numerical('percent'),
      numerical('previous'),
      numerical('target'),
      text('kind', 12),
      text('note', 160),
      text('requestId', 36),
    ],
    permissions: {
      '*': readOnly,
      viewer: readOnly,
      member: readOnly,
      admin: readOnly,
    },
  },
]
