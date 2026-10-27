import Toast from 'react-native-root-toast';
import { AccessibilityInfo, Appearance } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

export function showToast(msg: string) {
    const dark = Appearance.getColorScheme() === 'dark';
    AccessibilityInfo.announceForAccessibility(msg);
    Toast.show(msg, {
        duration: Toast.durations.SHORT,
        position: (initialWindowMetrics?.insets.top ?? 0) + 56,
        shadow: false,
        opacity: 1,
        backgroundColor: dark ? '#27272a' : '#f4f4f5',
        textColor: dark ? '#fafafa' : '#18181b',
        containerStyle: { borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: dark ? '#3f3f46' : '#d4d4d8' },
        animation: true,
        hideOnPress: true,
        delay: 0,
    });
}

export { showActionToast } from './action-toast'
