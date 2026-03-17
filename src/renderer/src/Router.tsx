import '@renderer/databases'

import type { FC } from 'react'
import { useMemo } from 'react'
import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import Sidebar from './components/app/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import ModelGuidePage from './components/Guide/ModelGuidePage'
import TabsContainer from './components/Tab/TabContainer'
import { BrainstormPage, BrainstormProvider } from './features/brainstorm'
import NavigationHandler from './handler/NavigationHandler'
import { useModelAvailability } from './hooks/useModelAvailability'
import { useNavbarPosition } from './hooks/useSettings'
import { cleanupProviders } from './store/llm'
import { useAppDispatch } from './store'
import CodeToolsPage from './pages/code/CodeToolsPage'
import FilesPage from './pages/files/FilesPage'
import HomePage from './pages/home/HomePage'
import KnowledgePage from './pages/knowledge/KnowledgePage'
import LaunchpadPage from './pages/launchpad/LaunchpadPage'
import MinAppPage from './pages/minapps/MinAppPage'
import MinAppsPage from './pages/minapps/MinAppsPage'
import NotesPage from './pages/notes/NotesPage'
import OpenClawPage from './pages/openclaw/OpenClawPage'
import PaintingsRoutePage from './pages/paintings/PaintingsRoutePage'
import SettingsPage from './pages/settings/SettingsPage'
import AssistantPresetsPage from './pages/store/assistants/presets/AssistantPresetsPage'
import TranslatePage from './pages/translate/TranslatePage'

const Router: FC = () => {
  const { navbarPosition } = useNavbarPosition()
  const { isModelAvailable } = useModelAvailability()
  const dispatch = useAppDispatch()
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    return localStorage.getItem('cherry_studio_onboarded') === 'true'
  })

  // 每次启动时清理已废弃的系统 Provider
  useEffect(() => {
    dispatch(cleanupProviders())
  }, [dispatch])

  // 如果模型不可用，且不在设置页面，则强制显示引导页
  const showGuide = !isOnboarded || !isModelAvailable

  useEffect(() => {
    if (isModelAvailable && !isOnboarded) {
      localStorage.setItem('cherry_studio_onboarded', 'true')
      setIsOnboarded(true)
    }
  }, [isModelAvailable, isOnboarded])

  const routes = useMemo(() => {
    if (showGuide) {
      return (
        <Routes>
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<ModelGuidePage />} />
        </Routes>
      )
    }

    return (
      <ErrorBoundary>
        <BrainstormProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/store" element={<AssistantPresetsPage />} />
            <Route path="/paintings/*" element={<PaintingsRoutePage />} />
            <Route path="/translate" element={<TranslatePage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/apps/:appId" element={<MinAppPage />} />
            <Route path="/apps" element={<MinAppsPage />} />
            <Route path="/code" element={<CodeToolsPage />} />
            <Route path="/openclaw" element={<OpenClawPage />} />
            <Route path="/brainstorm" element={<BrainstormPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="/launchpad" element={<LaunchpadPage />} />
          </Routes>
        </BrainstormProvider>
      </ErrorBoundary>
    )
  }, [showGuide])

  if (navbarPosition === 'left') {
    return (
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar />
        {routes}
        <NavigationHandler />
      </HashRouter>
    )
  }

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavigationHandler />
      <TabsContainer>{routes}</TabsContainer>
    </HashRouter>
  )
}

export default Router
