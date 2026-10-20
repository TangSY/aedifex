import { getArtifactStore } from '@aedifex/core'
import {
  EMPTY_SESSION,
  keepInSession,
  type SessionKeep,
  type SessionRecord,
} from '@aedifex/core/agent-operations'
import { useViewer } from '@aedifex/viewer'
import { useAIChat } from './ai-chat-store'

let active:
  | {
      store: ReturnType<typeof getArtifactStore>
      project: string | null
      conversation: string | undefined
      record: SessionRecord
    }
  | undefined

export function sharedAgentSession() {
  const store = getArtifactStore()
  const project = useViewer.getState().projectId
  const conversation = useAIChat.getState().messages[0]?.id
  if (
    !active ||
    active.store !== store ||
    active.project !== project ||
    active.conversation !== conversation
  ) {
    active = { store, project, conversation, record: EMPTY_SESSION }
  }
  const session = active
  return {
    record: session.record,
    keep: (keep: SessionKeep) => {
      session.record = keepInSession(session.record, keep)
    },
    reset: () => {
      session.record = EMPTY_SESSION
    },
  }
}
