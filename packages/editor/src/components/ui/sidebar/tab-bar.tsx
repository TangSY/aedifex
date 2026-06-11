'use client'

import { startTransition, type ReactNode } from 'react'
import { triggerSFX } from './../../../lib/sfx-bus'
import { cn } from './../../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/tooltip'

export type SidebarTab = {
  id: string
  label: string
  mobileDefaultSnap?: number
  mobileIcon?: ReactNode
  /** Desktop icon shown in the vertical rail (v2 layout). */
  icon?: ReactNode
}

interface TabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-border/50 border-b px-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            className={cn(
              'relative h-7 rounded-md px-3 font-medium text-sm transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            key={tab.id}
            // 同 IconRail：tab 切换可能触发重组件挂载；SFX 在 transition 外同步触发
            onClick={() => {
              triggerSFX('sfx:menu-click')
              startTransition(() => onTabChange(tab.id))
            }}
            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
            type="button"
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface IconRailProps {
  tabs: SidebarTab[]
  /** Highlighted tab. Stays highlighted while the panel is collapsed. */
  activeTab: string
  /** True when the panel beside the rail is collapsed. */
  collapsed: boolean
  /** Clicking a rail icon: switch tab, or toggle the panel (see layout). */
  onIconClick: (id: string) => void
}

/**
 * Vertical icon rail for the v2 left column. Always visible (even when the
 * panel is collapsed) so the user can reopen the panel by clicking an icon.
 * The label renders as a hover tooltip on the right.
 */
export function IconRail({ tabs, activeTab, collapsed, onIconClick }: IconRailProps) {
  return (
    <TooltipProvider delayDuration={0} disableHoverableContent>
      <div className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-border/50 border-r py-2">
        {tabs.map((tab) => {
          // Only show the active highlight while the panel is open. When
          // collapsed nothing is "open", so every icon reads as unselected.
          const showActive = activeTab === tab.id && !collapsed
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'group flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 [&_img]:transition-[opacity,filter] [&_img]:duration-200',
                    showActive
                      ? 'bg-accent text-foreground shadow-sm [&_img]:opacity-100 [&_img]:grayscale-0'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground [&_img]:opacity-60 [&_img]:grayscale hover:[&_img]:opacity-100 hover:[&_img]:grayscale-0',
                  )}
                  // startTransition: tab 切换会触发 panel 折叠/展开 + 重新挂载
                  // 下游 R3F scene + AI 面板（首挂载时建 zustand store、读
                  // persisted localStorage、计算 catalog summary），整链同步执行
                  // 会让按钮点击 INP 长达 ~700ms。把状态更新标记为 transition，
                  // 让 React 在下一帧绘制按钮 hover/active 反馈，再异步推进
                  // 沉重的下游 render，按钮点击 INP 应回到 <100ms。
                  // SFX 在 transition 外同步触发，保证音效即时。
                  onClick={() => {
                    triggerSFX('sfx:menu-click')
                    startTransition(() => onIconClick(tab.id))
                  }}
                  onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                  type="button"
                >
                  {tab.icon ?? tab.label.charAt(0)}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tab.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
