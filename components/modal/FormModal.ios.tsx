import { Button, Host, NavigationStack, RNHostView, Toolbar, ToolbarItem } from '@expo/ui/swift-ui'
import { disabled, navigationBarTitleDisplayMode, navigationTitle } from '@expo/ui/swift-ui/modifiers'
import { Modal, ScrollView } from 'react-native'
import { t } from 'i18next'
import type { FormModalProps } from './FormModal'

export const FormModal = ({ title, onClose, onSubmit, submitLabel, submitDisabled, children }: FormModalProps) => (
  <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <Host style={{ flex: 1 }}>
      <NavigationStack>
        <Toolbar modifiers={[navigationTitle(title), navigationBarTitleDisplayMode('inline')]}>
          <RNHostView>
            <ScrollView
              className="flex-1 bg-zinc-100 dark:bg-zinc-950"
              contentContainerClassName="p-4"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
            >
              {children}
            </ScrollView>
          </RNHostView>
          <Toolbar.Content>
            <ToolbarItem placement="cancellationAction">
              <Button label={t('buttons.cancel')} onPress={onClose} />
            </ToolbarItem>
            <ToolbarItem placement="confirmationAction">
              <Button label={submitLabel} onPress={onSubmit} modifiers={[disabled(!!submitDisabled)]} />
            </ToolbarItem>
          </Toolbar.Content>
        </Toolbar>
      </NavigationStack>
    </Host>
  </Modal>
)
