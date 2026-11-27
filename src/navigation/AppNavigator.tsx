import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Text } from 'react-native';

import AddTransactionScreen from '../screens/AddTransactionScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import CategoryManagementScreen from '../screens/CategoryManagementScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DataManagementScreen from '../screens/DataManagementScreen';
import FinancialGoalsScreen from '../screens/FinancialGoalsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import RecurringTransactionsScreen from '../screens/RecurringTransactionsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/ThemeContext';
import {
  PRIMARY_TAB_ROUTES,
  type RootStackParamList,
  type RootTabParamList,
} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const tabIcons: Record<(typeof PRIMARY_TAB_ROUTES)[number], string> = {
  Dashboard: '▦',
  Add: '＋',
  History: '◷',
  Budgets: '◈',
};

function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 6,
        },
        tabBarIcon: ({ color, size, focused }) => (
          <Text
            style={{ color, fontSize: size, fontWeight: focused ? '700' : '400' }}
          >
            {tabIcons[route.name]}
          </Text>
        ),
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarAccessibilityLabel: 'Dashboard tab, view financial summary' }}
      />
      <Tab.Screen
        name="Add"
        component={AddTransactionScreen}
        options={{ tabBarAccessibilityLabel: 'Add transaction tab, record income or expense' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarAccessibilityLabel: 'Transaction history tab, browse and filter transactions' }}
      />
      <Tab.Screen
        name="Budgets"
        component={BudgetsScreen}
        options={{ tabBarAccessibilityLabel: 'Monthly budgets tab, set and track spending limits' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { colors, isDark } = useTheme();

  const navigationTheme = useMemo<Theme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.expense,
      },
    };
  }, [colors, isDark]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          // Secondary screens own their headers and back controls; the native
          // stack still supplies Android system Back and gesture behavior.
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Data" component={DataManagementScreen} />
        <Stack.Screen
          name="RecurringTransactions"
          component={RecurringTransactionsScreen}
        />
        <Stack.Screen name="FinancialGoals" component={FinancialGoalsScreen} />
        <Stack.Screen
          name="CategoryManagement"
          component={CategoryManagementScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
