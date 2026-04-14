import type { GlobalThemeOverrides } from 'naive-ui'

// ☀️ Light Theme - Pure Ink (original)
export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#333333',
    primaryColorHover: '#1a1a1a',
    primaryColorPressed: '#000000',
    primaryColorSuppl: '#333333',
    bodyColor: '#fafafa',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    tableColor: '#ffffff',
    inputColor: '#ffffff',
    actionColor: '#f0f0f0',
    textColorBase: '#1a1a1a',
    textColor1: '#1a1a1a',
    textColor2: '#666666',
    textColor3: '#999999',
    dividerColor: '#e0e0e0',
    borderColor: '#e0e0e0',
    hoverColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontSize: '14px',
    fontSizeMedium: '14px',
    heightMedium: '36px',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontFamilyMono: 'JetBrains Mono, Fira Code, Consolas, monospace',
  },
  Layout: {
    color: '#fafafa',
    siderColor: '#f5f5f5',
    headerColor: '#fafafa',
  },
  Menu: {
    itemTextColorActive: '#1a1a1a',
    itemTextColorActiveHover: '#1a1a1a',
    itemTextColorChildActive: '#1a1a1a',
    itemIconColorActive: '#1a1a1a',
    itemIconColorActiveHover: '#000000',
    itemColorActive: 'rgba(0, 0, 0, 0.06)',
    itemColorActiveHover: 'rgba(0, 0, 0, 0.1)',
    arrowColorActive: '#1a1a1a',
  },
  Button: {
    textColorPrimary: '#ffffff',
    colorPrimary: '#333333',
    colorHoverPrimary: '#1a1a1a',
    colorPressedPrimary: '#000000',
  },
  Input: {
    color: '#ffffff',
    colorFocus: '#ffffff',
    border: '1px solid #e0e0e0',
    borderHover: '1px solid #999999',
    borderFocus: '1px solid #333333',
    placeholderColor: '#999999',
    caretColor: '#1a1a1a',
  },
  Card: {
    color: '#ffffff',
    borderColor: '#e0e0e0',
  },
  Modal: {
    color: '#ffffff',
  },
  Tag: {
    borderRadius: '6px',
  },
}

// 🌙 Dark Theme - Linear-grade Professional
export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6366f1',
    primaryColorHover: '#818cf8',
    primaryColorPressed: '#4f46e5',
    primaryColorSuppl: '#6366f1',
    bodyColor: '#09090b',
    cardColor: '#18181b',
    modalColor: '#18181b',
    popoverColor: '#18181b',
    tableColor: '#18181b',
    inputColor: '#09090b',
    actionColor: '#27272a',
    textColorBase: '#fafafa',
    textColor1: '#fafafa',
    textColor2: '#a1a1aa',
    textColor3: '#71717a',
    dividerColor: '#27272a',
    borderColor: '#27272a',
    hoverColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    fontSize: '14px',
    fontSizeMedium: '14px',
    heightMedium: '36px',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontFamilyMono: 'JetBrains Mono, Fira Code, Consolas, monospace',
  },
  Layout: {
    color: '#09090b',
    siderColor: '#0c0c0e',
    headerColor: '#09090b',
  },
  Menu: {
    itemTextColorActive: '#6366f1',
    itemTextColorActiveHover: '#818cf8',
    itemTextColorChildActive: '#6366f1',
    itemIconColorActive: '#6366f1',
    itemIconColorActiveHover: '#818cf8',
    itemColorActive: 'rgba(99, 102, 241, 0.1)',
    itemColorActiveHover: 'rgba(99, 102, 241, 0.15)',
    arrowColorActive: '#6366f1',
  },
  Button: {
    textColorPrimary: '#ffffff',
    colorPrimary: '#6366f1',
    colorHoverPrimary: '#818cf8',
    colorPressedPrimary: '#4f46e5',
  },
  Input: {
    color: '#fafafa',
    colorFocus: '#fafafa',
    border: '1px solid #27272a',
    borderHover: '1px solid #3f3f46',
    borderFocus: '1px solid #6366f1',
    placeholderColor: '#71717a',
    caretColor: '#fafafa',
  },
  Card: {
    color: '#18181b',
    borderColor: '#27272a',
  },
  Modal: {
    color: '#18181b',
  },
  Tag: {
    borderRadius: '6px',
  },
}

// Exporta o tema ativo baseado em preferência do sistema ou armazenada
export const getThemeOverrides = (): GlobalThemeOverrides => {
  // Tenta obter do localStorage
  const savedTheme = localStorage.getItem('hermes-theme')
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme === 'dark' ? darkThemeOverrides : lightThemeOverrides
  }

  // Verifica preferência do sistema
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return darkThemeOverrides
  }

  // Padrão: light theme (mantém compatibilidade)
  return lightThemeOverrides
}