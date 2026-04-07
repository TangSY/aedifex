'use client'

import {
  AIChatPanel,
  Editor,
  type SidebarTab,
  ViewerToolbarLeft,
  ViewerToolbarRight,
} from '@aedifex/editor'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null, // Built-in SitePanel handles this
  },
  {
    id: 'ai',
    label: 'AI',
    component: AIChatPanel,
  },
]

export default function Home() {
  return (
    <div className="h-screen w-screen">
      <Editor
        layoutVersion="v2"
        projectId="local-editor"
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />
    </div>
  )
}
