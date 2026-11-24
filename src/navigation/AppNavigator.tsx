import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { useMemo } from 'react';
import { Text } from 'react-native';

import AddTransactionScreen from '../screens/AddTransactionScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DataManagementScreen from '../screens/DataManagementScreen';
import HistoryScreen from '../screens/HistoryScreen';
import { useTheme } from '../theme/ThemeContext';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const tabIcons: Record<keyof RootTabParamList, string> = {
  Dashboard: '▦',
  Add: '＋',
  History: '◷',
  Budgets: '◈',
  Data: '⛁',
};

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
        <Tab.Screen
          name="Data"
          component={DataManagementScreen}
          options={{ tabBarAccessibilityLabel: 'Data safety tab, backup and restore data' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
