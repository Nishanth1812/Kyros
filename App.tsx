import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { TransactionsProvider } from './src/state/TransactionsContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <TransactionsProvider>
        <StatusBar style="dark" />
        <AppNavigator />
      </TransactionsProvider>
    </SafeAreaProvider>
  );
}
