import { t } from 'i18next'
import { showButtonToast } from '@/lib/toast'
import { mainClient } from '../ipc/main'

/** A finished-download toast, with a button that reveals the file in its folder. */
export function showDownloadToast(msg: string, filePath: string) {
  showButtonToast(msg, t('native.toast_openFolder'), () => void mainClient.showItemInFolder(filePath))
}
