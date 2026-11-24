import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { TransactionsProvider } from './src/state/TransactionsContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TransactionsProvider>
          <ThemedStatusBar />
          <AppNavigator />
        </TransactionsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
