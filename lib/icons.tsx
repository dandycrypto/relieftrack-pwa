/**
 * Icon mapping — resolves string icon names from store to actual Lucide components.
 * Also re-exports all icons used across the app.
 */

import {
  Home, FileText, Plus, User, Camera, Upload, Search, Filter, ChevronRight,
  Check, Clock, Sun, Moon, Heart, Stethoscope, Users, GraduationCap,
  Smartphone, PiggyBank, Building, BadgeCheck, Info, BarChart3, PieChart,
  RefreshCw, ZoomIn, Settings, CloudOff, Bell, Shield, Globe, Palette,
  Calendar, Download, Trash2, HardDrive, AlertTriangle, ExternalLink,
  Fingerprint, CalendarClock, TrendingDown,
  type LucideIcon,
} from 'lucide-react'

export const ICON_MAP: Record<string, LucideIcon> = {
  Home, FileText, Plus, User, Camera, Upload, Search, Filter, ChevronRight,
  Check, Clock, Sun, Moon, Heart, Stethoscope, Users, GraduationCap,
  Smartphone, PiggyBank, Building, BadgeCheck, Info, BarChart3, PieChart,
  RefreshCw, ZoomIn, Settings, CloudOff, Bell, Shield, Globe, Palette,
  Calendar, Download, Trash2, HardDrive, AlertTriangle, ExternalLink,
  Fingerprint, CalendarClock, TrendingDown,
}

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || FileText
}

// Re-export all icons for convenience
export {
  Home, FileText, Plus, User, Camera, Upload, Search, Filter, ChevronRight,
  Check, Clock, Sun, Moon, Heart, Stethoscope, Users, GraduationCap,
  Smartphone, PiggyBank, Building, BadgeCheck, Info, BarChart3, PieChart,
  RefreshCw, ZoomIn, Settings, CloudOff, Bell, Shield, Globe, Palette,
  Calendar, Download, Trash2, HardDrive, AlertTriangle, ExternalLink,
  Fingerprint, CalendarClock, TrendingDown,
}
