import contentJs from 'nora/assets/scripts/main.bjs?raw'
import { MainPage } from 'nora/components/page/MainPage'
import { Toaster } from 'react-hot-toast'
import { useObserveEffect } from '@legendapp/state/react'
import { useEffect } from 'react'
import { initUiChannel } from './ipc/ui'

function App(): React.JSX.Element {
  useEffect(() => {
    initUiChannel()
  }, [])

  return (
    <>
      <MainPage contentJs={contentJs} />
      <Toaster position="bottom-right" />
    </>
  )
}
export default App
