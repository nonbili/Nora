import type { ReactNode } from 'react'
import { View } from 'react-native'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'

export interface FormModalProps {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  children: ReactNode
}

export const FormModal = ({ title, onClose, onSubmit, submitLabel, submitDisabled, children }: FormModalProps) => (
  <BaseCenterModal onClose={onClose}>
    <View className="w-full p-4" style={{ flexShrink: 1 }}>
      <NouText className="mb-4 text-lg font-bold">{title}</NouText>
      {children}
      <View className="mt-6 flex-row justify-end gap-3">
        <NouButton size="1" variant="outline" onPress={onClose}>
          {t('buttons.cancel')}
        </NouButton>
        <NouButton size="1" disabled={submitDisabled} onPress={onSubmit}>
          {submitLabel}
        </NouButton>
      </View>
    </View>
  </BaseCenterModal>
)
